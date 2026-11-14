import type { Grant } from "@grantledger/schema";
import { fetchHtml, fetchJson, mapLimit, num, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Ireland, Health Research Board (HRB): funding schemes for health and social care research, including the
// EU co-funded joint transnational calls the HRB takes part in. Two lists are combined:
// - the WordPress REST API (/wp-json/wp/v2/funding-scheme) enumerates every scheme (about 60) with its modification
//   time, but its "acf" block is empty: no status, dates or amounts;
// - the server-rendered "HRB grant schemes" page carries status (open, opening soon, closed), amount, duration and
//   closing date for the schemes of that category (about 45 of 60; the EU co-funded schemes are not on it).
// Schemes the list page shows as closed are emitted from their card. Every other scheme (open, opening soon, or not
// on the list page) gets its own page, which holds the status, dates, funding, full text and guidance documents.
// The first fetchPage makes the two list requests, later ones read up to 20 scheme pages each.
// robots.txt disallows nothing and sets no crawl delay. Dates are Irish wall-clock dates, stored as-is.
const SITE = "https://www.hrb.ie";
const LIST_URL = `${SITE}/funding-category/research-funding/funding-opportunities/grant-schemes/`;
const API = `${SITE}/wp-json/wp/v2/funding-scheme?per_page=100&orderby=id&order=desc&_fields=id,slug,link,modified_gmt,title,excerpt`;
const LICENSE = "Health Research Board public funding scheme information (hrb.ie)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PER_CALL = 20;

interface Row { id: number; slug: string; link: string; modified_gmt: string; title: { rendered: string }; excerpt?: { rendered: string } }
interface Card { status: string; description: string; fields: Record<string, string> }
interface Pending { id: number; slug: string; link: string; modified: string; title: string; excerpt: string }
interface Detail { status: string; opens: string | null; partners: boolean; description: string; fields: Record<string, string>; sections: { title: string; text: string }[]; documents: Grant["documents"] }

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/[ \t]*\n\s*/g, "\n").trim();
const oneLine = (html: string) => clean(html).replace(/\s+/g, " ");

// "Amount / Up to €5,000 for events", "Closing Date / 08-07-2026": label and value spans of a card or a scheme page.
function parseFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const m of html.matchAll(/<span class="meta-title">([\s\S]*?)<\/span>\s*<span class="meta-value">([\s\S]*?)<\/span>/g)) fields[oneLine(m[1] as string)] = oneLine(m[2] as string);
  return fields;
}

function parseCards(html: string): Map<number, Card> {
  const cards = new Map<number, Card>();
  for (const m of html.matchAll(/<article id="post-(\d+)"[^>]*data-status="([^"]*)"[\s\S]*?<\/article>/g)) {
    cards.set(Number(m[1]), { status: m[2] as string, description: clean((m[0] as string).match(/<\/h2>([\s\S]*?)<\/div><!-- \.entry-content -->/)?.[1] ?? ""), fields: parseFields(m[0] as string) });
  }
  return cards;
}

function parseDetail(html: string): Detail {
  const article = html.match(/<article id="post-\d+"[^>]*data-status="([^"]*)"[\s\S]*?<\/article>/);
  const body = article?.[0] ?? "";
  const header = body.slice(0, body.indexOf('<div class="entry-content">'));
  const content = body.slice(body.indexOf('<div class="entry-content">'));
  const [intro = "", ...blocks] = content.split('<div class="titled-content">');
  const sections = blocks.map((b) => ({ title: oneLine(b.match(/<h3 class="content-title">([\s\S]*?)<\/h3>/)?.[1] ?? ""), text: clean(b.slice(b.indexOf('<div class="content-content">'))) })).filter((s) => s.title && s.text);
  const documents: Grant["documents"] = [];
  for (const m of (html.match(/<ul class="guidance-links">[\s\S]*?<\/ul>/)?.[0] ?? "").matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = (m[1] as string).replace(/&amp;/g, "&").replace(/^\//, `${SITE}/`).replace(/ /g, "%20");
    if (/^https:\/\//.test(url) && URL.canParse(url) && !documents.some((d) => d.url === url)) documents.push({ title: oneLine(m[2] as string) || url, url });
  }
  // The status card of a scheme that is not open yet reads "Opening Date 01-12-2026 / Opening soon".
  const opening = oneLine(header).match(/Opening Date\s*(\d{2})-(\d{2})-(\d{4})/);
  return {
    status: article?.[1] ?? "",
    opens: opening ? `${opening[3]}-${opening[2]}-${opening[1]}T00:00:00.000Z` : null,
    partners: /Partners needed/i.test(header),
    description: clean(intro.replace(/<div class="hide_desktop[\s\S]*?<\/div>/, "")),
    fields: parseFields(header),
    sections,
    documents,
  };
}

async function detail(link: string): Promise<Detail | null> {
  const d = parseDetail(await fetchHtml(link, UA));
  return d.status ? d : null;
}

// "19-11-2026": the last day to apply, Irish time.
function closing(value: string | undefined): string | null {
  const m = value?.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T23:59:59.000Z` : null;
}

// "€330,000 - €405,000 direct costs", "Up to €700,000", "€2.5 million".
function euros(text: string): number[] {
  return [...text.matchAll(/€\s?([\d,.]*\d)\s*(million|m\b|k\b)?/gi)].map((m) => {
    const base = num((m[1] as string).replace(/,/g, "")) ?? 0;
    const unit = (m[2] ?? "").toLowerCase();
    return base * (unit.startsWith("m") ? 1e6 : unit === "k" ? 1e3 : 1);
  }).filter((n) => n > 0);
}

function normalize(p: Pending, card: Card | undefined, d: Detail | null): Grant {
  const fields = d ? d.fields : (card?.fields ?? {});
  const closes = closing(fields["Closing Date"]);
  const opens = d?.opens ?? null;
  const state = d?.status ?? card?.status ?? "";
  const status: Grant["status"] = state === "closed" || (closes && closes < new Date().toISOString()) ? "closed" : state === "opening-soon" ? "forthcoming" : state === "open" ? "open" : "unknown";
  const money = euros(fields["Funding"] ?? fields["Amount"] ?? "");
  const summary = [
    d?.description || card?.description || p.excerpt,
    [opens && `Opening Date: ${opens.slice(0, 10)}`, ...Object.entries(fields).filter(([k]) => !k.startsWith("Opening Date")).map(([k, v]) => `${k}: ${v}`), d?.partners && "International / EU partners needed"].filter(Boolean).join("\n"),
    ...(d?.sections ?? []).map((s) => `${s.title}:\n${s.text}`),
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `ie_hrb:${p.slug}`,
    source: "ie_hrb",
    source_id: p.slug,
    source_url: p.link,
    source_license: LICENSE,
    title: p.title,
    title_lang: "en",
    summary: summary || null,
    funder_name: "Health Research Board",
    funder_level: "national",
    country: "IE",
    regions: [],
    funding_types: ["grant"],
    // HRB awards go to researchers through an HRB-approved host institution.
    beneficiary_types: ["research_org"],
    consortium: d?.partners ? "required" : null,
    sectors: [],
    amount_min: money.length > 1 ? Math.min(...money) : null,
    amount_max: money.length ? Math.max(...money) : null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens && (!closes || opens <= closes) ? opens : null,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: toIso(`${p.modified}Z`),
  };
}

export const ieHrb: Source = {
  id: "ie_hrb",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": both lists; closed schemes are returned at once. After that the cursor is the JSON list of
  // schemes whose page is still to read.
  async fetchPage(cursor): Promise<Page> {
    if (cursor === "start") {
      const cards = parseCards(await fetchHtml(LIST_URL, UA));
      if (cards.size === 0) throw new Error("HRB grant schemes page returned no schemes (bot challenge or layout change?)");
      const rows: Row[] = [];
      for (let page = 1; page <= 5; page++) {
        const batch = await fetchJson<Row[]>(`${API}&page=${page}`, { headers: UA });
        rows.push(...batch);
        if (batch.length < 100) break;
      }
      if (rows.length === 0) throw new Error("HRB funding-scheme API returned no schemes");
      const all = rows.map((r): Pending => ({ id: r.id, slug: r.slug, link: r.link, modified: r.modified_gmt, title: oneLine(r.title.rendered), excerpt: clean(r.excerpt?.rendered ?? "") }));
      const closed = all.filter((p) => cards.get(p.id)?.status === "closed");
      const pending = all.filter((p) => cards.get(p.id)?.status !== "closed");
      return {
        grants: closed.map((p) => normalize(p, cards.get(p.id), null)),
        raws: closed.map((p) => ({ source_id: p.slug, payload: { row: p, card: cards.get(p.id) } })),
        next: pending.length ? JSON.stringify(pending) : null,
      };
    }
    const pending = JSON.parse(cursor) as Pending[];
    const batch = pending.slice(0, PER_CALL);
    const details = await mapLimit(batch, 2, (p) => detail(p.link));
    const rest = pending.slice(PER_CALL);
    return {
      grants: batch.map((p, i) => normalize(p, undefined, details[i] ?? null)),
      raws: batch.map((p, i) => ({ source_id: p.slug, payload: { row: p, detail: details[i] ?? null } })),
      next: rest.length ? JSON.stringify(rest) : null,
    };
  },
};
