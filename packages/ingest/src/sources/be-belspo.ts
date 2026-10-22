import type { Grant } from "@grantledger/schema";
import { statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Belgium, BELSPO (Belgian Science Policy Office): one server-rendered calls page, no API, RSS or sitemap.
// Open calls are "frame" boxes, permanent schemes are "bottomline" boxes, past calls sit in a "Closed calls" list
// whose date is the final submission deadline. robots.txt asks for a 15 s crawl delay and disallows /brain-be/ and
// /FED-tWIN/, so only this page is read.
const SITE = "https://www.belspo.be";
const LIST = `${SITE}/belspo/organisation/call_en.stm`;
const LICENSE = "BELSPO public call information";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "en-GB,en;q=0.9,fr;q=0.8,nl;q=0.7" };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

interface Item { kind: "call" | "scheme" | "closed"; slug: string; url: string; title: string; text: string; closes: string | null }

// "30 October 2026 at 4 PM", "1 Octobre 2026 @ 14:00" (sic). Time as printed (Brussels), end of day when absent.
const EN_DATE = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})(?:\s*(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?)?/gi;
function enDates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(EN_DATE)) {
    const month = MONTHS.indexOf(m[2]!.toLowerCase());
    if (month < 0) continue;
    let hour = m[4] ? Number(m[4]) : 23;
    if (m[6]?.toUpperCase() === "PM" && hour < 12) hour += 12;
    const minute = m[4] ? (m[5] ?? "00") : "59";
    out.push(`${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00.000Z`);
  }
  return out;
}

// Stable id from the call page path: language suffix and extension dropped so the FR/NL variants share it.
function slugOf(href: string | undefined): { url: string; slug: string } | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href, LIST);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const path = u.pathname.replace(/\.(stm|html?)$/i, "").replace(/_(en|fr|nl)$/i, "").replace(/\/$/, "");
  const slug = (u.hostname === "www.belspo.be" ? path.replace(/^\/belspo\//, "") : `${u.hostname}${path}`).replace(/^\/+/, "");
  return slug ? { url: u.href, slug } : null;
}

const href = (block: string, re = /<a[^>]*href="([^"#]+)"/i) => block.match(re)?.[1];
const text = (s: string) => stripHtml(s).split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

function parse(html: string): Item[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  // Everything before the "European Calls and Projects" anchor is BELSPO's own funding; the rest points at ERC, COST, ESA...
  const own = clean.split('<a name="call_eu">')[0] ?? "";
  const items: Item[] = [];
  for (const frame of own.match(/<div class="frame ultralightblue">[\s\S]*?<\/div>/g) ?? []) {
    const link = slugOf(href(frame, /<a[^>]*href="([^"#]+)"[^>]*>\s*Read more/i) ?? href(frame));
    if (!link) continue;
    const h2 = text(frame.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "").replace(/\s+/g, " ");
    // The P4Science box has a logo instead of a heading; the call name sits in a red span.
    const title = h2 || text(frame.match(/<span class="aspred[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? "") || link.slug;
    const body = text(frame).replace(/\n?Read more.*$/i, "");
    items.push({ kind: "call", ...link, title, text: body, closes: enDates(body).at(-1) ?? null });
  }
  for (const box of own.match(/<div class="(?:last)?bottomline">[\s\S]*?<\/div>/gi) ?? []) {
    const link = slugOf(href(box));
    if (!link) continue;
    const label = text(box.match(/<p class="date">([\s\S]*?)<\/p>/)?.[1] ?? "");
    const title = text(box.match(/<p class="title">([\s\S]*?)<\/p>/)?.[1] ?? "").replace(/\s+/g, " ") || link.slug;
    const body = text(box.match(/<p class="title">[\s\S]*?<\/p>([\s\S]*)$/)?.[1] ?? "").replace(/\n?(Read more|Permanent funding scheme).*$/i, "");
    items.push({ kind: "scheme", ...link, title, text: [label, body].filter(Boolean).join("\n\n"), closes: null });
  }
  const closedList = clean.match(/<h2 class="cap">Closed calls<\/h2>\s*<ul>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  for (const li of closedList.match(/<li>[\s\S]*?<\/li>/g) ?? []) {
    const link = slugOf(href(li));
    const date = li.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!link || !date) continue;
    const title = text(li).replace(/^\s*\d{2}\.\d{2}\.\d{4}\s*-\s*/, "").replace(/\s+/g, " ");
    items.push({ kind: "closed", ...link, title, text: title, closes: `${date[3]}-${date[2]}-${date[1]}T23:59:00.000Z` });
  }
  // The closed list repeats a page when a call ran twice; the first (latest) entry wins.
  const seen = new Set<string>();
  return items.filter((x) => !seen.has(x.slug) && seen.add(x.slug));
}

function normalize(item: Item): Grant {
  const who = item.text.toLowerCase();
  const advances = /reimbursable advance/.test(who);
  const status: Grant["status"] = item.kind === "closed" ? "closed" : item.closes ? statusFromDates(null, item.closes) : "open";
  return {
    id: `be_belspo:${item.slug}`,
    source: "be_belspo",
    source_id: item.slug,
    source_url: item.url,
    source_license: LICENSE,
    title: item.title,
    title_lang: "en",
    summary: item.text || null,
    funder_name: "BELSPO",
    funder_level: "national",
    country: "BE",
    regions: [],
    funding_types: [advances ? "loan" : "grant"],
    beneficiary_types: /industr|compan/.test(who) && !/scientific institution|researcher/.test(who) ? ["company"] : ["research_org"],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: null,
    closes_at: item.closes,
    documents: [],
    source_updated_at: null,
  };
}

export const beBelspo: Source = {
  id: "be_belspo",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(): Promise<Page> {
    const res = await fetch(LIST, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for BELSPO calls page`);
    const items = parse(await res.text());
    if (items.length === 0) throw new Error("BELSPO calls page yielded no items (layout changed?)");
    return { grants: items.map(normalize), raws: items.map((x) => ({ source_id: x.slug, payload: x })), next: null };
  },
};
