import type { Grant } from "@grantledger/schema";
import { fetchHtml, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Estonia, Eesti Teadusagentuur (Estonian Research Council, ETAG): application rounds for research funding, the
// agency's own programmes and the joint calls it takes part in (Horizon Europe partnerships, NordForsk, bilateral
// schemes). The page "Avatud taotlusvoorud" is server-rendered: an open block and an archived block, each row with
// a title, an opening date and one or two deadlines. Open rows link to a news post on etag.ee that holds the call
// text. The REST type ama-appl-rounds lists the same rounds but with empty content and no dates, so it is not used.
// robots.txt asks for a 10 second crawl delay: one request per fetchPage call with that pause before it. Archived
// rows are listed from the page without a detail request.
const LIST_URL = "https://etag.ee/konkursid-ja-uritused/avatud-taotlusvoorud/";
const LICENSE = "Eesti Teadusagentuur public call information (etag.ee)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CRAWL_DELAY_MS = 10_000;
const MONTHS = ["jaanuar", "veebruar", "märts", "aprill", "mai", "juuni", "juuli", "august", "september", "oktoober", "november", "detsember"];

interface Item { id: string; title: string; url: string | null; external: string | null; dates: string[]; opens: string | null; closes: string | null; status: Grant["status"] }

const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));

// "23. juuni 2026" -> "2026-06-23"
function etDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.\s*([a-zäöüõ]+)\s+(\d{4})/i);
  const month = m ? MONTHS.indexOf((m[2] as string).toLowerCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}` : null;
}

function slugify(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// The rows carry no id of their own and the linked news post changes, so the id is the title plus the opening date
// (the same programme opens a new round every year under the same title).
function parseList(html: string): Item[] {
  const archivedFrom = html.indexOf("ama-application-rounds__closed");
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<(a|div)\b([^>]*\bclass="application-round"[^>]*)>([\s\S]*?)<\/\1>/g)) {
    const inner = m[3] as string;
    const title = stripHtml(inner.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] ?? "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    const href = (m[2] as string).match(/href="([^"]+)"/)?.[1] ?? null;
    let opens: string | null = null;
    let closes: string | null = null;
    const dates: string[] = [];
    for (const li of inner.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
      const line = stripHtml(li[1] as string).replace(/\s+/g, " ").trim();
      const date = etDate(line);
      dates.push(line);
      if (!date) continue;
      if (/^Avatud alates/i.test(line)) opens = `${date}T00:00:00.000Z`;
      else if (/tähtaeg/i.test(line) && (!closes || `${date}T23:59:59.000Z` > closes)) closes = `${date}T23:59:59.000Z`;
    }
    const id = `${slugify(title).slice(0, 90)}${opens ? `-${opens.slice(0, 10)}` : ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const archived = archivedFrom !== -1 && (m.index ?? 0) > archivedFrom;
    const own = href && /^https:\/\/(www\.)?etag\.ee\//.test(href) ? href : null;
    items.push({ id, title, url: own, external: href && !own && /^https?:\/\//.test(href) ? href : null, dates, opens, closes, status: archived ? "closed" : statusFromDates(opens, closes) });
  }
  return items;
}

// The call text of a news or event post: everything between the page heading and the sidebar.
function body(html: string): string {
  const from = html.indexOf("<h1");
  if (from === -1) return "";
  const sidebar = html.indexOf('<div class="block__sidebar', from);
  const main = html.indexOf("</main>", from);
  const to = sidebar !== -1 ? sidebar : main !== -1 ? main : html.length;
  return stripHtml(html.slice(from, to)).split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function grant(item: Item, text: string): Grant {
  const summary = [item.dates.join("\n"), item.external && `Lisainfo: ${item.external}`, text].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `ee_etag:${item.id}`,
    source: "ee_etag",
    source_id: item.id,
    source_url: item.url ?? LIST_URL,
    source_license: LICENSE,
    title: item.title,
    title_lang: "et",
    summary: summary || null,
    funder_name: "Eesti Teadusagentuur",
    funder_level: "national",
    country: "EE",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: ["research_org"],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: item.status,
    opens_at: item.opens,
    closes_at: item.closes,
    documents: [],
    source_updated_at: null,
  };
}

const page = (items: Item[], texts: string[], rest: Item[]): Page => ({
  grants: items.map((item, i) => grant(item, texts[i] ?? "")),
  raws: items.map((item, i) => ({ source_id: item.id, payload: { ...item, text: texts[i] ?? "" } })),
  next: rest.length ? JSON.stringify(rest) : null,
});

export const eeEtag: Source = {
  id: "ee_etag",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the list page; rows that need no detail request (archived, or without a post on etag.ee) are
  // returned at once. After that the cursor is the JSON list of current rounds still to read, one post per call.
  async fetchPage(cursor): Promise<Page> {
    await pause();
    if (cursor === "start") {
      const items = parseList(await fetchHtml(LIST_URL, UA));
      if (items.length === 0) throw new Error("ETAG returned no application rounds (layout change?)");
      const detailed = (i: Item) => i.url !== null && (i.status === "open" || i.status === "forthcoming");
      const plain = items.filter((i) => !detailed(i));
      return page(plain, [], items.filter(detailed));
    }
    const [item, ...rest] = JSON.parse(cursor) as Item[];
    if (!item) return { grants: [], raws: [], next: null };
    return page([item], [body(await fetchHtml(item.url as string, UA))], rest);
  },
};
