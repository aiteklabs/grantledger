import type { Grant } from "@grantledger/schema";
import { mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Denmark, Innovationsfonden (Innovation Fund Denmark, since 2026 "Danmarks Innovationsfond"): innovationsfonden.dk
// redirects to danmarksinnovationsfond.dk, a WordPress site. The "Søg investering" page lists every open and
// announced call across the programmes (Innobooster, Innofounder, Innoexplorer, Grand Solutions, Innomissions,
// Erhvervsforsker, international partnership calls) with opening and closing dates; closed calls drop off the list.
// Each call page carries the intro, the "Hvem? / Hvad? / Hvor meget?" cards and article:modified_time. The WP REST
// API (/da/wp-json/wp/v2/call) exposes the same posts but without dates, so the HTML is the source of the ledger.
const SITE = "https://danmarksinnovationsfond.dk";
const LIST_URL = `${SITE}/da/soeg-investering/`;
const LICENSE = "Innovationsfonden public call information";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "da-DK,da;q=0.9,en;q=0.8" };
// The host (Simply.com) answers bursts of requests with a "454 Checking your browser" proof-of-work page that sticks
// to the IP for a few minutes; a handful of requests spaced out passes. Call pages fetched per page, one at a time.
const BATCH = 5;
const PAUSE_MS = 2000;
const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAJ: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OKT: "10", NOV: "11", DEC: "12" };

interface Cursor { offset: number }

interface ListItem { slug: string; url: string; title: string; opens: string; closes: string }

interface Detail { intro: string; who: string; what: string; howMuch: string; modified: string | null }

async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  const html = await res.text();
  if (res.status === 454 || /sc-challenge|\.sc-verify\//.test(html)) throw new Error(`Innovationsfonden WAF challenge (454) for ${url}; retry after a pause`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return html;
}

// "20 AUG 2026" or "10 NOV 2026 kl. 15.00". Times are Copenhagen local; kept as given, which errs by at most two hours.
function dkDate(v: string, fallbackTime: string): string | null {
  const m = v.match(/(\d{1,2})\s+([A-ZÆØÅ]{3})\s+(\d{4})(?:\s+kl\.?\s*(\d{1,2})[.:](\d{2}))?/i);
  const month = m ? MONTHS[m[2]!.toUpperCase()] : undefined;
  if (!m || !month) return null;
  const time = m[4] ? `${m[4].padStart(2, "0")}:${m[5]}:00` : fallbackTime;
  return `${m[3]}-${month}-${m[1]!.padStart(2, "0")}T${time}.000Z`;
}

function parseList(html: string): ListItem[] {
  const out: ListItem[] = [];
  for (const block of html.match(/<div data-id="\d+"\s+class="item list call">[\s\S]*?<div class="list-item-foot"/g) ?? []) {
    const url = block.match(/<a href="(https:\/\/danmarksinnovationsfond\.dk\/da\/soegemuligheder\/[^"]+)"/)?.[1];
    if (!url) continue;
    const slug = url.replace(/\/$/, "").split("/").pop()!;
    const info = (label: string) => stripHtml(block.match(new RegExp(`<span>${label}</span>\\s*<p>([^<]*)</p>`))?.[1] ?? "").trim();
    out.push({ slug, url, title: stripHtml(block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? slug).trim(), opens: info("Åbner"), closes: info("Lukker") });
  }
  return out;
}

function parseDetail(html: string): Detail {
  const card = (label: string) => stripHtml(html.match(new RegExp(`<h3 class="h4">${label}\\?</h3><div class="html_content">([\\s\\S]*?)</div></div></div>`))?.[1] ?? "").trim();
  return {
    intro: stripHtml(html.match(/<p class="manchet">([\s\S]*?)<\/p>/)?.[1] ?? "").trim(),
    who: card("Hvem"),
    what: card("Hvad"),
    howMuch: card("Hvor meget"),
    modified: html.match(/property="article:modified_time" content="([^"]+)"/)?.[1] ?? null,
  };
}

// "fra 200.000 kr. og op til 5 mio. kr.", "op til 100.000 kr.", "maksimalt 2,5 mio. DKK".
function kr(text: string): number | null {
  const m = text.match(/([\d.]+(?:,\d+)?)\s*(mio\.?\s*)?(?:kr\.?|DKK)/i);
  if (!m) return null;
  const n = num(m[1]!.replace(/\./g, "").replace(",", "."));
  return n === null ? null : m[2] ? Math.round(n * 1_000_000) : n;
}

function amounts(text: string): { min: number | null; max: number | null } {
  const range = text.match(/fra\s+([\d.,]+\s*(?:mio\.?\s*)?(?:kr\.?|DKK))[\s\S]{0,40}?(?:op\s+)?til\s+([\d.,]+\s*(?:mio\.?\s*)?(?:kr\.?|DKK))/i);
  if (range) return { min: kr(range[1]!), max: kr(range[2]!) };
  const upTo = text.match(/(?:op til|maks\.?|maksimalt|højst)\s+([\d.,]+\s*(?:mio\.?\s*)?(?:kr\.?|DKK))/i);
  return { min: null, max: upTo ? kr(upTo[1]!) : null };
}

function normalize(item: ListItem, detail: Detail): Grant {
  const opens = dkDate(item.opens, "00:00:00");
  const closes = dkDate(item.closes, "23:59:59");
  const who = detail.who.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (/små og mellemstore|smv/.test(who)) bens.add("sme");
  if (/iværksætter|start-?up/.test(who)) bens.add("startup");
  if (/virksomhed/.test(who)) bens.add("company");
  if (/forsk|universitet|videninstitution|gts/.test(who)) bens.add("research_org");
  if (/offentlig|kommune|region|ministeri|styrelse/.test(who)) bens.add("public_body");
  if (/forening|ngo/.test(who)) bens.add("ngo");
  const { min, max } = amounts(detail.howMuch);
  const summary = [
    detail.intro,
    detail.who ? `Hvem kan søge: ${detail.who}` : "",
    detail.what ? `Hvad: ${detail.what}` : "",
    detail.howMuch ? `Hvor meget: ${detail.howMuch}` : "",
    item.opens ? `Åbner: ${item.opens}` : "",
    item.closes ? `Lukker: ${item.closes}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 4000) || null;
  return {
    id: `dk_innovationsfonden:${item.slug}`,
    source: "dk_innovationsfonden",
    source_id: item.slug,
    source_url: item.url,
    source_license: LICENSE,
    title: item.title,
    title_lang: "da",
    summary,
    funder_name: "Innovationsfonden",
    funder_level: "national",
    country: "DK",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: min,
    amount_max: max,
    budget_total: null,
    currency: "DKK",
    // The list only shows open and announced calls, so a row without parseable dates is open.
    status: opens || closes ? statusFromDates(opens, closes) : "open",
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: detail.modified ? new Date(detail.modified).toISOString() : null,
  };
}

export const dkInnovationsfonden: Source = {
  id: "dk_innovationsfonden",
  license: LICENSE,
  start() {
    return JSON.stringify({ offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const html = await fetchPageHtml(LIST_URL);
    const items = parseList(html);
    // The page prints "Der er lige nu ingen søgemuligheder" when nothing is open; anything else without rows is a layout change.
    if (items.length === 0 && !/ingen søgemuligheder/.test(html)) throw new Error("Innovationsfonden list has no call rows (layout change?)");
    const batch = items.slice(c.offset, c.offset + BATCH);
    const details = await mapLimit(batch, 1, async (item) => {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
      return parseDetail(await fetchPageHtml(item.url));
    });
    const grants = batch.map((item, i) => normalize(item, details[i] as Detail));
    const next: Cursor | null = c.offset + BATCH < items.length ? { offset: c.offset + BATCH } : null;
    return { grants, raws: batch.map((item, i) => ({ source_id: item.slug, payload: { ...item, ...details[i] } })), next: next ? JSON.stringify(next) : null };
  },
};
