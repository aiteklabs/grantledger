import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Slovenia, ARIS (Javna agencija za znanstvenoraziskovalno in inovacijsko dejavnost): the research and innovation
// agency's own calls. The pages /objave/razpisi/odprti and /objave/nacrtovani-razpisi render only the first 10 cards
// and page through the site's own endpoint, POST /sl/_ajax {method: "arisDataListing"}, which returns the cards as
// HTML strings; it is read with the same preset filters, status "odprt" (open) then "nacrtovan" (planned), 20 cards
// per request, and each card gets its detail page (call text, timeline, documents). Closed calls are not read.
// Cards carry a "days left" tag, which is left out. The URL slug ends with a date that changes when a planned call
// is published, so the record id is the publisher's numeric id (data-eliid="eli_razpisi_N"). A planned call only has
// an expected publication date, often the last day of a quarter. robots.txt has no rules.
const SITE = "https://www.aris-rs.si";
const AJAX = `${SITE}/sl/_ajax`;
const LICENSE = "ARIS public call information (aris-rs.si)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const STATUSES = ["odprt", "nacrtovan"] as const;
const PAGE_SIZE = 20;

interface Cursor { status: (typeof STATUSES)[number]; page: number }
interface Card { id: string; url: string; title: string; tags: string[]; label: string; value: string; due: string; published: string }
interface Listing { success?: number | boolean; msg?: string | null; data?: { hits?: string[]; total?: number; hasNext?: boolean } }

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/\s+/g, " ").trim();

// "17. 11. 2026 (14:00)" or "31. 12. 2026": Slovenian local time kept as written, end of day when a deadline has no time.
function siDate(text: string, endOfDay: boolean): string | null {
  const m = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s*\((\d{1,2}):(\d{2})\))?/);
  if (!m) return null;
  const time = m[4] ? `${m[4].padStart(2, "0")}:${m[5]}:00` : endOfDay ? "23:59:59" : "00:00:00";
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${time}.000Z`;
}

function parseCard(html: string): Card | null {
  const id = html.match(/data-eliid="eli_razpisi_(\d+)"/)?.[1];
  const link = html.match(/<h4>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  if (!id || !link) return null;
  const meta = (label: string) => clean(html.match(new RegExp(`<span>${label}:</span>\\s*<strong>([\\s\\S]*?)</strong>`))?.[1] ?? "");
  return {
    id,
    url: new URL(decodeEntities(link[1]!), SITE).href,
    title: clean(link[2]!),
    tags: [...html.matchAll(/<span class="tag tag--grey">([^<]*)<\/span>/g)].map((m) => m[1]!.trim()).filter((t) => /^[A-ZČŠŽ_]+$/.test(t)),
    label: clean(html.match(/<span class="tag tag--(?!grey)[^"]*">([^<]*)<\/span>/)?.[1] ?? ""),
    value: meta("Razpisana vrednost"),
    due: meta("Rok"),
    published: meta("Datum objave"),
  };
}

function normalize(c: Card, html: string, listStatus: Cursor["status"]): Grant {
  const side = html.match(/<div class="detail-meta">([\s\S]*?)<div class="actions">/)?.[1] ?? "";
  const meta = (label: string) => clean(side.match(new RegExp(`${label}\\s*</p>\\s*<p class="value">([\\s\\S]*?)</p>`))?.[1] ?? "");
  const from = html.indexOf('<div class="razpisDetail-content');
  const content = from === -1 ? "" : html.slice(from, html.indexOf("<aside", from)).replace(/<nav>[\s\S]*?<\/nav>/, "").replace(/<h1[\s\S]*?<\/h1>/, "");
  const category = [...content.matchAll(/<span class="tag tag--blue[^"]*">([^<]*)<\/span>/g)].map((m) => clean(m[1]!)).filter(Boolean).join(", ");
  const body = stripHtml(content.replace(/<div class="tags">[\s\S]*?<\/div>/, ""))
    .replace(/ /g, " ")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  const state = meta("Status") || c.label;
  const published = meta("Datum objave") || c.published;
  const due = meta("Rok za prijavo") || c.due;
  const value = meta("Razpisana vrednost") || c.value;
  const planned = /načrtovan/i.test(state) || (!state && listStatus === "nacrtovan");
  const opens = siDate(published, false);
  const closes = siDate(due, true);
  const now = new Date().toISOString();
  const status: Grant["status"] = /zaključen|zaprt/i.test(state) || (closes && closes < now) ? "closed" : planned ? "forthcoming" : /odprt/i.test(state) ? "open" : "unknown";
  const documents: Grant["documents"] = [];
  for (const m of content.matchAll(/<a href="([^"]+\.(?:pdf|docx?|xlsx?|odt|ods|zip|rtf))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(decodeEntities(m[1]!), SITE).href;
    const title = clean(m[2]!);
    if (url.startsWith("https://") && title && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  // Beneficiaries from the title, the category and the lines that speak about applicants; "inovacij" is only looked
  // for in the title and category because the agency's own name carries it.
  const applicants = [c.title, category, ...body.split("\n").filter((l) => /prijavitelj|upravičen|prijavijo|kandidira/i.test(l))].join("\n");
  const beneficiaries: Grant["beneficiary_types"] = [];
  if (/raziskov|znanstven/i.test(applicants)) beneficiaries.push("research_org");
  if (/podjetj|gospodarsk\w+ družb|gospodarstv/i.test(applicants) || /inovacij/i.test(`${c.title} ${category}`)) beneficiaries.push("company");
  const summary = [
    [category && `Kategorija: ${category}`, state && `Status: ${state}`, published && `${planned ? "Predvidena objava" : "Datum objave"}: ${published}`, due && `Rok za prijavo: ${due}`, value && `Razpisana vrednost: ${value}`].filter(Boolean).join("\n"),
    body,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `si_aris:${c.id}`,
    source: "si_aris",
    source_id: c.id,
    source_url: c.url,
    source_license: LICENSE,
    title: c.title,
    title_lang: "sl",
    summary: summary || null,
    funder_name: "Javna agencija za znanstvenoraziskovalno in inovacijsko dejavnost Republike Slovenije (ARIS)",
    funder_level: "national",
    country: "SI",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries,
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: value ? num(value.replace(/\./g, "").replace(",", ".")) : null,
    currency: "EUR",
    status,
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents,
    source_updated_at: null,
  };
}

export const siAris: Source = {
  id: "si_aris",
  license: LICENSE,
  start() {
    return JSON.stringify({ status: STATUSES[0], page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const res = await fetch(AJAX, {
      method: "POST",
      headers: { ...UA, "content-type": "application/json", "x-requested-with": "XMLHttpRequest", accept: "application/json" },
      body: JSON.stringify({ method: "arisDataListing", data: { module: "razpisi", lang: "sl", query: "", filters: {}, presetFilters: { status: [c.status] }, tab: "", page: c.page, pageSize: PAGE_SIZE } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ARIS call list (${c.status}, page ${c.page})`);
    const listing = (await res.json()) as Listing;
    if (!listing.success || !listing.data) throw new Error(`ARIS call list failed (${c.status}, page ${c.page}): ${listing.msg ?? "no data"}`);
    const cards = (listing.data.hits ?? []).map(parseCard).filter((x): x is Card => x !== null);
    if (cards.length === 0 && c.page === 1 && c.status === "odprt") throw new Error("ARIS returned no open calls (endpoint or markup change?)");
    const grants = await mapLimit(cards, 2, async (card) => normalize(card, await fetchHtml(card.url, UA), c.status));
    const nextStatus = STATUSES[STATUSES.indexOf(c.status) + 1];
    const next: Cursor | null = listing.data.hasNext && cards.length > 0 ? { status: c.status, page: c.page + 1 } : nextStatus ? { status: nextStatus, page: 1 } : null;
    return {
      grants,
      raws: cards.map((card, i) => ({ source_id: card.id, payload: { card, summary: grants[i]!.summary } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
