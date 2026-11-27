import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// EU, European Institute of Innovation and Technology (EIT): the "Opportunities" page of eit.europa.eu, where the
// EIT and its Knowledge and Innovation Communities (EIT Food, EIT Health, EIT Urban Mobility and so on) post their
// open calls, prizes and programmes. The list is server-rendered on one page (a second page returns nothing) and
// only gives the link and the dates; each opportunity page carries the type, the start and end date with the time
// in CET, the community, the text, the audience and a link to the community's own call page. The list holds
// current opportunities only. Entries that are events rather than something to apply for (information days,
// webinars, conferences) are skipped by title. Amounts are only given in the text, so they are read from a few
// fixed phrasings ("up to EUR x per project", "total budget of EUR x") and left empty otherwise.
// robots.txt does not disallow /our-activities/ and sets no crawl delay.
const SITE = "https://www.eit.europa.eu";
const LIST_URL = `${SITE}/our-activities/opportunities`;
const LICENSE = "EIT re-use policy: free re-use with acknowledgement of the source (eit.europa.eu/legal-notice)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PER_CALL = 20;
const EVENT = /\b(webinar|info(rmation)? ?(day|session)s?|conference|summit|workshop|matchmaking|brokerage|open day)\b/i;

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/\s+/g, " ").trim();

// "09/10/2026 10.00 - CET": the page states CET, taken literally as UTC+1.
function cetIso(text: string, endOfDay: boolean): string | null {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2})[.:](\d{2}))?/);
  if (!m) return null;
  const [hour, minute] = m[4] ? [Number(m[4]), Number(m[5])] : endOfDay ? [23, 59] : [0, 0];
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hour - 1, minute)).toISOString();
}

// "30 000", "850,000", "1,556,000", "2.5 million".
function euros(value: string, million: boolean): number | null {
  if (million) {
    const n = num(value.replace(/\s/g, "").replace(",", "."));
    return n === null ? null : Math.round(n * 1e6);
  }
  return num(value.replace(/[\s,]/g, "").replace(/\.(?=\d{3}\b)/g, ""));
}

function parseList(html: string): string[] {
  return [...new Set([...html.matchAll(/<div class="teaser-title"><a href="\/our-activities\/opportunities\/([^"/?#]+)"/g)].map((m) => m[1]!))];
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/start-?ups?|founders?|ventures?|spin-?offs?/.test(t)) out.add("startup");
  if (/\bsmes?\b|small and medium/.test(t)) out.add("sme");
  if (/compan(y|ies)|business(es)?|industry|organisations/.test(t)) out.add("company");
  if (/universit|higher education|research (organisation|institut)|researchers/.test(t)) out.add("research_org");
  if (/\bcit(y|ies)\b|public authorit|municipalit/.test(t)) out.add("public_body");
  if (/\bngos?\b|non-profit|nonprofit/.test(t)) out.add("ngo");
  if (/teachers?|students?|women (innovators|entrepreneurs)|individuals?/.test(t)) out.add("individual");
  return [...out];
}

// null for an entry that is an event.
function normalize(slug: string, html: string): Grant | null {
  const from = html.indexOf('<article class="node node--type-eit-opportunity');
  const article = from === -1 ? "" : html.slice(from, html.indexOf("</article>", from));
  const title = clean(article.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  if (!title) throw new Error(`EIT opportunity ${slug} has no title (layout change?)`);
  if (EVENT.test(title)) return null;
  const type = clean(article.match(/<div class="type[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const startText = clean(article.match(/<div class="start-date">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const endText = clean(article.match(/<div class="end-date">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const community = clean(article.match(/field--name-field-challenge-short-name[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
  const bodyHtml = article.match(/field--name-body[^>]*>([\s\S]*?)<div class="node-related-info">/)?.[1] ?? "";
  const body = stripHtml(bodyHtml)
    .replace(/ /g, " ")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  const audience = [...(article.match(/field--name-field-eit-subject-audience[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? "").matchAll(/<a href="[^"]*"[^>]*>([^<]*)<\/a>/g)].map((m) => clean(m[1]!));
  const external = [...(article.match(/field--name-field-opportunity-external-urls[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? "").matchAll(/<a href="([^"]+)"/g)].map((m) => decodeEntities(m[1]!));
  const opens = cetIso(startText, false);
  const closes = cetIso(endText, true);
  const flat = body.replace(/\s+/g, " ");
  const upTo = flat.match(/up to (?:€|EUR)\s?(\d[\d.,\s]*\d|\d)(\s?million)?(?:\s+in [A-Za-z ]{1,20})?\s+per\s+(?:team|company|project|venture|application|startup|entity|proposal|consortium)/i);
  const total = flat.match(/total (?:estimated )?(?:funding|budget)[^.€]{0,50}?(?:€|EUR)\s?(\d[\d.,\s]*\d|\d)(\s?million)?/i);
  const documents: Grant["documents"] = [];
  for (const m of bodyHtml.matchAll(/<a[^>]*href="([^"]+\.(?:pdf|docx?|xlsx?|zip))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1]!);
    if (!URL.canParse(href, SITE)) continue;
    const url = new URL(href, SITE).href;
    const name = clean(m[2]!);
    if (url.startsWith("https://") && name && !documents.some((d) => d.url === url)) documents.push({ title: name, url });
  }
  const summary = [
    [
      type && `Type: ${type}`,
      community && `EIT Community: ${community}`,
      startText && `Opens: ${startText}`,
      endText && `Closes: ${endText}`,
      audience.length > 0 && `Audience: ${audience.join(", ")}`,
      external.length > 0 && `Call page: ${external.join(" ")}`,
    ].filter(Boolean).join("\n"),
    body,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  const types: Grant["funding_types"] = /\b(prizes?|awards?)\b/i.test(title) ? ["prize"] : /pre-money valuation|equity investment|convertible/i.test(flat) ? ["grant", "equity"] : ["grant"];
  return {
    id: `eu_eit:${slug}`,
    source: "eu_eit",
    source_id: slug,
    source_url: `${LIST_URL}/${slug}`,
    source_license: LICENSE,
    title,
    title_lang: "en",
    summary,
    funder_name: "European Institute of Innovation and Technology (EIT)",
    funder_level: "supranational",
    country: "EU",
    regions: [],
    funding_types: types,
    // From the title and the opening lines, which say who the opportunity is for; the audience field lists nearly
    // every group on most pages.
    beneficiary_types: beneficiaryTypes(`${title}\n${flat.slice(0, 600)}`),
    sectors: [],
    amount_min: null,
    amount_max: upTo ? euros(upTo[1]!, Boolean(upTo[2])) : null,
    budget_total: total ? euros(total[1]!, Boolean(total[2])) : null,
    currency: "EUR",
    status: statusFromDates(opens, closes),
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents,
    source_updated_at: null,
  };
}

export const euEit: Source = {
  id: "eu_eit",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the list, then its first opportunity pages. After that the cursor is the JSON list of slugs
  // still to read.
  async fetchPage(cursor): Promise<Page> {
    let slugs: string[];
    if (cursor === "start") {
      slugs = parseList(await fetchHtml(LIST_URL, UA));
      if (slugs.length === 0) throw new Error("EIT returned no opportunities (bot challenge or layout change?)");
    } else slugs = JSON.parse(cursor) as string[];
    const batch = slugs.slice(0, PER_CALL);
    const rest = slugs.slice(PER_CALL);
    const results = await mapLimit(batch, 2, async (slug) => normalize(slug, await fetchHtml(`${LIST_URL}/${slug}`, UA)));
    const grants = results.filter((g): g is Grant => g !== null);
    return {
      grants,
      raws: grants.map((g) => ({ source_id: g.source_id, payload: { slug: g.source_id, summary: g.summary } })),
      next: rest.length ? JSON.stringify(rest) : null,
    };
  },
};
