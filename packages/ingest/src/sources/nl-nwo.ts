import type { Grant } from "@grantledger/schema";
import { fetchHtml, londonIso, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Netherlands, Dutch Research Council (NWO): calls for proposals, in English (/en/calls).
// The Drupal overview is server-rendered, 12 cards per page, about 260 calls of which about 50 are current. A card
// carries the status and the call budget; deadlines, eligibility and downloads are on the call page.
// The status facet (?f[0]=calls_bw_call_status:<term id>) narrows the list. The term ids are read from the facet
// block of the unfiltered first page on every crawl, keeping every status except "Closed" and "In progress"
// (submission over, assessment running), so a status NWO adds later is picked up without a code change.
// robots.txt sets Crawl-delay 3 (the site allows 20 requests per 60 seconds) and does not disallow the facet URLs:
// one request per fetchPage, with the pause before it. Deadlines are Dutch wall-clock times.
// Cards that link to another site (Open Science NL calls on openscience.nl) are returned from the card alone.
const SITE = "https://www.nwo.nl";
const LIST_URL = `${SITE}/en/calls`;
const LICENSE = "NWO public call information (nwo.nl)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CRAWL_DELAY_MS = 3_000;

interface Card { id: string; url: string; title: string; teaser: string; status: string; budget: string }
interface Cursor { filter: string | null; page: number | null; queue: Card[] }

const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
// Table cells of one row are joined with a separator.
const clean = (html: string) => stripHtml(html.replace(/<\/t[dh]>(?=\s*<t[dh])/gi, " | ")).replace(/ /g, " ").replace(/[ \t]*\n\s*/g, "\n").trim();
const oneLine = (html: string) => clean(html).replace(/\s+/g, " ");

// Query string for every status of the facet block except closed and in progress.
function statusFilter(html: string): string {
  const ids: string[] = [];
  for (const m of html.matchAll(/data-filter-url="[^"]*calls_bw_call_status%3A(\d+)"[\s\S]*?<label[^>]*>([\s\S]*?)<\/label>/g)) {
    if (!/^(closed|in progress)\b/i.test(oneLine(m[2] as string)) && !ids.includes(m[1] as string)) ids.push(m[1] as string);
  }
  return ids.map((id, i) => `f%5B${i}%5D=calls_bw_call_status%3A${id}`).join("&");
}

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const block of html.split('<li class="list-item reveal reveal-slideup">').slice(1)) {
    const link = block.match(/<h3 class="card__title"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const href = (link[1] as string).replace(/&amp;/g, "&");
    const external = /^https?:\/\//.test(href);
    const label = (name: string) => oneLine(block.match(new RegExp(`<span>${name}</span>([\\s\\S]*?)</li>`))?.[1] ?? "");
    cards.push({
      // The path below /en/calls/ (it can hold a slash: "...-2026/2027"); for a call on another site, host and path.
      id: (external ? href.replace(/^https?:\/\/(www\.)?/, "") : href.replace(/^\/en\/calls\//, "")).replace(/\/+$/, "").replace(/[^A-Za-z0-9._-]+/g, "-"),
      url: external ? href.replace(/^http:/, "https:") : `${SITE}${href}`,
      title: oneLine(link[2] as string),
      teaser: oneLine(block.match(/<\/h3>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? ""),
      status: label("Status"),
      budget: label("Budget"),
    });
  }
  return cards;
}

// The <div> element that starts at `from`, up to its matching closing tag (nested divs are counted).
function divBlock(html: string, from: number): string {
  if (from === -1) return "";
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = from;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}

function status(text: string): Grant["status"] {
  const t = text.toLowerCase();
  if (/closed|in progress/.test(t)) return "closed";
  if (/in preparation|upcoming/.test(t)) return "forthcoming";
  if (/open|continuous/.test(t)) return "open";
  return "unknown";
}

// "€13,000,000".
const euros = (text: string) => num(text.match(/€\s?([\d,.]*\d)/)?.[1]?.replace(/,/g, "") ?? "");

// The Netherlands is always one hour ahead of the UK and changes its clocks at the same instant.
const amsterdamIso = (year: number, month: number, day: number, hour: number, minute: number) => londonIso(year, month, day, hour - 1, minute);

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/research|universit|phd|professor|knowledge institution|scientist|academic/.test(t)) out.add("research_org");
  if (/start-?ups?\b|entrepreneur/.test(t)) out.add("startup");
  if (/compan|\bsmes?\b|business|industry|private part/.test(t)) out.add("company");
  if (/public (partner|organisation|part)|municipalit|government|ministr/.test(t)) out.add("public_body");
  if (/societal (partner|organisation)|civil society|\bngos?\b|non-profit/.test(t)) out.add("ngo");
  return [...out];
}

function normalize(c: Card, html: string | null): Grant {
  const main = html ? html.slice(html.indexOf("<main"), html.indexOf("</main>")) : "";
  const intro = clean(main.match(/<div class="articleHead__intro">([\s\S]*?)<\/div>/)?.[1] ?? "") || c.teaser;
  const sections = main.split('<div class="accordion-item ').slice(1).map((s) => ({
    title: oneLine(s.match(/<span class="accordion-title">([\s\S]*?)<\/span>/)?.[1] ?? ""),
    text: clean(divBlock(s, s.indexOf('<div class="accordion-body">'))),
  })).filter((s) => s.title && s.text);
  // Sidebar "Characteristics": label and value blocks. A date value is a date at noon UTC followed by the local
  // time as text ("<time datetime="2026-12-01T12:00:00Z">1 December 2026</time> 14:00 hrs.").
  const sidebar = divBlock(main, main.indexOf('<div class="sidebar--content">'));
  const features: [string, string][] = [];
  const closings: string[] = [];
  const openings: string[] = [];
  for (const m of sidebar.matchAll(/<h6 class="strong">([\s\S]*?)<\/h6>([\s\S]*?)<\/div>/g)) {
    const label = oneLine(m[1] as string);
    const value = oneLine((m[2] as string).replace(/<\/a>\s*<a /g, "</a>, <a "));
    if (!label || !value) continue;
    features.push([label, value]);
    const date = (m[2] as string).match(/datetime="(\d{4})-(\d{2})-(\d{2})/);
    if (!date) continue;
    const time = value.match(/(\d{1,2})[:.](\d{2})\s*(?:hrs|hours|uur|CES?T)/i);
    const closing = /clos|deadline/i.test(label);
    const iso = amsterdamIso(Number(date[1]), Number(date[2]) - 1, Number(date[3]), time ? Number(time[1]) : closing ? 23 : 0, time ? Number(time[2]) : closing ? 59 : 0);
    if (closing) closings.push(iso);
    else if (/open|start/i.test(label)) openings.push(iso);
  }
  const closes = closings.sort().at(-1) ?? null;
  const opens = openings.sort()[0] ?? null;
  const feature = (name: string) => features.find(([k]) => k === name)?.[1] ?? "";
  const state = status(feature("Status") || c.status);
  const documents: Grant["documents"] = [];
  for (const m of main.matchAll(/<a href="([^"]+)"[^>]*download[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = (m[1] as string).replace(/&amp;/g, "&").replace(/^\//, `${SITE}/`).replace(/ /g, "%20");
    const title = oneLine((m[2] as string).match(/<h5>([\s\S]*?)<\/h5>/)?.[1] ?? "") || url.split("/").pop() || url;
    if (/^https:\/\//.test(url) && URL.canParse(url) && documents.length < 30 && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  const who = sections.find((s) => /who can apply/i.test(s.title))?.text ?? "";
  const summary = [
    intro,
    (features.length ? features : ([["Status", c.status], ["Budget", c.budget]] as [string, string][]).filter(([, v]) => v)).map(([k, v]) => `${k}: ${v}`).join("\n"),
    ...sections.map((s) => `${s.title}:\n${s.text}`),
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `nl_nwo:${c.id}`,
    source: "nl_nwo",
    source_id: c.id,
    source_url: c.url,
    source_license: LICENSE,
    title: c.title,
    title_lang: "en",
    summary: summary || null,
    funder_name: "Dutch Research Council (NWO)",
    funder_level: "national",
    country: "NL",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(`${who} ${feature("For specific groups")} ${intro}`),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: euros(feature("Budget") || c.budget),
    currency: "EUR",
    status: closes && closes < new Date().toISOString() ? "closed" : state,
    opens_at: opens && (!closes || opens <= closes) ? opens : null,
    closes_at: closes,
    documents,
    source_updated_at: null,
  };
}

export const nlNwo: Source = {
  id: "nl_nwo",
  license: LICENSE,
  start() {
    return JSON.stringify({ filter: null, page: 0, queue: [] } satisfies Cursor);
  },
  // The cursor holds the status filter (null until the first call has read it), the next list page (null after the
  // last one) and the calls of the last list page whose own page is still to read. One request per call.
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const [card, ...rest] = c.queue;
    await pause();
    if (c.filter === null) {
      const filter = statusFilter(await fetchHtml(LIST_URL, UA));
      if (!filter) throw new Error("NWO calls overview has no status facet (bot challenge or layout change?)");
      return { grants: [], raws: [], next: JSON.stringify({ filter, page: 0, queue: [] } satisfies Cursor) };
    }
    if (card) {
      const grant = normalize(card, await fetchHtml(card.url, UA));
      return { grants: [grant], raws: [{ source_id: card.id, payload: { card, summary: grant.summary } }], next: rest.length || c.page !== null ? JSON.stringify({ filter: c.filter, page: c.page, queue: rest } satisfies Cursor) : null };
    }
    if (c.page === null) return { grants: [], raws: [], next: null };
    const html = await fetchHtml(`${LIST_URL}?${c.filter}${c.page > 0 ? `&page=${c.page}` : ""}`, UA);
    const cards = parseCards(html);
    if (c.page === 0 && cards.length === 0) throw new Error("NWO calls overview returned no calls (bot challenge or layout change?)");
    // Current calls on nwo.nl get their page; calls hosted elsewhere and closed ones are returned from the card.
    const queue = cards.filter((x) => x.url.startsWith(`${SITE}/`) && ["open", "forthcoming"].includes(status(x.status)));
    const direct = cards.filter((x) => !queue.includes(x));
    const nextPage = cards.length > 0 && new RegExp(`[?&;]page=${c.page + 1}"`).test(html) ? c.page + 1 : null;
    return {
      grants: direct.map((x) => normalize(x, null)),
      raws: direct.map((x) => ({ source_id: x.id, payload: { card: x } })),
      next: queue.length || nextPage !== null ? JSON.stringify({ filter: c.filter, page: nextPage, queue } satisfies Cursor) : null,
    };
  },
};
