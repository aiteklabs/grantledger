import type { Grant } from "@grantledger/schema";
import { fetchHtml, num, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Netherlands, ZonMw (health research and care innovation): subsidy calls ("subsidieoproepen").
// The Drupal overview /nl/subsidies is server-rendered, 12 cards per page, about 840 calls of which about 45 are
// open or expected. robots.txt disallows the faceted URLs (?f[0]=subsidy_status:open), so the status filter is not
// used: the list is read sorted by end date, newest first (sort_bef_combine=field_subsidy_date_end_DESC), and the
// walk stops at the first page without a deadline in the future (4 or 5 pages). Every call has a start and a
// deadline on its card (UTC timestamps); the status label itself is loaded by script, so it is derived from the dates.
// A card only has a truncated teaser, so each current call gets its page: who can apply, what for, what to request,
// when, budget, maximum per application, downloads and the modification time.
// robots.txt sets Crawl-delay 4: one request per fetchPage, with the pause before it.
// Calls marked "Op uitnodiging" (by invitation only) are left out: nobody else can apply.
const SITE = "https://www.zonmw.nl";
const LIST_URL = `${SITE}/nl/subsidies?sort_bef_combine=field_subsidy_date_end_DESC`;
const LICENSE = "ZonMw public subsidy call information (zonmw.nl)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CRAWL_DELAY_MS = 4_000;
const PAGE_SIZE = 12;

interface Card { id: string; path: string; title: string; teaser: string; programme: string; opens: string | null; closes: string | null; forWhom: string }
interface Cursor { page: number | null; queue: Card[] }

const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/[ \t]*\n\s*/g, "\n").trim();
const oneLine = (html: string) => clean(html).replace(/\s+/g, " ");

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const raw of html.split('<div class="card">').slice(1)) {
    const block = raw.slice(0, raw.indexOf('<div class="card__shape">') === -1 ? undefined : raw.indexOf('<div class="card__shape">'));
    const link = block.match(/<a href="(\/(?:nl|en)\/[^"]+)" rel="bookmark">([\s\S]*?)<\/a>/);
    if (!link) continue;
    const path = link[1] as string;
    const feature = (label: string) => block.match(new RegExp(`<strong class="title">${label}:</strong>([\\s\\S]*?)</li>`))?.[1] ?? "";
    const time = (label: string) => toIso(feature(label).match(/datetime="([^"]+)"/)?.[1]);
    cards.push({
      // The node id is the stable key; the path alias can be renamed.
      id: block.match(/entity-date-status\/(\d+)/)?.[1] ?? (path.split("/").pop() as string),
      path,
      title: oneLine(link[2] as string),
      teaser: oneLine(block.match(/<div class="card__introduction">([\s\S]*?)<div class="features">/)?.[1] ?? ""),
      programme: oneLine(feature("Programma")),
      opens: time("Start"),
      closes: time("Deadline"),
      forWhom: oneLine(feature("Voor wie")),
    });
  }
  return cards;
}

// "€ 80.000,-", "1 miljoen euro", "€ 2,5 miljoen", "€ 1.250.000".
function euros(text: string): number | null {
  const m = text.match(/(\d[\d.]*(?:,\d+)?)\s*(miljoen|mln|miljard|mld)?/i);
  if (!m) return null;
  const base = num((m[1] as string).replace(/\./g, "").replace(",", "."));
  const unit = (m[2] ?? "").toLowerCase();
  return base === null ? null : base * (unit.startsWith("milja") || unit === "mld" ? 1e9 : unit ? 1e6 : 1);
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/onderzoek|universit|umc\b|hogeschol|hogeschool|kennisinstelling|kennisinstituut|research|wetenschap|practora/.test(t)) out.add("research_org");
  if (/bedrij|ondernem|\bmkb\b|compan|start-?up/.test(t)) out.add("company");
  if (/\bmkb\b|\bsmes?\b/.test(t)) out.add("sme");
  if (/gemeente|\bggd\b|provincie|overheid|publieke/.test(t)) out.add("public_body");
  if (/patiëntenorganisatie|cliëntenorganisatie|stichting|vereniging|maatschappelijke organisatie|non-profit|burgerinitiatie/.test(t)) out.add("ngo");
  if (/zorgorganisatie|zorgaanbieder|zorginstelling|ziekenhui|zorgprofessional|praktijk/.test(t)) out.add("other");
  return [...out];
}

function normalize(c: Card, html: string | null): Grant {
  const main = html ? html.slice(html.indexOf("<article about="), html.indexOf("</main>")) : "";
  const field = (name: string) => clean(main.match(new RegExp(`<div class="[^"]*field--name-${name} [^"]*">([\\s\\S]*?)</div>`))?.[1] ?? "");
  const intro = field("field-introduction-formatted") || c.teaser;
  const blocks = [...main.matchAll(/<div class="orientate-block" id="[^"]*">\s*<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<a name="|<div class="orientate-block"|<div class="tab-pane)/g)].map((m) => ({ title: oneLine(m[1] as string), text: clean(m[2] as string) })).filter((b) => b.text);
  const who = blocks.find((b) => /wie kan|who can/i.test(b.title))?.text ?? "";
  const features: Record<string, string> = {};
  const sidebar = main.slice(main.indexOf('<div class="node__sidebar-bottom">'));
  for (const m of sidebar.slice(0, sidebar.indexOf("</ul>\n              </div>") === -1 ? 6000 : sidebar.indexOf("</ul>\n              </div>")).matchAll(/<strong class="(?:block )?title">([\s\S]*?)<\/strong>([\s\S]*?)<\/li>/g)) features[oneLine(m[1] as string).replace(/:$/, "")] = oneLine(m[2] as string);
  const documents: Grant["documents"] = [];
  const add = (href: string, title: string) => {
    const url = href.replace(/&amp;/g, "&").replace(/^\//, `${SITE}/`).replace(/ /g, "%20");
    if (/^https:\/\//.test(url) && URL.canParse(url) && documents.length < 30 && !documents.some((d) => d.url === url)) documents.push({ title: oneLine(title) || url, url });
  };
  const full = main.match(/<a href="([^"]+)"[^>]*class="[^"]*subsidy-download-all[^"]*"[^>]*>([\s\S]*?)<\/a>/);
  if (full) add(full[1] as string, full[2] as string);
  for (const m of (main.match(/<div class="field field--name-field-downloads [\s\S]*?<\/ul>/)?.[0] ?? "").matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) add(m[1] as string, m[2] as string);
  const forWhom = features["Voor wie"] || c.forWhom;
  const summary = [
    intro,
    [
      c.programme && `Programma: ${c.programme}`,
      c.opens && `Start: ${c.opens}`,
      c.closes && `Deadline: ${c.closes}`,
      ...Object.entries(features).filter(([k]) => k && !/^(Openingsdatum|Opening date)$/.test(k)).map(([k, v]) => `${k}: ${v}`),
    ].filter(Boolean).join("\n"),
    ...blocks.map((b) => `${b.title}:\n${b.text}`),
    field("field-to-prepare") && `Voorbereiden:\n${field("field-to-prepare")}`,
    field("field-checklist") && `Aanvragen:\n${field("field-checklist")}`,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  const modified = html?.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1]?.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  return {
    id: `nl_zonmw:${c.id}`,
    source: "nl_zonmw",
    source_id: c.id,
    source_url: `${SITE}${c.path}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: c.path.startsWith("/en/") ? "en" : "nl",
    summary: summary || null,
    funder_name: "ZonMw",
    funder_level: "national",
    country: "NL",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(`${who} ${forWhom}`),
    sectors: [],
    amount_min: null,
    amount_max: euros(features["Maximaal budget per aanvraag"] ?? features["Maximum budget per application"] ?? ""),
    budget_total: euros(features["Budget subsidieronde"] ?? features["Budget grant round"] ?? ""),
    currency: "EUR",
    status: statusFromDates(c.opens, c.closes),
    opens_at: c.opens && (!c.closes || c.opens <= c.closes) ? c.opens : null,
    closes_at: c.closes,
    documents,
    source_updated_at: toIso(modified),
  };
}

export const nlZonmw: Source = {
  id: "nl_zonmw",
  license: LICENSE,
  start() {
    return JSON.stringify({ page: 0, queue: [] } satisfies Cursor);
  },
  // The cursor holds the next list page (null when the walk has passed the last future deadline) and the calls of
  // the last list page whose own page is still to read. One request per call, list page or call page.
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const [card, ...rest] = c.queue;
    await pause();
    if (card) {
      const grant = normalize(card, await fetchHtml(`${SITE}${card.path}`, UA));
      return { grants: [grant], raws: [{ source_id: card.id, payload: { card, summary: grant.summary } }], next: rest.length || c.page !== null ? JSON.stringify({ page: c.page, queue: rest } satisfies Cursor) : null };
    }
    if (c.page === null) return { grants: [], raws: [], next: null };
    const cards = parseCards(await fetchHtml(`${LIST_URL}${c.page > 0 ? `&page=${c.page}` : ""}`, UA));
    if (c.page === 0 && cards.length === 0) throw new Error("ZonMw subsidy overview returned no calls (bot challenge or layout change?)");
    const now = new Date().toISOString();
    const current = cards.filter((x) => !x.closes || x.closes >= now);
    const queue = current.filter((x) => !/uitnodiging|invitation/i.test(x.forWhom));
    // Calls past their deadline on the last page read are returned from the card alone.
    const closed = cards.filter((x) => x.closes && x.closes < now && !/uitnodiging|invitation/i.test(x.forWhom));
    const nextPage = current.length > 0 && cards.length === PAGE_SIZE ? c.page + 1 : null;
    return {
      grants: closed.map((x) => normalize(x, null)),
      raws: closed.map((x) => ({ source_id: x.id, payload: { card: x } })),
      next: queue.length || nextPage !== null ? JSON.stringify({ page: nextPage, queue } satisfies Cursor) : null,
    };
  },
};
