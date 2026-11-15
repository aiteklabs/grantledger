import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Ireland, National Enterprise Hub (www.neh.gov.ie, a CoreMedia site): the government register of business supports
// from about 29 state agencies. The supports list is served by a pagination service as HTML fragments of 5 cards
// (title, tagline, description, "who is it for", support-type tag, and a data-filter list of tag ids that carries
// the providing agency). The agency id-to-name map comes from the filter radios on the list page.
const SITE = "https://www.neh.gov.ie";
const LIST = `${SITE}/business-supports`;
// Container 120482 is the all-supports list on /business-supports; the category pages use their own containers.
const PAGINATION = `${SITE}/service/pagination/neh-en/120482?view=asCategoryContainerPagination&pageNum=`;
const LICENSE = "National Enterprise Hub public business supports information (Government of Ireland)";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "en-IE,en;q=0.9" };
// Fragments fetched per fetchPage call (5 cards each), so a full crawl of ~320 supports takes about 13 pages.
const FRAGMENTS_PER_PAGE = 5;
// Filter tag ids for "Select type of Support" and "Select Business Size" (stable CoreMedia content ids).
const TYPE_TAGS: Record<string, Grant["funding_types"][number]> = { "189050": "grant", "189054": "loan", "189056": "tax_credit", "189052": "grant" };
const SIZE_TAGS = ["116874", "116866", "116868"];
const REGIONAL = /Local Enterprise Office|Údarás na Gaeltachta|Western Development Commission/i;

interface Cursor { page: number; agencies: Record<string, string> }

interface Card { path: string; title: string; tagline: string; description: string; who: string; tags: string[]; filter: string[] }

function block(html: string, re: RegExp): string {
  return stripHtml(html.match(re)?.[1] ?? "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function parseCards(html: string): Card[] {
  const out: Card[] = [];
  for (const card of html.split(/<div class="col-12 card-wrapper filter-card"/).slice(1)) {
    const path = card.match(/data-link="([^"]+)"/)?.[1];
    if (!path) continue;
    out.push({
      path,
      title: block(card, /<h4[^>]*>([\s\S]*?)<\/h4>/),
      tagline: block(card, /class="top-title[^"]*">([\s\S]*?)<\/div>/),
      description: block(card, /<div class="text-wrapper">([\s\S]*?)<\/div>/),
      who: block(card, /<div class="who-is-for-container">([\s\S]*?)<\/div>/),
      tags: [...card.matchAll(/<p class="tag">([\s\S]*?)<\/p>/g)].map((m) => stripHtml(m[1]!).trim()).filter(Boolean),
      filter: (card.match(/data-filter="([^"]*)"/)?.[1] ?? "").split(",").filter(Boolean),
    });
  }
  return out;
}

// Agency radios on the list page: <input ... name="120482-116936" value="116898" .../> Enterprise Ireland
function parseAgencies(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/name="120482-116936"\s*value="(\d+)"[^>]*>\s*([^<]+)/g)) out[m[1]!] = stripHtml(m[2]!).trim();
  return out;
}

function normalize(c: Card, agencies: Record<string, string>): Grant {
  const slug = decodeURIComponent(c.path.split("/").filter(Boolean).pop() ?? c.path);
  const agency = c.filter.map((id) => agencies[id]).find(Boolean) ?? null;
  const text = `${c.title} ${c.tagline} ${c.description}`.toLowerCase();
  const types = new Set<Grant["funding_types"][number]>(c.filter.map((id) => TYPE_TAGS[id]).filter((t): t is Grant["funding_types"][number] => !!t));
  if (/\bvouchers?\b/.test(text)) types.add("voucher");
  if (/\bequity\b|investment fund|venture capital|seed fund/.test(text)) types.add("equity");
  if (/\bloans?\b/.test(text)) types.add("loan");
  if (/\bgrants?\b/.test(text)) types.add("grant");
  const who = `${c.who} ${c.tagline}`.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (c.filter.some((id) => SIZE_TAGS.includes(id)) || /\bsme\b|small (to|or|and) medium|small business|micro-?enterprise/.test(who)) bens.add("sme");
  if (/start-?up|new business|early[- ]stage|pre-seed|founder/.test(who)) bens.add("startup");
  if (/self-employed|sole trader|individual|jobseeker|unemployed|entrepreneur/.test(who)) bens.add("individual");
  if (/business|company|companies|enterprise|employer/.test(who) || bens.size === 0) bens.add("company");
  return {
    id: `ie_enterprise_hub:${slug}`,
    source: "ie_enterprise_hub",
    source_id: slug,
    source_url: `${SITE}${c.path}`,
    source_license: LICENSE,
    title: c.title || slug,
    title_lang: "en",
    summary: [c.tagline, c.description, c.who ? `Who is it for?\n${c.who}` : "", c.tags.length ? `Type of support: ${c.tags.join(", ")}` : ""].filter(Boolean).join("\n\n") || null,
    funder_name: agency,
    funder_level: agency && REGIONAL.test(agency) ? "regional" : "national",
    country: "IE",
    regions: [],
    funding_types: [...types],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: "open",
    opens_at: null,
    closes_at: null,
    documents: [],
    source_updated_at: null,
  };
}

export const ieEnterpriseHub: Source = {
  id: "ie_enterprise_hub",
  license: LICENSE,
  start() {
    return JSON.stringify({ page: 0, agencies: {} } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    // The agency map is read once on the first page and carried in the cursor.
    if (c.page === 0) {
      c.agencies = parseAgencies(await fetchHtml(LIST, UA));
      if (Object.keys(c.agencies).length === 0) throw new Error("National Enterprise Hub list page has no agency filter (layout change?)");
    }
    const pages = Array.from({ length: FRAGMENTS_PER_PAGE }, (_, i) => c.page + i);
    const fragments = await mapLimit(pages, 2, (p) => fetchHtml(`${PAGINATION}${p}`, UA));
    const cards = fragments.flatMap(parseCards);
    if (cards.length === 0 && c.page === 0) throw new Error("National Enterprise Hub returned no support cards (WAF challenge?)");
    // A fragment with a next-page marker means the list continues after it.
    const more = fragments[fragments.length - 1]!.includes("shadow-filter");
    const grants = cards.map((x) => normalize(x, c.agencies));
    return {
      grants,
      raws: cards.map((x) => ({ source_id: decodeURIComponent(x.path.split("/").filter(Boolean).pop() ?? x.path), payload: x })),
      next: more ? JSON.stringify({ page: c.page + FRAGMENTS_PER_PAGE, agencies: c.agencies } satisfies Cursor) : null,
    };
  },
};
