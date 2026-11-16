import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Denmark, Danmarks Frie Forskningsfond (Independent Research Fund Denmark): the "Current funding opportunities" list
// is rendered client-side from /umbraco/api/..., which robots.txt disallows. The sitemap (/sitemap, allowed) lists every
// instrument page with its lastmod; each page is server-rendered with the deadline in <time datetime>, an intro and
// Objective / Framework sections (budget limits, duration, seniority). English pages mirror the Danish ones one to one.
const SITE = "https://dff.dk";
const SITEMAP_URL = `${SITE}/sitemap`;
const LICENSE = "Danmarks Frie Forskningsfond public call information";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml,application/xml", "accept-language": "en-GB,en;q=0.9,da;q=0.8" };
// National instruments and the international co-investigator schemes; previous calls live under /previous-calls/ and are skipped.
const INSTRUMENT_PATH = /^\/en\/apply-for-funding\/see-what-you-can-apply-for\/(?:current-funding-opportunities\/instruments|international-funding-calls\/international-instruments)\/\d{4}\/[^/]+\/([^/]+)\/$/;
// Instrument pages fetched per fetchPage call; the sitemap itself is re-read each call.
const BATCH = 10;

interface Cursor { offset: number }

interface ListItem { slug: string; url: string; lastmod: string | null }

interface Detail { title: string; deadline: string | null; intro: string; body: string; framework: string; open: boolean }

function parseSitemap(xml: string): ListItem[] {
  const out: ListItem[] = [];
  for (const entry of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    if (!loc) continue;
    const path = loc.replace(SITE, "");
    const slug = path.match(INSTRUMENT_PATH)?.[1];
    if (!slug) continue;
    const lastmod = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.replace(/&#x2B;/gi, "+") ?? null;
    out.push({ slug, url: loc, lastmod: lastmod ? new Date(lastmod).toISOString() : null });
  }
  return out;
}

function parseDetail(html: string): Detail {
  // Main column: headline through the footer; the "Supplementary information" accordion, the stats and the contact
  // boxes at the end are boilerplate and cut off from the text.
  const start = html.indexOf('<h1 class="area-content__headline">');
  const end = html.indexOf("<footer", start);
  const main = start >= 0 ? html.slice(start, end > start ? end : undefined) : html;
  // The page mixes CRLF and LF; drop the CRs before collapsing blank lines.
  const text = stripHtml(main).replace(/\r/g, "").replace(/ /g, " ").replace(/\n[ \t]+/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const body = text.replace(/^[^\n]*\n/, "").replace(/\n(?:Supplementary information|Yderligere information)\n[\s\S]*$/, "");
  return {
    title: stripHtml(html.match(/<h1 class="area-content__headline">([\s\S]*?)<\/h1>/)?.[1] ?? "").trim(),
    // The list and the page prefix this date with "Deadline for applications at 12:00 PM" via CSS.
    deadline: html.match(/<time class="area-content__date-time" datetime="(\d{4}-\d{2}-\d{2})"/)?.[1] ?? null,
    intro: stripHtml(html.match(/<p class="area-content__intro">([\s\S]*?)<\/p>/)?.[1] ?? "").trim(),
    body,
    framework: body.match(/\n(?:Framework|Rammer)\n([\s\S]*?)(?=\n(?:About the applicant|Om ansøger|What is |Hvad er )|$)/)?.[1]?.trim() ?? "",
    // The header button reads "Apply now" while e-grant accepts applications and "Not open" before that.
    open: !/\n(?:Not open|Ikke åben)\n/.test(body),
  };
}

// "Between DKK 2,550,000 and DKK 4,450,000" and "Up to DKK 5,000,000" in the Framework section.
function amounts(framework: string): { min: number | null; max: number | null } {
  const between = framework.match(/(?:Between|Mellem)\s+(?:DKK\s*)?([\d.,]+)\s+(?:and|og)\s+(?:DKK\s*)?([\d.,]+)/i);
  if (between) return { min: num(between[1]?.replace(/[.,]/g, "")), max: num(between[2]?.replace(/[.,]/g, "")) };
  const upTo = framework.match(/(?:Up to|Op til|Maks\.?|Maximum)\s+(?:DKK|kr\.?)\s*([\d.,]+)/i) ?? framework.match(/DKK\s*([\d.,]+)/);
  return { min: null, max: upTo ? num(upTo[1]?.replace(/[.,]/g, "")) : null };
}

function normalize(item: ListItem, detail: Detail): Grant {
  // Deadlines are 12:00 Copenhagen time; noon UTC keeps the day right and errs by at most two hours.
  const closes = detail.deadline ? `${detail.deadline}T12:00:00.000Z` : null;
  const objective = detail.body.match(/\n(?:Objective|Formål)\n([\s\S]*?)(?=\n(?:Framework|Rammer)\n|$)/)?.[1]?.trim() ?? "";
  const { min, max } = amounts(detail.framework);
  const summary = [
    detail.intro,
    detail.deadline ? `Deadline for applications at 12:00 PM, ${detail.deadline}` : "",
    objective ? `Objective\n${objective}` : "",
    detail.framework ? `Framework\n${detail.framework}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 4000) || null;
  return {
    id: `dk_dff:${item.slug}`,
    source: "dk_dff",
    source_id: item.slug,
    source_url: item.url,
    source_license: LICENSE,
    title: detail.title || item.slug,
    title_lang: "en",
    summary,
    funder_name: "Danmarks Frie Forskningsfond",
    funder_level: "national",
    country: "DK",
    regions: [],
    funding_types: ["grant"],
    // Grants are awarded to a named researcher and administered by their Danish research institution.
    beneficiary_types: ["research_org", "individual"],
    sectors: [],
    amount_min: min,
    amount_max: max,
    budget_total: null,
    currency: "DKK",
    // The fund lists every announced instrument up to three years ahead; no opening date is published.
    status: detail.open ? statusFromDates(null, closes) : "forthcoming",
    opens_at: null,
    closes_at: closes,
    documents: [],
    source_updated_at: item.lastmod,
  };
}

export const dkDff: Source = {
  id: "dk_dff",
  license: LICENSE,
  start() {
    return JSON.stringify({ offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const items = parseSitemap(await fetchHtml(SITEMAP_URL, UA));
    if (items.length === 0) throw new Error("DFF sitemap lists no instrument pages (URL layout change?)");
    const batch = items.slice(c.offset, c.offset + BATCH);
    const details = await mapLimit(batch, 4, async (item) => parseDetail(await fetchHtml(item.url, UA)));
    const grants = batch.map((item, i) => normalize(item, details[i] as Detail));
    const next: Cursor | null = c.offset + BATCH < items.length ? { offset: c.offset + BATCH } : null;
    return { grants, raws: batch.map((item, i) => ({ source_id: item.slug, payload: { ...item, ...details[i] } })), next: next ? JSON.stringify(next) : null };
  },
};
