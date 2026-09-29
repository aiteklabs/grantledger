import type { Grant } from "@grantledger/schema";
import { num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// UK "Find a grant" (GOV.UK), Open Government Licence v3. Server-rendered list, 10 grants per page, every field on the card.
const SITE = "https://www.find-government-grants.service.gov.uk";
const PAGE_SIZE = 10;
const LICENSE = "Open Government Licence v3.0 (Crown copyright)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

const REGION: [string, string][] = [
  ["england", "UKC-UKK"],
  ["scotland", "UKM"],
  ["wales", "UKL"],
  ["northern ireland", "UKN"],
];

interface Card { slug: string; title: string; description: string; fields: Record<string, string>; opens: string | null; closes: string | null }

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const li of html.match(/<li id="[^"]*"><h2 class="govuk-heading-m">[\s\S]*?<\/dl>/g) ?? []) {
    const slug = li.match(/href="\/grants\/([^"?#]+)"/)?.[1];
    if (!slug) continue;
    const title = stripHtml(li.match(/<a class="govuk-link"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? slug).trim();
    const description = stripHtml(li.match(/<p class="govuk-body"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
    const fields: Record<string, string> = {};
    for (const row of li.match(/<dt class="govuk-summary-list__value">([\s\S]*?)<\/dt><dd class="govuk-summary-list__value">([\s\S]*?)<\/dd>/g) ?? []) {
      const m = row.match(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/);
      if (m) fields[stripHtml(m[1]!).trim()] = m[2]!;
    }
    const epoch = (v: string | undefined) => {
      const ms = v?.match(/dateTime="(\d+)"/)?.[1];
      return ms ? new Date(Number(ms)).toISOString() : null;
    };
    cards.push({ slug, title, description, fields, opens: epoch(fields["Opening date"]), closes: epoch(fields["Closing date"]) });
  }
  return cards;
}

function money(text: string): { min: number | null; max: number | null } {
  const nums = [...text.matchAll(/£\s?([\d,.]+)\s*(million|billion|m|bn)?/gi)].map((m) => {
    const base = num(m[1]!.replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase();
    return base === null ? null : base * (unit.startsWith("b") ? 1e9 : unit.startsWith("m") ? 1e6 : 1);
  }).filter((n): n is number => n !== null);
  if (nums.length === 0) return { min: null, max: null };
  return { min: nums.length > 1 ? Math.min(...nums) : null, max: Math.max(...nums) };
}

function normalize(c: Card): Grant {
  const who = stripHtml(c.fields["Who can apply"] ?? "").toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (who.includes("private sector")) bens.add("company");
  if (who.includes("individual")) bens.add("individual");
  if (who.includes("public sector")) bens.add("public_body");
  if (who.includes("non profit") || who.includes("non-profit") || who.includes("charit")) bens.add("ngo");
  const location = stripHtml(c.fields["Location"] ?? "").toLowerCase();
  const regions = REGION.filter(([k]) => location.includes(k)).map(([, code]) => code);
  const award = money(stripHtml(c.fields["How much you can get"] ?? ""));
  const total = money(stripHtml(c.fields["Total size of grant scheme"] ?? ""));
  const now = new Date().toISOString();
  const status: Grant["status"] = c.closes && c.closes < now ? "closed" : c.opens && c.opens > now ? "forthcoming" : "open";
  return {
    id: `uk_find_a_grant:${c.slug}`,
    source: "uk_find_a_grant",
    source_id: c.slug,
    source_url: `${SITE}/grants/${c.slug}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: "en",
    summary: [c.description, ...Object.entries(c.fields).map(([k, v]) => `${k}: ${stripHtml(v).replace(/\s+/g, " ").trim()}`)].join("\n"),
    funder_name: stripHtml(c.fields["Funding organisation"] ?? "") || null,
    funder_level: regions.length === 4 || regions.length === 0 ? "national" : "regional",
    country: "GB",
    regions: regions.length === 4 ? [] : regions,
    funding_types: ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: award.min,
    amount_max: award.max,
    budget_total: total.max,
    currency: "GBP",
    status,
    opens_at: c.opens,
    closes_at: c.closes,
    documents: [],
    source_updated_at: null,
  };
}

export const ukFindAGrant: Source = {
  id: "uk_find_a_grant",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetch(`${SITE}/grants?skip=${(page - 1) * PAGE_SIZE}&limit=${PAGE_SIZE}&page=${page}`, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for UK list page ${page}`);
    const html = await res.text();
    const cards = parseCards(html);
    const total = Number(html.match(/of\s*(?:<[^>]+>)*\s*(\d+)\s*(?:<[^>]+>)*\s*grants/i)?.[1] ?? "0");
    const grants = cards.map(normalize);
    return { grants, raws: cards.map((c) => ({ source_id: c.slug, payload: c })), next: cards.length === PAGE_SIZE && page * PAGE_SIZE < (total || 1e6) ? String(page + 1) : null };
  },
};
