import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Finland, Research Council of Finland (Suomen Akatemia): open and upcoming calls for research funding. The English
// list page is server-rendered, grouped by funding category, with the opening and closing date of each call; each
// call page adds a fact box (opens, closes, funding, funding period, state) and the call text. The English list holds
// the same calls as the Finnish one except the calls by invitation ("kutsuhaku"), which are not open to others, so
// the English pages are read. Calls "in preparation" at the foot of the list have no page and no dates and are left
// out. About a dozen calls: the list is fetched again on every fetchPage call and the cursor is the offset into it.
const SITE = "https://www.aka.fi";
const LIST_URL = `${SITE}/en/research-funding/apply-for-funding/calls-for-applications/`;
const LICENSE = "Research Council of Finland public call information (aka.fi)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const BATCH = 20;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

interface Item { path: string; title: string; category: string; opens: string; closes: string }
interface Detail { facts: [string, string][]; text: string; documents: Grant["documents"] }

function plain(html: string | null | undefined): string {
  return html ? stripHtml(html).replace(/[\u00a0\u200b]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim() : "";
}
const oneLine = (html: string | null | undefined) => plain(html).replace(/\n/g, " ");

// A Finnish wall-clock time as ISO in UTC. Finland is UTC+3 from the last Sunday of March to the last Sunday of
// October, else UTC+2; `behind` is 1 for a time given in Central European time.
function helsinkiIso(year: number, month: number, day: number, hour: number, minute: number, behind = 0): string {
  const lastSunday = (m: number) => { const end = new Date(Date.UTC(year, m + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
  const summer = (month > 2 && month < 9) || (month === 2 && day >= lastSunday(2)) || (month === 9 && day < lastSunday(9));
  return new Date(Date.UTC(year, month, day, hour - (summer ? 3 : 2) + behind, minute)).toISOString();
}

// Every date in "18 Nov 2026 at 23.59 Finnish time", "2 Dec 2026 at 13.00 CET" or "4 Nov 2026 (pre-proposals)".
// A date without an hour is kept as that day: an opening at 00:00, a closing at 23:59:59.
function dates(text: string, endOfDay: boolean): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(\d{1,2}) ([A-Za-z]{3,9})\.? (\d{4})(?: at (\d{1,2})[.:](\d{2})(?: (CES?T|UTC))?)?/g)) {
    const month = MONTHS.indexOf((m[2] as string).slice(0, 3).toLowerCase());
    if (month < 0) continue;
    const [year, day] = [Number(m[3]), Number(m[1])];
    if (m[4] === undefined) out.push(`${m[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z`);
    else if (m[6] === "UTC") out.push(new Date(Date.UTC(year, month, day, Number(m[4]), Number(m[5]))).toISOString());
    else out.push(helsinkiIso(year, month, day, Number(m[4]), Number(m[5]), m[6] ? 1 : 0));
  }
  return out.sort();
}

function parseList(html: string): Item[] {
  const items: Item[] = [];
  let category = "";
  for (const m of html.matchAll(/<H2 class="application-title">([\s\S]*?)<\/H2>|<div class="application-box">([\s\S]*?)(?=<div class="application-box">|<H2 class="application-title">|<\/article>)/gi)) {
    if (m[1] !== undefined) {
      category = oneLine(m[1]);
      continue;
    }
    const box = m[2] as string;
    const link = box.match(/<h3>\s*<a href="(\/en\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    items.push({
      path: link[1] as string,
      title: oneLine(link[2]),
      category,
      opens: oneLine(box.match(/class="app-start[^"]*">\s*<strong>[\s\S]*?<\/strong>([\s\S]*?)<\/div>/)?.[1]),
      closes: oneLine(box.match(/class="app-end[^"]*">\s*<strong>[\s\S]*?<\/strong>([\s\S]*?)<\/div>/)?.[1]),
    });
  }
  return items;
}

async function detail(path: string): Promise<Detail> {
  const html = await fetchHtml(`${SITE}${path}`, UA);
  const start = html.indexOf("<article>");
  const end = html.indexOf("<aside", start);
  const article = start >= 0 ? html.slice(start, end > start ? end : undefined) : "";
  const box = article.match(/<div class="fundingcallinfo">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? "";
  const facts = [...box.matchAll(/<label>([\s\S]*?)<\/label>\s*<div[^>]*>([\s\S]*?)<\/div>/g)].map((m): [string, string] => [oneLine(m[1]).replace(/:$/, ""), oneLine(m[2])]).filter((f) => f[0] && f[1]);
  // The call text: everything after the title and the fact box, without the "Open all" control of the accordion.
  const body = article.replace(/<header>[\s\S]*?<\/header>/, "").replace(box, "").replace(/<a href="#" class="accordion-btn"[\s\S]*?<\/a>/g, "");
  const documents: Grant["documents"] = [];
  for (const m of article.matchAll(/<a\s[^>]*href="([^"]+\.(?:pdf|docx?|xlsx?))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = oneLine(m[2]);
    try {
      const url = new URL(m[1] as string, SITE).href;
      if (title && url.startsWith("https://") && !documents.some((d) => d.url === url)) documents.push({ title, url });
    } catch {
      // A malformed link is not a document.
    }
  }
  return { facts, text: plain(body), documents };
}

// "€8 million", "some €24m for first 3-year period", "NOK 115 million", "8 million euros".
function funding(text: string): { total: number | null; currency: string } {
  const m = text.match(/(€|EUR|NOK|SEK|DKK)\s?(\d[\d,.]*)\s*(million|m\b|billion)?/i) ?? text.match(/()(\d[\d,.]*)\s*(million|billion)?\s*euros?/i);
  if (!m) return { total: null, currency: "EUR" };
  const scale = /^b/i.test(m[3] ?? "") ? 1e9 : m[3] ? 1e6 : 1;
  // With a scale word the separator is a decimal point ("€2.75 million"), without one it groups thousands ("€300,000").
  const value = num(m[3] ? (m[2] as string).replace(",", ".") : (m[2] as string).replace(/[,.]/g, ""));
  const symbol = (m[1] as string).toUpperCase();
  return { total: value === null ? null : Math.round(value * scale), currency: symbol === "" || symbol === "€" ? "EUR" : symbol };
}

function normalize(it: Item, d: Detail): Grant {
  const fact = (name: string) => d.facts.find((f) => f[0].toLowerCase() === name)?.[1] ?? "";
  const opens = dates(fact("call opens") || it.opens, false)[0] ?? null;
  const closes = dates(fact("call closes") || it.closes, true).at(-1) ?? null;
  const state = fact("state").toLowerCase();
  const now = new Date().toISOString();
  // The state of the fact box, except that "Upcoming" is not kept once the opening date has passed.
  const status: Grant["status"] = closes && closes < now ? "closed" : state === "open" ? "open" : state === "upcoming" ? (opens && opens <= now ? "open" : "forthcoming") : state === "closed" ? "closed" : statusFromDates(opens, closes);
  const money = funding(fact("funding"));
  const slug = it.path.replace(/\/+$/, "").split("/").pop() as string;
  const facts = d.facts.length ? d.facts : ([["Call opens", it.opens], ["Call closes", it.closes]] as [string, string][]).filter((f) => f[1]);
  const summary = [[it.category && `Funding category: ${it.category}`, ...facts.map((f) => `${f[0]}: ${f[1]}`)].filter(Boolean).join("\n"), d.text].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `fi_aka:${slug}`,
    source: "fi_aka",
    source_id: slug,
    source_url: `${SITE}${it.path}`,
    source_license: LICENSE,
    title: it.title,
    title_lang: "en",
    summary: summary || null,
    funder_name: "Research Council of Finland",
    funder_level: "national",
    country: "FI",
    regions: [],
    funding_types: ["grant"],
    // Research funding: the applicant is a researcher or a research organisation as the site of research.
    beneficiary_types: /^for researchers/i.test(it.category) ? ["individual", "research_org"] : ["research_org"],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: money.total,
    currency: money.currency,
    status,
    opens_at: opens,
    closes_at: closes,
    documents: d.documents,
    source_updated_at: null,
  };
}

export const fiAka: Source = {
  id: "fi_aka",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const offset = Number(cursor);
    const all = parseList(await fetchHtml(LIST_URL, UA));
    if (all.length === 0) throw new Error("Research Council of Finland lists no calls (changed markup?)");
    const items = all.slice(offset, offset + BATCH);
    const details = await mapLimit(items, 2, (it) => detail(it.path));
    const grants = items.map((it, i) => normalize(it, details[i] as Detail));
    return {
      grants,
      raws: items.map((it, i) => ({ source_id: grants[i]!.source_id, payload: { ...it, facts: details[i]?.facts ?? [] } })),
      next: offset + BATCH < all.length ? String(offset + BATCH) : null,
    };
  },
};
