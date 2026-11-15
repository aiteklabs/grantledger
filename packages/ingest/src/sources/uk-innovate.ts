import type { Grant } from "@grantledger/schema";
import { londonIso, mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// UK, Innovate UK Innovation Funding Service: the competitions a business or research organisation can apply to
// (grants, SBRI procurement contracts, loans). The competition search is server-rendered, 10 per page (?page=0..),
// and lists only competitions that are open or opening soon (about 25). Each competition overview page holds the
// description, eligibility, scope, dates and how to apply: 11 requests per fetchPage. The overview URL needs the
// hash segment printed in the list (the bare /competition/<id>/overview answers 403); the hash is fixed per
// competition. The service has no robots.txt (the path redirects to the login page). Dates are UK wall-clock times.
const SITE = "https://apply-for-innovation-funding.service.gov.uk";
const LICENSE = "Open Government Licence v3.0 (Innovate UK, UK Research and Innovation)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PANEL_MAX = 6000;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

interface Card { id: string; path: string; title: string; description: string; eligibility: string; state: string; opens: string; closes: string }
interface Detail { opens: string; closes: string; panels: { id: string; html: string; text: string }[] }

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/[ \t]*\n\s*/g, "\n").trim();
const oneLine = (html: string) => clean(html).replace(/\s+/g, " ");

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const li of html.match(/<li>\s*<h2 class="govuk-heading-m[\s\S]*?<\/dl>/g) ?? []) {
    const link = li.match(/href="(\/competition\/(\d+)\/overview[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const blocks = [...li.matchAll(/<div class="wysiwyg-styles[^"]*">([\s\S]*?)<\/div>/g)].map((m) => clean(m[1] as string));
    const date = (label: string) => oneLine(li.match(new RegExp(`<dt>${label}:</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`))?.[1] ?? "");
    cards.push({
      id: link[2] as string,
      path: link[1] as string,
      title: oneLine(link[3] as string),
      description: blocks[0] ?? "",
      eligibility: blocks[1] ?? "",
      state: oneLine([...li.matchAll(/<h3 class="govuk-heading-s[^"]*">([\s\S]*?)<\/h3>/g)].map((m) => m[1] as string).filter((t) => !/Eligibility/.test(t))[0] ?? ""),
      opens: date("Opens") || date("Opened"),
      closes: date("Closes"),
    });
  }
  return cards;
}

function parseDetail(html: string): Detail {
  const main = html.slice(html.indexOf('id="main-content"'));
  const line = (label: string) => oneLine(main.match(new RegExp(`<strong>${label}:</strong>([\\s\\S]*?)</li>`))?.[1] ?? "");
  const panels = [...main.matchAll(/<section class="govuk-tabs__panel" id="([^"]+)">([\s\S]*?)<\/section>/g)].map((m) => ({ id: m[1] as string, html: m[2] as string, text: clean(m[2] as string) }));
  return { opens: line("Competition opens"), closes: line("Competition closes"), panels };
}

async function detail(path: string): Promise<Detail | null> {
  const res = await fetch(`${SITE}${path}`, { headers: UA, redirect: "follow" });
  if (!res.ok) return null;
  const d = parseDetail(await res.text());
  return d.panels.length ? d : null;
}

// "Thursday 28 January 2027 11:00am" or "28 January 2027". Without a time the fallback hour applies.
function ukTime(text: string, hour: number, minute: number): string | null {
  const m = text.match(/(\d{1,2}) ([A-Za-z]+) (\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?/);
  const month = m ? MONTHS.indexOf((m[2] as string).toLowerCase()) : -1;
  if (!m || month === -1) return null;
  if (!m[4]) return londonIso(Number(m[3]), month, Number(m[1]), hour, minute);
  return londonIso(Number(m[3]), month, Number(m[1]), (Number(m[4]) % 12) + (m[6] === "pm" ? 12 : 0), Number(m[5]));
}

// "£28 million", "£750,000", "£1.5m".
function pounds(text: string): number[] {
  return [...text.matchAll(/£\s?([\d,.]*\d)\s*(million|billion|m\b|bn\b|k\b)?/gi)].map((m) => {
    const base = num((m[1] as string).replace(/,/g, "")) ?? 0;
    const unit = (m[2] ?? "").toLowerCase();
    return base * (unit.startsWith("b") ? 1e9 : unit.startsWith("m") ? 1e6 : unit === "k" ? 1e3 : 1);
  }).filter((n) => n > 0);
}

// One row of a panel: the text under a given heading ("Funding type", "Project size").
function row(panel: string | undefined, heading: string): string {
  return oneLine(panel?.match(new RegExp(`<h2[^>]*>\\s*${heading}\\s*</h2>([\\s\\S]*?)(?=<h2|$)`))?.[1] ?? "");
}

function fundingTypes(text: string): Grant["funding_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["funding_types"][number]>();
  // An investor partnership is a grant next to private investment, a Knowledge Transfer Partnership is grant funded.
  if (/grant|investor|knowledge transfer/.test(t)) out.add("grant");
  if (/loan/.test(t)) out.add("loan");
  if (/procurement|contract|sbri/.test(t)) out.add("procurement");
  if (/investor|equity/.test(t)) out.add("equity");
  if (/prize/.test(t)) out.add("prize");
  if (t && out.size === 0) out.add("other");
  return [...out];
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/business|compan|organisations? of any size/.test(t)) out.add("company");
  if (/\bsmes?\b|small (and|or) medium|micro, small|micro or small/.test(t)) out.add("sme");
  if (/start-?ups?\b/.test(t)) out.add("startup");
  if (/research (and technology )?organisation|\brtos?\b|academic|universit|research institut/.test(t)) out.add("research_org");
  if (/charit|not[- ]for[- ]profit|third sector/.test(t)) out.add("ngo");
  if (/public sector|local authorit|public bod/.test(t)) out.add("public_body");
  return [...out];
}

function normalize(c: Card, d: Detail | null): Grant {
  const opens = ukTime(d?.opens || c.opens, 0, 0);
  const closes = ukTime(d?.closes || c.closes, 23, 59);
  const state = c.state.toLowerCase();
  const status: Grant["status"] = closes && closes < new Date().toISOString() ? "closed" : state.includes("opening soon") ? "forthcoming" : /open now|closing soon/.test(state) ? "open" : "unknown";
  const summaryPanel = d?.panels.find((p) => p.id === "summary")?.html;
  const fundingType = row(summaryPanel, "Funding type");
  const projectSize = row(summaryPanel, "Project size");
  // "apply for a share of up to £28 million" is the competition budget. The project size counts as the award only
  // when it speaks of the grant funding request ("must be between £200,000 and £750,000", "of up to £600,000"); a
  // range of total project costs is not what an applicant receives.
  const budget = pounds(c.description.match(/share of (?:up to )?£[^£]{0,20}/i)?.[0] ?? "");
  const range = projectSize.match(/(?:grant|funding request|contract)[^£]*between (£[^£]*) and (£[^£]{0,20})/i);
  const award = range ? [...pounds(range[1] as string), ...pounds(range[2] as string)] : pounds(projectSize.match(/(?:grant|funding request|contract)[^£]*(?:up to|exactly|maximum of|not exceed) (£[^£]{0,20})/i)?.[1] ?? "");
  const who = `${c.description}\n${c.eligibility}`;
  const summary = [
    c.description,
    c.eligibility && `Eligibility:\n${c.eligibility}`,
    `Opens: ${d?.opens || c.opens}\nCloses: ${d?.closes || c.closes}`,
    ...(d?.panels ?? []).map((p) => p.text.slice(0, PANEL_MAX)),
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `uk_innovate:${c.id}`,
    source: "uk_innovate",
    source_id: c.id,
    source_url: `${SITE}${c.path}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: "en",
    summary,
    funder_name: "Innovate UK",
    funder_level: "national",
    country: "GB",
    regions: [],
    funding_types: fundingTypes(fundingType),
    beneficiary_types: beneficiaryTypes(who),
    consortium: /open to[^.]*single applicants/i.test(c.eligibility) ? "single" : /open to[^.]*collaborat/i.test(c.eligibility) ? "required" : null,
    sectors: [],
    amount_min: award.length > 1 ? Math.min(...award) : null,
    amount_max: award.length ? Math.max(...award) : null,
    budget_total: budget.length ? Math.max(...budget) : null,
    currency: "GBP",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const ukInnovate: Source = {
  id: "uk_innovate",
  license: LICENSE,
  start() {
    return "0";
  },
  // The cursor is the list page number (the first page is 0). Every listed competition is open or opening soon.
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetch(`${SITE}/competition/search?page=${page}`, { headers: UA, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Innovate UK competition search page ${page}`);
    const html = await res.text();
    const cards = parseCards(html);
    if (page === 0 && cards.length === 0) throw new Error("Innovate UK competition search returned no competitions (bot challenge or layout change?)");
    const details = await mapLimit(cards, 2, (c) => detail(c.path).catch(() => null));
    const grants = cards.map((c, i) => normalize(c, details[i] ?? null));
    return {
      grants,
      raws: cards.map((c, i) => ({ source_id: c.id, payload: { card: c, detail: details[i] ? { opens: details[i]?.opens, closes: details[i]?.closes, panels: details[i]?.panels.map((p) => ({ id: p.id, text: p.text })) } : null } })),
      next: cards.length > 0 && html.includes(`href="?page=${page + 1}"`) ? String(page + 1) : null,
    };
  },
};
