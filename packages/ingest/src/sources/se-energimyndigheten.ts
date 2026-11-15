import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Sweden, Energimyndigheten (Swedish Energy Agency): calls ("utlysningar") for research and innovation funding,
// business development programmes, competitions and other support. The list page is server-rendered (Episerver) and
// carries three lists at once: "Aktuella" (every current call, newest first), "Nära stängning" (the nine nearest
// deadlines, a subset) and "Stängda" (the 30 most recently closed; ?page=N only pages this one). Current calls are
// read from the first two lists and each gets its call page (deadline, announced budget, text, documents); the closed
// list is taken as listed, without call pages and without paging further back. Cloudflare sits in front of the site.
const SITE = "https://www.energimyndigheten.se";
const LIST_URL = `${SITE}/utlysningar/`;
const LICENSE = "Energimyndigheten public call information (energimyndigheten.se)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "text/html,application/xhtml+xml", "accept-language": "sv-SE,sv;q=0.9,en;q=0.8" };
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
// Call pages read per fetchPage call; the list page is re-read each call.
const BATCH = 20;

interface Cursor { offset: number }

interface Item { slug: string; title: string; date: string; type: string; teaser: string }

interface Detail { title: string; intro: string; info: { label: string; value: string }[]; body: string; documents: Grant["documents"]; modified: string | null }

function parseList(html: string, id: string): Item[] {
  const list = html.match(new RegExp(`<ul id="proc-list-container-${id}"[^>]*>([\\s\\S]*?)</ul>`))?.[1] ?? "";
  const items: Item[] = [];
  for (const m of list.matchAll(/<a class='list-item' href='\/utlysningar\/([^'/]+)\/?'>([\s\S]*?)<\/a>/g)) {
    const part = (cls: string) => stripHtml((m[2] as string).match(new RegExp(`class=["']${cls}["'][^>]*>([\\s\\S]*?)</(?:div|span)>`))?.[1] ?? "").replace(/\s+/g, " ");
    const title = stripHtml((m[2] as string).match(/class='list-item-title'>([\s\S]*?)<span/)?.[1] ?? "").replace(/\s+/g, " ");
    if (title) items.push({ slug: m[1] as string, title, date: part("text"), type: part("type"), teaser: part("list-item-text") });
  }
  return items;
}

function parseDetail(html: string): Detail {
  const start = html.indexOf("<h1");
  const end = html.indexOf('<hr class="footer"', start);
  const main = html.slice(start === -1 ? 0 : start, end === -1 ? undefined : end);
  const text = (part: string | undefined) => stripHtml((part ?? "").replace(/<div class="(?:plus|minus)">[^<]*<\/div>/g, "")).replace(/\u00a0/g, " ").replace(/\n\s*\n/g, "\n\n");
  const info = [...main.matchAll(/<div class="proclamationInfo">\s*<span class="left">([\s\S]*?)<\/span>\s*<span class="right">([\s\S]*?)<\/span>\s*<\/div>/g)].map((m) => ({ label: text(m[1]).replace(/\s+/g, " "), value: text(m[2]).replace(/\s+/g, " ") }));
  const bodyStart = main.indexOf('<div class="bodytext">');
  const documents: Grant["documents"] = [];
  for (const m of html.slice(start === -1 ? 0 : start).matchAll(/<a[^>]+href="((?:https:\/\/www\.energimyndigheten\.se)?\/[^"]*globalassets\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = decodeEntities((m[1] as string).startsWith("/") ? `${SITE}${m[1]}` : (m[1] as string));
    const title = stripHtml((m[2] as string).replace(/<span>\([^<]*\)<\/span>/, "")).replace(/\s+/g, " ");
    if (title && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  return {
    title: text(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]).replace(/\s+/g, " "),
    intro: text(main.match(/<div class="intro">([\s\S]*?)<\/div>/)?.[1]),
    info,
    body: bodyStart === -1 ? "" : text(main.slice(bodyStart)),
    documents,
    modified: toIso(html.match(/<meta itemprop="dateModified" content="([^"]+)"/)?.[1]),
  };
}

// "2027-02-01 23:59" or "2026-12-15" on the call page, "15 november 2026" in the lists. Swedish local time, stored as
// wall-clock time with a Z suffix; a date without a time closes at the end of that day.
function closingTime(value: string | undefined): string | null {
  const iso = value?.match(/(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (iso) return `${iso[1]}T${iso[2] ? `${iso[2]}:${iso[3]}:00` : "23:59:59"}.000Z`;
  const m = value?.match(/(\d{1,2}) ([a-zåäö]+) (\d{4})/);
  const month = m ? MONTHS.indexOf(m[2] as string) + 1 : 0;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}T23:59:59.000Z` : null;
}

// "75 miljoner kronor.", "5,2 miljoner euro (...)", "1,5 miljarder kronor", "500 000 kronor".
function money(value: string | undefined): number | null {
  const big = value?.match(/(\d+(?:[,.]\d+)?)\s*(miljon|miljard|mnkr|mkr)/i);
  if (big) return Math.round(Number((big[1] as string).replace(",", ".")) * (/miljard/i.test(big[2] as string) ? 1_000_000_000 : 1_000_000));
  const plain = value?.match(/(\d{1,3}(?:[ \u00a0]\d{3})+)\s*(?:kronor|kr|SEK|euro)/);
  return plain ? Number((plain[1] as string).replace(/[ \u00a0]/g, "")) : null;
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  // The agency's own name would match "myndighet" (public authority).
  const t = text.toLowerCase().replace(/energimyndigheten|energimarknadsinspektionen/g, "");
  const out: Grant["beneficiary_types"] = [];
  if (/företag|näringsliv|bolag/.test(t)) out.push("company");
  if (/små och medelstora|\bsmf\b|\bsme\b/.test(t)) out.push("sme");
  if (/startup|start-up|nystartade/.test(t)) out.push("startup");
  if (/universitet|högskol|lärosäte|forskningsinstitut|forskare|akademi/.test(t)) out.push("research_org");
  if (/kommun|region|offentlig|myndighet/.test(t)) out.push("public_body");
  if (/ideell|förening|civilsamhälle/.test(t)) out.push("ngo");
  return out;
}

function normalize(item: Item, d: Detail | null, closed: boolean): Grant {
  const deadline = d?.info.find((i) => /Sista dag|Stänger/i.test(i.label))?.value;
  const budget = d?.info.find((i) => /Utlysta medel|Budget/i.test(i.label))?.value;
  const closes = closingTime(deadline) ?? (/^Stänger/.test(item.date) || closed ? closingTime(item.date) : null);
  const who = d?.body.match(/Vem kan söka\??\s*([\s\S]{0,600})/)?.[1] ?? "";
  const funded = Boolean(budget) || /stöd|bidrag|finansier|\bmedel\b/i.test(`${item.title} ${d?.intro ?? item.teaser}`);
  const summary = [
    d?.intro || item.teaser,
    item.type && `Typ av utlysning: ${item.type}`,
    ...(d?.info ?? []).map((i) => `${i.label}: ${i.value}`),
    d?.body,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `se_energimyndigheten:${item.slug}`,
    source: "se_energimyndigheten",
    source_id: item.slug,
    source_url: `${LIST_URL}${item.slug}/`,
    source_license: LICENSE,
    title: d?.title || item.title,
    title_lang: "sv",
    summary: summary || null,
    funder_name: "Energimyndigheten",
    funder_level: "national",
    country: "SE",
    regions: [],
    // "Tävlingar" are competitions; the business development type also holds export programmes and trade fair
    // places with no money attached, marked "other" unless the call speaks of support or funding.
    funding_types: [item.type === "Tävlingar" ? "prize" : funded ? "grant" : "other"],
    beneficiary_types: beneficiaryTypes(`${who} ${d?.intro ?? item.teaser}`),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: money(budget),
    currency: /euro/i.test(budget ?? "") ? "EUR" : "SEK",
    status: closed || (closes !== null && closes < new Date().toISOString()) ? "closed" : "open",
    opens_at: null,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: d?.modified ?? null,
  };
}

export const seEnergimyndigheten: Source = {
  id: "se_energimyndigheten",
  license: LICENSE,
  start() {
    return JSON.stringify({ offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const { offset } = JSON.parse(cursor) as Cursor;
    const html = await fetchHtml(LIST_URL, UA);
    // "Nära stängning" repeats calls of "Aktuella" with the closing date instead of the publication date.
    const closing = parseList(html, "deadline");
    const current = parseList(html, "created").map((i) => closing.find((c) => c.slug === i.slug) ?? i);
    for (const c of closing) if (!current.some((i) => i.slug === c.slug)) current.push(c);
    if (current.length === 0) throw new Error("Energimyndigheten lists no current calls (bot challenge or layout change?)");
    const batch = current.slice(offset, offset + BATCH);
    const details = await mapLimit(batch, 2, async (item) => parseDetail(await fetchHtml(`${LIST_URL}${item.slug}/`, UA)));
    const grants = batch.map((item, i) => normalize(item, details[i] ?? null, false));
    const raws: Page["raws"] = batch.map((item, i) => ({ source_id: item.slug, payload: { item, detail: details[i] } }));
    const next = offset + BATCH;
    if (next >= current.length) {
      for (const item of parseList(html, "past")) {
        if (current.some((i) => i.slug === item.slug)) continue;
        grants.push(normalize(item, null, true));
        raws.push({ source_id: item.slug, payload: { item } });
      }
    }
    return { grants, raws, next: next < current.length ? JSON.stringify({ offset: next } satisfies Cursor) : null };
  },
};
