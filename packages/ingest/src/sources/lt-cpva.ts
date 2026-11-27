import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Lithuania, Centrinė projektų valdymo agentūra (CPVA, Central Project Management Agency): the calls it runs itself
// (state budget programmes, the Development Cooperation and Humanitarian Aid Fund, the Swiss-Lithuanian programme,
// the cybersecurity programme). https://cpva.lt/kvietimai is server-rendered, 10 calls per page (?sf_paged=N), newest
// first, each with programme, publication date, valid-until time and a status class (paskelbtas = published,
// planuojamas = planned, pasibaiges = ended). robots.txt disallows /wp-json/, so the HTML is read. The detail page of
// a call that is not over adds the funding amounts, conditions, how to apply and the call documents.
// Left out:
// - the calls of the internal security and border funds (programme "... Vidaus saugumo fondas"): invitations to
//   named state institutions, not open competitions;
// - entries that only link to esinvesticijos.lt (covered by lt_esinvesticijos; the link carries a session token);
// - the "Liko dienų" (days left) counter of the detail page, which changes daily.
// Cloudflare sits in front of the site; the grantledger user agent passed on 2026-11-14.
const LIST_URL = "https://cpva.lt/kvietimai";
const LICENSE = "CPVA public call information (cpva.lt)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const MAX_PAGES = 30;

interface Item { slug: string; url: string; title: string; programme: string; published: string; validUntil: string; state: string }
interface Detail { funding: string; text: string; documents: Grant["documents"] }

const clean = (s: string) => stripHtml(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();

function parseList(html: string): Item[] {
  const out: Item[] = [];
  for (const block of html.split('data-elementor-type="loop-item"').slice(1)) {
    const link = block.match(/class="cpva-invitation-box[^"]*" href="(https:\/\/cpva\.lt\/kvietimai\/([^"/?#]+))\/?"/);
    const programme = clean(block.match(/cpva-invitation-box__program">([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!link || /Vidaus saugumo fondas/i.test(programme)) continue;
    out.push({
      slug: link[2]!,
      url: link[1]!,
      title: clean(block.match(/cpva-invitation-box__title">([\s\S]*?)<\/div>/)?.[1] ?? ""),
      programme,
      published: clean(block.match(/cpva-invitation-box__published">([\s\S]*?)<\/div>/)?.[1] ?? ""),
      validUntil: clean(block.match(/cpva-invitation-box__valid-until">([\s\S]*?)<\/div>/)?.[1] ?? ""),
      state: block.slice(0, 400).match(/kvietimo-busena-([a-z]+)/)?.[1] ?? "",
    });
  }
  return out.filter((i) => i.title);
}

// "2026-11-26 17:00" in Lithuanian local time, stored as-is with a Z suffix like the other Lithuanian adapters.
function toIsoLt(value: string): string | null {
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00.000Z` : null;
}

// "46 000 000,00 Eur", "850 000 Eur", "1000 000 EUR"
const euros = (v: string | undefined) => (v ? num(v.replace(/\s/g, "").replace(",", ".")) : null);

function status(i: Item): Grant["status"] {
  if (i.state === "pasibaiges") return "closed";
  const closes = toIsoLt(i.validUntil);
  if (closes && closes < new Date().toISOString()) return "closed";
  return i.state === "planuojamas" ? "forthcoming" : i.state === "paskelbtas" ? "open" : statusFromDates(toIsoLt(i.published), closes);
}

async function detail(url: string): Promise<Detail> {
  const html = await fetchHtml(url, UA);
  const from = html.indexOf("</h1>");
  const to = html.indexOf('data-elementor-type="footer"', from);
  const region = (from < 0 ? "" : html.slice(from, to < 0 ? undefined : html.lastIndexOf("<", to)))
    // The days-left counter changes every day.
    .replace(/<p class="cpva-paragraph__short-description[^"]*">\s*Liko dienų\s*<\/p>[\s\S]*?<h3>[^<]*<\/h3>/, " ")
    // Side panel: a label paragraph followed by its value paragraph, joined into "label: value".
    .replace(/<p class="cpva-paragraph__short-description[^"]*style-4">([^<]*)<\/p>(?:(?!style-4">)[\s\S])*?<p class="cpva-paragraph__short-description[^"]*style-5">/g, "<p>$1: ");
  const documents: Grant["documents"] = [];
  for (const m of region.matchAll(/<a\b[^>]*href="([^"]*\/wp-content\/uploads\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const title = clean(m[2]!);
    let file: string;
    try { file = new URL(decodeEntities(m[1]!), LIST_URL).href; } catch { continue; }
    if (title && file.startsWith("https://") && !documents.some((d) => d.url === file)) documents.push({ title, url: file });
  }
  const text = stripHtml(region).replace(/ /g, " ").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  return { funding: text.match(/^Finansavimo suma: ([^\n]*(?:\n(?![^\n]{0,40}:)[^\n]*){0,3})/m)?.[1] ?? "", text, documents: documents.slice(0, 40) };
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/savivaldyb|valstybės institucij|biudžetin|viešojo sektoriaus/.test(t)) out.add("public_body");
  if (/versl|įmon|juridiniai asmenys/.test(t)) out.add("company");
  if (/nevyriausybin|\bnvo\b|asociacij|pilietinės visuomenės/.test(t)) out.add("ngo");
  if (/mokslo ir studijų|universitet|tyrimų/.test(t)) out.add("research_org");
  return [...out];
}

function normalize(i: Item, d: Detail | null): Grant {
  const closes = toIsoLt(i.validUntil);
  const published = toIsoLt(i.published);
  const state = status(i);
  // The publication date stands in for the opening date of a published call; a planned call has none yet.
  const opens = state !== "forthcoming" && published && (!closes || published <= closes) ? published : null;
  const text = d?.text ?? "";
  const budget = d?.funding.match(/^([\d\s]+(?:,\d+)?)\s*Eur/i)?.[1] ?? d?.funding.match(/Bendra[^.\d]*?([\d\s]+(?:,\d+)?)\s*Eur/i)?.[1] ?? text.match(/Bendra kvietimui skirta[^\d\n]*\n?:?\s*([\d\s]+(?:,\d+)?)\s*Eur/i)?.[1];
  const range = text.match(/vienam projektui[^.\d]*?nuo ([\d\s]+) iki ([\d\s]+)\s*Eur/i);
  const applicants = text.match(/Galimi pareiškėjai:?\s*([^\n]*(?:\n[^\n]*)?)/)?.[1] ?? "";
  return {
    id: `lt_cpva:${i.slug}`,
    source: "lt_cpva",
    source_id: i.slug,
    source_url: i.url,
    source_license: LICENSE,
    title: i.title,
    title_lang: "lt",
    summary: [
      i.published ? `Paskelbta: ${i.published}` : "",
      d ? text : [i.programme ? `Programa: ${i.programme}` : "", i.validUntil ? `Galioja iki: ${i.validUntil}` : ""].filter(Boolean).join("\n"),
    ].filter(Boolean).join("\n").slice(0, 20000) || null,
    funder_name: "Centrinė projektų valdymo agentūra",
    funder_level: "national",
    country: "LT",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(`${i.title} ${applicants}`),
    sectors: [],
    amount_min: euros(range?.[1] ?? text.match(/Mažiausia projektui[^.\d]{0,160}?([\d\s]+(?:,\d+)?)\s*Eur/i)?.[1]),
    amount_max: euros(range?.[2] ?? text.match(/Didžiausia projektui[^.\d]{0,160}?([\d\s]+(?:,\d+)?)\s*Eur/i)?.[1]),
    budget_total: euros(budget),
    currency: "EUR",
    status: state,
    opens_at: opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: null,
  };
}

export const ltCpva: Source = {
  id: "lt_cpva",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const html = await fetchHtml(page > 1 ? `${LIST_URL}?sf_paged=${page}` : LIST_URL, UA);
    if (page === 1 && !html.includes('data-elementor-type="loop-item"')) throw new Error("CPVA call list returned no calls (bot challenge or layout change?)");
    const items = parseList(html);
    const details = await mapLimit(items, 2, (i) => (status(i) === "closed" ? Promise.resolve(null) : detail(i.url)));
    const last = Math.min(Number(html.match(/data-max-page="(\d+)"/)?.[1] ?? 1), MAX_PAGES);
    return {
      grants: items.map((i, n) => normalize(i, details[n] ?? null)),
      raws: items.map((i, n) => ({ source_id: i.slug, payload: { item: i, text: details[n]?.text ?? null } })),
      next: page < last ? String(page + 1) : null,
    };
  },
};
