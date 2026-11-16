import type { Grant } from "@grantledger/schema";
import { dmyToIso, fetchJson, mapLimit, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Belgium, King Baudouin Foundation (KBS-FRB): calls for projects, prizes and grants of the foundation and of the
// funds it manages. The site search runs on a JSON endpoint (/en/api/v1/elastic-search, 8 records a page whatever
// per_page says) with filters for the content type (call), the status (call_status "open"; the only other value,
// "announced", is the ended calls, so there is no upcoming list) and the language. A call is one Drupal node with up
// to four translations that share the node id (nid); a translation flagged language_incomplete is an untranslated
// copy of another language. To keep one record per call the adapter walks the languages in the order en, fr, nl, de
// and takes each nid the first time it meets a complete translation: the cursor carries the nids already taken.
// The indexed body mixes Dutch interface labels into every language, so the text, the start date, the amount and the
// documents come from the call page (one request per kept record, 9 requests per fetchPage at most).
// Cloudflare sits in front; robots.txt allows crawling for search use (Content-Signal search=yes, ai-train=no).
const SITE = "https://kbs-frb.be";
const API = `${SITE}/en/api/v1/elastic-search`;
const LICENSE = "King Baudouin Foundation public call information (kbs-frb.be)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const LANGS = ["en", "fr", "nl", "de"] as const;

interface Cursor { lang: number; page: number; seen: string[] }
interface Rec {
  nid: string;
  language: string;
  language_incomplete?: string;
  title: string;
  url: string;
  short_description?: string;
  call_deadline?: string;
  call_status?: string;
  changed?: string;
}
// records.page is a list, or an object keyed by position when the server dropped a row from the page.
interface Response { info?: { page?: { num_pages?: number } }; records?: { page?: Rec[] | Record<string, Rec> } }

const plain = (html: string | undefined) => (html ? stripHtml(html).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() : "");

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function normalize(r: Rec, html: string): Grant {
  const start = html.indexOf('<div class="l-sidebar-sticky ');
  const end = html.indexOf('<div class="l-section-kbs', start);
  const article = start === -1 ? "" : html.slice(start, end === -1 ? undefined : end);
  // Sidebar boxes: "Timing" (start, submit until) and "Support" (amount, or "until" an amount).
  const boxes = [...article.matchAll(/<div class="l-sidebar-sticky__sidebar-item">([\s\S]*?)<\/div>\s*(?=<div class="l-sidebar-sticky__sidebar-item">|<div id="block-ausysocialmediasharingblock")/g)].map((m) => plain(m[1]).replace(/\n/g, " ").replace(/:\s+/g, ": "));
  const header = article.match(/<header class="l-sidebar-sticky__header">([\s\S]*?)<\/header>/)?.[1] ?? "";
  const kind = plain(header.match(/<div class="text-upper-label mb-2">([\s\S]*?)<\/div>/)?.[1]);
  const programme = plain(header.match(/text-upper-label-links">([\s\S]*?)<\/div>/)?.[1]).replace(/\n/g, ", ");
  const title = plain(header.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) || r.title.trim();
  // The body without the contact sections (names, phone numbers).
  const content = (article.split('<div class="l-sidebar-sticky__content">')[1] ?? "").replace(/<section\b(?:(?!<section\b)[\s\S])*?class="l-author"[\s\S]*?<\/section>/g, " ");
  const body = plain(content);
  const documents: Grant["documents"] = [];
  for (const m of content.matchAll(/<a\s[^>]*href="(https:\/\/media\.kbs-frb\.be\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = (m[1] as string).replace(/&amp;/g, "&").replace(/ /g, "%20");
    if (!documents.some((d) => d.url === url)) documents.push({ title: plain(m[2]) || "Document", url });
  }
  const closes = toIso(r.call_deadline);
  const opens = boxes.join(" ").match(/\d{2}\/\d{2}\/\d{4}/g)?.map((d) => dmyToIso(d)).find((d) => d && (!closes || d < closes)) ?? null;
  // "Until: € 100,000" (en), "Montant: 5.000 €" (fr), "Vanaf € 750 tot € 3.500" (nl): the numbers at the start of
  // the box that carries no dates; two numbers are a range.
  const money = (boxes.find((b) => !/\d{2}\/\d{2}\/\d{4}/.test(b))?.slice(0, 48).match(/\d[\d.,]*\d|\d/g) ?? []).slice(0, 2).map((n) => Number(n.replace(/[.,]\d{2}$/, "").replace(/[.,]/g, ""))).filter((n) => Number.isFinite(n) && n > 1);
  const max = money.at(-1) ?? null;
  const min = money.length === 2 ? (money[0] as number) : null;
  const summary = [kind, r.short_description?.trim(), programme && `Programme: ${programme}`, ...boxes, body].filter(Boolean).join("\n\n").slice(0, 20000);
  const dated = statusFromDates(opens, closes);
  return {
    id: `be_kbs:${r.nid}`,
    source: "be_kbs",
    source_id: r.nid,
    source_url: r.url,
    source_license: LICENSE,
    title,
    title_lang: r.language,
    summary: summary || null,
    funder_name: "King Baudouin Foundation",
    funder_level: "national",
    country: "BE",
    regions: [],
    funding_types: /\b(prize|prix|prijs|preis|award)\b/i.test(`${title} ${kind}`) ? ["prize"] : ["grant"],
    beneficiary_types: [],
    sectors: programme ? [programme] : [],
    amount_min: min !== null && max !== null && min < max ? min : null,
    amount_max: max,
    budget_total: null,
    currency: "EUR",
    status: dated === "unknown" ? "open" : dated,
    opens_at: opens,
    closes_at: closes,
    documents,
    source_updated_at: toIso(r.changed),
  };
}

export const beKbs: Source = {
  id: "be_kbs",
  license: LICENSE,
  start() {
    return JSON.stringify({ lang: 0, page: 1, seen: [] } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const lang = LANGS[c.lang] as string;
    const data = await fetchJson<Response>(`${API}?search=&page=${c.page}&filters[type_id][]=call&filters[call_status][]=open&filters[language][]=${lang}`, { headers: { ...UA, accept: "application/json" } });
    if (!data.info?.page) throw new Error("King Baudouin Foundation search returned an unexpected response (bot challenge or changed API?)");
    const records = Object.values(data.records?.page ?? {}).filter((r) => r.nid && r.url && r.title);
    // The French list is never empty: the foundation publishes every call in French or Dutch.
    if (records.length === 0 && lang === "fr" && c.page === 1) throw new Error("King Baudouin Foundation returned no open calls in French (bot challenge or changed API?)");
    const seen = new Set(c.seen);
    const kept = records.filter((r) => r.language_incomplete !== "1" && /^https:\/\//.test(r.url) && !seen.has(r.nid) && seen.add(r.nid));
    const pages = await mapLimit(kept, 2, (r) => get(r.url));
    const grants = kept.map((r, i) => normalize(r, pages[i] as string));
    const more = records.length > 0 && c.page < (data.info.page.num_pages ?? 0);
    const next: Cursor | null = more ? { lang: c.lang, page: c.page + 1, seen: [...seen] } : c.lang + 1 < LANGS.length ? { lang: c.lang + 1, page: 1, seen: [...seen] } : null;
    return { grants, raws: kept.map((r) => ({ source_id: r.nid, payload: r })), next: next ? JSON.stringify(next) : null };
  },
};
