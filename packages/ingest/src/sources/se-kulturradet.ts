import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Sweden, Kulturrådet (Swedish Arts Council): the grant overview "Sök bidrag" (about 80 schemes, among them the
// Creative Europe calls the council relays as the Swedish desk). The overview is server-rendered, 12 cards per page;
// its "Visa fler" button asks the same URL for ?t=<status>&pn=<page> and gets the next cards as an HTML fragment.
// The status filter has three values: open (includes the always-open schemes), comming (sic, announced rounds) and
// closed. Open and announced schemes get their scheme page (application period, eligibility, what is funded, how
// to apply); closed ones are taken from the cards alone.
const SITE = "https://www.kulturradet.se";
const LIST_URL = `${SITE}/sok-bidrag/`;
const LICENSE = "Kulturrådet public grant information (kulturradet.se)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "text/html,application/xhtml+xml", "accept-language": "sv-SE,sv;q=0.9,en;q=0.8" };
const STATUSES = ["open", "comming", "closed"] as const;
const PAGE_SIZE = 12;
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

interface Cursor { t: (typeof STATUSES)[number]; pn: number }

interface Card { slug: string; category: string; state: string; title: string; preamble: string; when: string; end: string | null }

interface Detail { period: string; body: string; documents: Grant["documents"] }

const clean = (html: string | undefined) => stripHtml(html ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const m of html.matchAll(/<a [^>]*data-grant-item[^>]*href="\/sok-bidrag\/([^"/]+)\/?"[^>]*>([\s\S]*?)<\/a>/g)) {
    const inner = m[2] as string;
    const part = (cls: string, tag: string) => clean(inner.match(new RegExp(`<${tag} class="${cls}"[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]);
    const title = part("grant-card__content__heading", "h3");
    if (!title) continue;
    cards.push({
      slug: m[1] as string,
      category: part("tag__title[^\"]*", "span"),
      state: part("grant-card__content__text", "span"),
      title,
      preamble: part("grant-card__content__preamble", "p"),
      when: part("grant-timebox__date", "span"),
      end: inner.match(/data-end-timestamp="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})"/)?.[1] ?? null,
    });
  }
  return cards;
}

function parseDetail(html: string): Detail {
  const start = html.indexOf("<h1");
  const ends = ['<div class="grant-page__container__content__footer">', '<div class="block-area">', "</main>"].map((k) => html.indexOf(k, start)).filter((i) => i !== -1);
  const main = html.slice(start === -1 ? 0 : start, ends.length ? Math.min(...ends) : undefined);
  // The sidebar lists the application periods of the year; past ones carry a "--passed" class, the current one not.
  const period = [...html.matchAll(/<span class="grant-details-list__section__details__text">\s*(\d{1,2} [a-zåäö]+ \d{4}\s*-\s*\d{1,2} [a-zåäö]+ \d{4})\s*<\/span>/g)].map((m) => clean(m[1])).at(-1) ?? "";
  const documents: Grant["documents"] = [];
  for (const m of main.matchAll(/<a[^>]+href="([^"]+\.(?:pdf|docx?|xlsx?|odt))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1] as string);
    const url = href.startsWith("/") ? `${SITE}${href}` : href;
    const title = clean(m[2] as string);
    if (title && url.startsWith("https://") && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  const body = stripHtml(main.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, "").replace(/<p class="preamble">[\s\S]*?<\/p>/, "")).replace(/[\u00a0\r]/g, " ").replace(/[ \t]*\n\s*/g, "\n").replace(/(\n\d+\.)\n/g, "$1 ").trim();
  return { period, body, documents };
}

// "5 januari 2027", "14 okt 2026", "1 dec 2026" as a date; the month is matched on its first three letters.
function seDate(text: string | undefined, time: string): string | null {
  const m = text?.match(/(\d{1,2}) ([a-zåäö]+) (\d{4})/);
  const month = m ? MONTHS.indexOf((m[2] as string).slice(0, 3)) + 1 : 0;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}T${time}.000Z` : null;
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out: Grant["beneficiary_types"] = [];
  if (/enskilda? (?:person|kulturskapare|konstnär|individ)|individer|privatperson|du som är (?:professionell|verksam|konstnär|författare|översättare)|frilans/.test(t)) out.push("individual");
  if (/företag|förlag|bolag|aktiebolag|enskild firma|utgivare/.test(t)) out.push("company");
  if (/förening|ideell|organisation|stiftelse|fria kulturlivet|civilsamhälle/.test(t)) out.push("ngo");
  if (/kommun|region|myndighet|bibliotek|offentlig|skolhuvud/.test(t)) out.push("public_body");
  return out;
}

function normalize(card: Card, d: Detail | null, t: Cursor["t"]): Grant {
  // "Ny utlysning väntas öppna den 5 januari 2027 och stänga den 3 mars 2027." on announced rounds; "Sista
  // ansökningsdag 1 dec 2026" with the exact local time in data-end-timestamp on open ones.
  const announced = card.when.match(/öppna den (\d{1,2} [a-zåäö]+ \d{4})(?:[^.]*?stänga den (\d{1,2} [a-zåäö]+ \d{4}))?/);
  const [from, to] = (d?.period ?? "").split(/\s+-\s+/);
  const opens = announced ? seDate(announced[1], "00:00:00") : seDate(from, "00:00:00");
  const closes = announced ? seDate(announced[2], "23:59:59") : card.end ? `${card.end}.000Z` : (seDate(card.when.match(/Sista ansökningsdag (.+)/)?.[1], "23:59:59") ?? seDate(to, "23:59:59"));
  const eu = card.category === "Kreativa Europa";
  const who = d?.body.match(/Kan du ansöka\?\s*([\s\S]{0,800})/)?.[1] ?? card.preamble;
  const summary = [
    card.preamble,
    card.category && `Område: ${card.category}`,
    card.state && `Status: ${card.state}`,
    card.when,
    d?.period && `Ansökningsperiod: ${d.period}`,
    d?.body,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `se_kulturradet:${card.slug}`,
    source: "se_kulturradet",
    source_id: card.slug,
    source_url: `${LIST_URL}${card.slug}/`,
    source_license: LICENSE,
    title: card.title,
    title_lang: "sv",
    summary: summary || null,
    // Creative Europe calls are EU money; the council only informs Swedish applicants about them.
    funder_name: eu ? "Europeiska kommissionen (Kreativa Europa)" : "Kulturrådet",
    funder_level: eu ? "supranational" : "national",
    country: "SE",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(who),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: eu ? "EUR" : "SEK",
    status: t === "open" ? "open" : t === "comming" ? "forthcoming" : "closed",
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: null,
  };
}

export const seKulturradet: Source = {
  id: "se_kulturradet",
  license: LICENSE,
  start() {
    return JSON.stringify({ t: "open", pn: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const html = await fetchHtml(`${LIST_URL}?t=${c.t}&pn=${c.pn}`, { ...UA, "x-requested-with": "XMLHttpRequest" });
    const cards = parseCards(html);
    if (c.t === "open" && c.pn === 1 && cards.length === 0) throw new Error("Kulturrådet lists no open grants (bot challenge or layout change?)");
    const total = Number(html.match(/id="Results_TotalMatching"[^>]*value="(\d+)"/)?.[1] ?? 0);
    const details = c.t === "closed" ? cards.map(() => null) : await mapLimit(cards, 2, async (card) => parseDetail(await fetchHtml(`${LIST_URL}${card.slug}/`, UA)));
    const grants = cards.map((card, i) => normalize(card, details[i] ?? null, c.t));
    const nextStatus = STATUSES[STATUSES.indexOf(c.t) + 1];
    const next: Cursor | null = cards.length > 0 && c.pn * PAGE_SIZE < total ? { t: c.t, pn: c.pn + 1 } : nextStatus ? { t: nextStatus, pn: 1 } : null;
    return {
      grants,
      raws: cards.map((card, i) => ({ source_id: card.slug, payload: { card, detail: details[i] ?? null } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
