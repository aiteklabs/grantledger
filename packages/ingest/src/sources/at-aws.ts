import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Austria, aws (Austria Wirtschaftsservice): SME and start-up funding programmes. /foerderungen/ redirects to the home
// page and the site has no list, feed or API; the sitemap index (/sitemap.xml, robots.txt allows the cHash sitemap
// URLs) lists every page with its lastmod. Programme pages and their "Spezielle Konditionen" call pages carry a
// server-rendered "awssummary" box (Zielgruppe, Volumen, Einreichtermin...) which marks the pages worth keeping.
const SITE = "https://www.aws.at";
const SITEMAP_INDEX = `${SITE}/sitemap.xml`;
const LICENSE = "aws public programme information (aws.at, copyright aws)";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml,application/xml", "accept-language": "de-AT,de;q=0.9,en;q=0.8" };
// Sections that never hold a programme page: service (news, downloads, web services), guidelines, jobs, events, English mirror.
const SKIP_SECTION = new Set(["service", "richtlinien", "karriere", "events", "en"]);
// Download lists, jury pages, archives, FAQs and contact forms hang under programme pages; they carry no summary box.
const SKIP_SEGMENT = /download|jury|archiv|faq|detail|ethikrat|bewertungsgremium|kontakt|hintergrund|community-updates|gefoerderte-projekte/;
// Pages fetched per fetchPage call; the sitemap is re-read each call.
const BATCH = 30;

interface Cursor { offset: number }

interface ListItem { slug: string; url: string; lastmod: string | null }

interface Detail { title: string; intro: string; blocks: { header: string; items: { key: string; value: string }[] }[]; sections: { title: string; text: string }[] }

const MONTHS: Record<string, string> = { jänner: "01", januar: "01", februar: "02", märz: "03", april: "04", mai: "05", juni: "06", juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12" };

function text(html: string): string {
  return stripHtml(html).replace(/ /g, " ").replace(/\n[ \t]+/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function parseSitemapIndex(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&").trim()).filter((u) => /[?&]sitemap=pages\b/.test(u));
}

function parseSitemap(xml: string): ListItem[] {
  const out: ListItem[] = [];
  for (const entry of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    if (!loc?.startsWith(`${SITE}/`)) continue;
    const segments = loc.slice(SITE.length + 1).split("/").filter(Boolean);
    if (segments.length === 0 || SKIP_SECTION.has(segments[0]!) || segments.some((s) => SKIP_SEGMENT.test(s))) continue;
    out.push({ slug: segments.join("/"), url: loc, lastmod: toIso(entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]) });
  }
  return out;
}

// Null when the page has no summary box (hub pages, legal pages, EU network pages).
function parseDetail(html: string): Detail | null {
  const blocks = [];
  // Each summary box runs from its frame marker to the next content element.
  for (const frame of html.split('class="frame frame-default frame-type-awssummary').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('<div class="content ') > 0 ? chunk.indexOf('<div class="content ') : undefined))) {
    const header = text(frame.match(/<div class="awssummary__header">([\s\S]*?)<\/div><div class="awssummary__items">/)?.[1] ?? "");
    const items = [...frame.matchAll(/<h3 class="awssummary__item-header">([\s\S]*?)<\/h3><div class="awssummary__item-body">([\s\S]*?)<\/div><\/div><\/div>/g)].map((m) => ({ key: text(m[1]!), value: text(m[2]!) }));
    if (items.length > 0) blocks.push({ header, items });
  }
  if (blocks.length === 0) return null;
  const start = html.indexOf('<div id="content"');
  const main = start >= 0 ? html.slice(start, html.indexOf("<footer", start)) : html;
  // Accordion cards: "Wen fördern wir - unter welchen Voraussetzungen?", "Was fördern wir - wie und in welcher Höhe?"...
  const sections = [...main.matchAll(/<button class="accordion__button[^>]*>([\s\S]*?)<span class="accordion__icon">[\s\S]*?<div class="accordion__text">([\s\S]*?)<\/div><\/div><div class="accordion__footer">/g)].map((m) => ({ title: text(m[1]!), text: text(m[2]!) }));
  return {
    // A few pages have no h1; the <title> is "<name> - Austria Wirtschaftsservice".
    title: text(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/\s*-\s*Austria Wirtschaftsservice\s*$/, "") ?? ""),
    intro: text(main.match(/<div class="ce-bodytext[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ""),
    blocks,
    sections,
  };
}

// "26. Oktober 2026", "01.05.2026". Each date is classified by the words just before it: "bis"/"Ende" closes,
// "ab"/"Start" opens; an unmarked date opens when it precedes the closing one ("03. Februar 2025 bis 31. März 2025").
function deadlines(t: string): { opens: string | null; closes: string | null } {
  const found: { iso: string; kind: "open" | "close" | "none" }[] = [];
  for (const m of t.matchAll(/(\d{1,2})\.\s*(?:([A-Za-zäÄ]+)\s*(\d{4})|(\d{2})\.(\d{4}))/g)) {
    const month = m[2] ? MONTHS[m[2].toLowerCase()] : m[4];
    const year = m[3] ?? m[5];
    if (!month || !year) continue;
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    // "..., 24:00 Uhr, endet." puts the verb after the date.
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 30);
    const kind = /\b(bis|ende|endet|endete|spätestens)\b/i.test(before) || /^[^.]*\b(endet|endete)\b/i.test(after) ? "close" : /\b(ab|start|seit|beginn)\b/i.test(before) ? "open" : "none";
    found.push({ iso: `${year}-${month}-${m[1]!.padStart(2, "0")}`, kind });
  }
  const close = found.find((d) => d.kind === "close")?.iso ?? null;
  const open = found.find((d) => d.kind === "open")?.iso ?? found.find((d) => d.kind === "none" && (!close || d.iso < close))?.iso ?? null;
  return { opens: open ? `${open}T00:00:00.000Z` : null, closes: close ? `${close}T23:59:59.000Z` : null };
}

// "bis zu 150.000 Euro", "EUR 889.000.-", "0,5 Millionen Euro", "bis EUR 5 Mio."
function amounts(t: string): number[] {
  const out: number[] = [];
  for (const m of t.matchAll(/(?:EUR|Euro)\s*(\d[\d.]*(?:,\d+)?)\s*(Mio\.?|Million(?:en)?)?|(\d[\d.]*(?:,\d+)?)\s*(Mio\.?|Million(?:en)?)?\s*(?:Euro|EUR)\b/g)) {
    const raw = (m[1] ?? m[3])!.replace(/\.$/, "").replace(/\./g, "").replace(",", ".");
    const n = Number(raw) * (m[2] || m[4] ? 1_000_000 : 1);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

function normalize(item: ListItem, d: Detail): Grant {
  const items = d.blocks.flatMap((b) => b.items);
  const value = (re: RegExp) => items.filter((i) => re.test(i.key)).map((i) => i.value).join("\n");
  const deadline = value(/^Einreichtermin/);
  const { opens, closes } = deadlines(deadline);
  const now = new Date().toISOString();
  const status: Grant["status"] = closes && closes < now ? "closed"
    : /jederzeit|laufend/i.test(deadline) ? "open"
    : /kein(?:e|en)? (?:Call|Einreichung|Antragstellung)|abgelaufen|endete|geschlossen|nicht (?:mehr )?möglich|geplant/i.test(deadline) ? "closed"
    : statusFromDates(opens, closes);
  const target = value(/^Zielgruppe/);
  // "Deep Tech-Vorhaben" names no legal form; the intro then says who applies.
  const who = `${target || `${d.title} ${d.intro}`} ${value(/^Branche/)}`.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (/kmu|klein|mittl/.test(who)) bens.add("sme");
  if (/start-?up|gründ|spin-off|junge/.test(who)) bens.add("startup");
  if (/unternehmen|\bgu\b|epu|betrieb|investor|fonds|inkubator|produktion/.test(who)) bens.add("company");
  if (/forschungseinrichtung|universit|hochschul|f&e|wissenschaft|spin-off/.test(who)) bens.add("research_org");
  if (/öffentlich|gemeinde|auftraggeber|schule/.test(who)) bens.add("public_body");
  if (/verein|gemeinnützig|genossenschaft/.test(who)) bens.add("ngo");
  if (/natürliche person|privatperson|schüler|student|lehrling|einzelunternehmen|ideenträger/.test(who)) bens.add("individual");
  const kind = `${d.title} ${value(/^Förderungs(?:verfahren|art)/)} ${d.sections.find((s) => /^Was fördern wir/.test(s.title))?.text.match(/Art der Förderung\n([^\n]+)/)?.[1] ?? ""}`;
  const types = new Set<Grant["funding_types"][number]>();
  if (/Zuschuss|Prämie|Bonus/i.test(kind)) types.add("grant");
  if (/Kredit|Darlehen/i.test(kind)) types.add("loan");
  if (/Garantie|Haftung/i.test(kind)) types.add("guarantee");
  if (/Eigenkapital|Beteiligung|Investment/i.test(kind)) types.add("equity");
  if (/Wettbewerb|Preis\b/i.test(kind)) types.add("prize");
  if (/Coaching|Beratung|Label/i.test(kind)) types.add("other");
  const volume = value(/^Volumen/);
  const sums = amounts(volume);
  const max = sums.length > 0 ? Math.max(...sums) : null;
  // A range ("zwischen 0,5 und 1,5 Millionen Euro", "10.000 Euro bis 37,5 Millionen Euro") gives a minimum; two
  // ceilings ("bis zu 30 Millionen pro Projekt, maximal 50 Millionen pro Unternehmen") do not.
  const min = sums.length > 1 && /zwischen|\bvon\b|(?:Euro|EUR)\s+bis\b/i.test(volume) ? Math.min(...sums) : null;
  const summary = [
    d.intro,
    ...d.blocks.map((b) => [d.blocks.length > 1 ? b.header : "", ...b.items.map((i) => `${i.key}: ${i.value}`)].filter(Boolean).join("\n")),
    ...d.sections.filter((s) => /^(?:Wen|Was) fördern wir/.test(s.title)).map((s) => `${s.title}\n${s.text.slice(0, 1500)}`),
  ].filter(Boolean).join("\n\n").slice(0, 6000) || null;
  return {
    id: `at_aws:${item.slug}`,
    source: "at_aws",
    source_id: item.slug,
    source_url: item.url,
    source_license: LICENSE,
    title: d.title || item.slug,
    title_lang: "de",
    summary,
    funder_name: "aws",
    funder_level: "national",
    country: "AT",
    regions: [],
    funding_types: types.size > 0 ? [...types] : ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: min !== null && max !== null && min < max ? min : null,
    amount_max: max,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: item.lastmod,
  };
}

export const atAws: Source = {
  id: "at_aws",
  license: LICENSE,
  start() {
    return JSON.stringify({ offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const sitemaps = parseSitemapIndex(await fetchHtml(SITEMAP_INDEX, UA));
    if (sitemaps.length === 0) throw new Error("aws sitemap index lists no page sitemaps (layout change?)");
    const items = (await mapLimit(sitemaps, 2, async (u) => parseSitemap(await fetchHtml(u, UA)))).flat();
    const batch = items.slice(c.offset, c.offset + BATCH);
    // Two archive pages redirect in a loop; one broken page must not stop the crawl.
    const details = await mapLimit(batch, 4, async (item) => {
      try {
        return parseDetail(await fetchHtml(item.url, UA));
      } catch {
        return null;
      }
    });
    const found = batch.flatMap((item, i) => (details[i] ? [{ item, detail: details[i] as Detail }] : []));
    const next: Cursor | null = c.offset + BATCH < items.length ? { offset: c.offset + BATCH } : null;
    return {
      grants: found.map((f) => normalize(f.item, f.detail)),
      raws: found.map((f) => ({ source_id: f.item.slug, payload: { ...f.item, title: f.detail.title, blocks: f.detail.blocks } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
