import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Germany, DFG (Deutsche Forschungsgemeinschaft): the "Informationen für die Wissenschaft: Ausschreibungen" page lists
// the calls for proposals that are currently open (one server-rendered list, about 15 entries). The RSS feed
// (service/rss/de/323556/feed.rss) mixes calls with programme notices and reports, so the curated calls page is the list
// and each call's page supplies the text and the deadline. Deadlines only appear in prose ("by 13 January 2027",
// "bis zum 1. Dezember 2026"), so they are extracted from sentences that carry a submission cue.
const SITE = "https://www.dfg.de";
const LIST_URL = `${SITE}/de/foerderung/foerdermoeglichkeiten/ausschreibungen`;
const LICENSE = "DFG public calls for proposals (Informationen für die Wissenschaft)";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "de-DE,de;q=0.9,en;q=0.8" };

interface Item { slug: string; url: string; title: string; published: string | null }

const MONTHS: Record<string, number> = {
  januar: 1, january: 1, februar: 2, february: 2, märz: 3, maerz: 3, march: 3, april: 4, mai: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7,
  august: 8, september: 9, oktober: 10, october: 10, november: 11, dezember: 12, december: 12,
};
const MONTH_RE = "januar|january|februar|february|märz|maerz|march|april|mai|may|juni|june|juli|july|august|september|oktober|october|november|dezember|december";
// "13 January 2027", "1. Dezember 2026", "2 December2026" (the site sometimes drops the space) and "30.11.2026".
const DATE_RE = new RegExp(`\\b(\\d{1,2})\\.?\\s*(${MONTH_RE})\\s*(\\d{4})\\b|\\b(\\d{2})\\.(\\d{2})\\.(\\d{4})\\b`, "gi");

function isoDate(y: string, m: number, d: string): string | null {
  const iso = `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00.000Z`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function datesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const iso = m[1] ? isoDate(m[3]!, MONTHS[m[2]!.toLowerCase()] ?? 0, m[1]) : isoDate(m[6]!, Number(m[5]), m[4]!);
    if (iso) out.push(iso);
  }
  return out;
}

// First submission deadline after the publication date: multi-stage calls (letter of intent, draft, full proposal)
// name several dates and the earliest one is what an applicant must meet first. Registration deadlines for the
// elan portal and dates without a submission cue (events, contract terms) are skipped.
function deadline(text: string, published: string | null): string | null {
  let best: string | null = null;
  // Sentences end at a full stop after a letter: "1. Dezember" must stay in one piece.
  for (const sentence of text.split(/(?<=[a-zäöüß)][.!?])\s+|\n/i)) {
    if (!/\b(by|bis|spätestens|deadline|frist|annahmeschluss|bewerbungsschluss|einzureichen|eingereicht|einreichung|submit|submitted|submission|no later than|not later than|until)\b/i.test(sentence)) continue;
    if (/regist/i.test(sentence)) continue;
    for (const d of datesIn(sentence)) {
      if (published && d < published) continue;
      if (!best || d < best) best = d;
    }
  }
  return best;
}

function parseList(html: string): Item[] {
  const items: Item[] = [];
  for (const block of html.match(/<div role="listitem" class="e-pressrelease-teaser">[\s\S]*?<\/a>/g) ?? []) {
    const m = block.match(/href="(\/de\/aktuelles\/neuigkeiten-themen\/info-wissenschaft\/\d{4}\/(ifw-\d+-\d+))"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    const published = datesIn(stripHtml(block.slice(0, block.indexOf("<a "))))[0] ?? null;
    items.push({ slug: m[2]!, url: `${SITE}${m[1]}`, title: stripHtml(m[3]!).replace(/\s+/g, " ").trim() || m[2]!, published });
  }
  return items;
}

// Call text without the contact table and the privacy notice that close every page.
function parseDetail(html: string): string {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "";
  const cut = main.search(/<h2><strong>(Datenschutz|Privacy Policy)<\/strong>/);
  return stripHtml(cut === -1 ? main : main.slice(0, cut))
    .replace(/\((interner|externer) Link\)/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(it: Item, text: string): Grant {
  const closes = deadline(text, it.published);
  const now = new Date().toISOString();
  return {
    id: `de_dfg:${it.slug}`,
    source: "de_dfg",
    source_id: it.slug,
    source_url: it.url,
    source_license: LICENSE,
    title: it.title,
    title_lang: "de",
    summary: text.slice(0, 12000) || null,
    funder_name: "DFG",
    funder_level: "national",
    country: "DE",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: ["research_org", "individual"],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    // The page lists open calls only, so a call without a readable deadline is open.
    status: closes && closes < now ? "closed" : "open",
    opens_at: it.published,
    closes_at: closes,
    documents: [],
    source_updated_at: it.published,
  };
}

export const deDfg: Source = {
  id: "de_dfg",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(): Promise<Page> {
    const items = parseList(await fetchHtml(LIST_URL, UA));
    const texts = await mapLimit(items, 4, async (it) => {
      try {
        return parseDetail(await fetchHtml(it.url, UA));
      } catch (err) {
        console.warn(`de_dfg: ${it.slug} page failed, keeping the list entry: ${String(err)}`);
        return "";
      }
    });
    const grants = items.map((it, i) => normalize(it, texts[i] ?? ""));
    return { grants, raws: items.map((it, i) => ({ source_id: it.slug, payload: { ...it, text: (texts[i] ?? "").slice(0, 1500) } })), next: null };
  },
};
