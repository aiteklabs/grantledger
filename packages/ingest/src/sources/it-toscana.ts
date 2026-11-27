import type { Grant } from "@grantledger/schema";
import { londonIso, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Italy, Regione Toscana: the "Bandi aperti" page of the regional site (Liferay search portlet, rendered on the
// server, paged with ?delta=20&start=N; robots.txt only disallows the search and asset_publisher paths). The page
// lists about 160 items that all carry the status "Aperto", but the flag is not maintained: the list mixes funding
// calls with job postings, appointments, accreditation notices and result lists, and it still shows calls from 2013
// to 2023. There is no type field, so the adapter keeps a card only when
// - its title does not look like a job, appointment, register or sale notice, nor like a result list,
// - its "Scadenza presentazione domande" date, when it has one, is still ahead,
// - without that date, it was published in the last three years and its page was updated ("Aggiornato al") in the
//   last 12 months: those are the rolling "a sportello" schemes, kept as open without a deadline.
// Only the cards that pass the list checks get a detail request (text, documents, article id, update date).
const SITE = "https://www.regione.toscana.it";
const LIST = `${SITE}/bandi-aperti`;
const LICENSE = "Regione Toscana public call information (regione.toscana.it)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PER_PAGE = 20;
const DAY = 86_400_000;

const NOT_FUNDING = /mobilit[àa] esterna|assegnazione temporanea|incaric[oh]|selezione pubblic|procedura comparativa|progression[ei]|concors[oi]|dirigente|president[ei] del|coordinator[ei]|assistenza pediatrica|assistenza primaria|emergenza sanitaria|medic[oi] |vendita|elenco|catalogo|accreditamento|riconoscimento|equivalenza|esercizio temporaneo|reperimento|nucleo di valutazione|sedi farmaceutiche/i;
const RESULTS = /graduatori|assegnazione (?:definitiva |dei |contribut)|esiti |premialit|vincitor|conclusione procedura|liquidazione|domande ammesse|ammess[ei] a (?:contributo|finanziamento)/i;
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

interface Card { url: string; title: string; description: string; published: string | null; closes: string | null }

const plain = (html: string | undefined) => (html ? stripHtml(html).replace(/[ ​]/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() : "");
// Rome wall-clock time as ISO in UTC: Rome is one hour ahead of London all year.
const romeIso = (year: number, month: number, day: number, hour: number, minute = 0) => londonIso(year, month, day, hour - 1, minute);
// "18.12.2026" to an ISO date.
const dotDate = (s: string | undefined) => { const m = s?.match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z` : null; };

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// The deadline attribute is "2026-12-18 16:00" or "2026.12.03" (no time: the end of that day), Italian time.
function deadline(value: string | undefined): string | null {
  const m = value?.match(/(\d{4})[-.](\d{2})[-.](\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? romeIso(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 23, m[4] ? Number(m[5]) : 59) : null;
}

function parseList(html: string): Card[] {
  const cards: Card[] = [];
  for (const a of html.match(/<article\s+class="rtds-card rtds-card--information-02[\s\S]*?<\/article>/g) ?? []) {
    const link = a.match(/<h3 class="rtds-card__title">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    cards.push({
      url: (link[1] as string).replace(/&amp;/g, "&"),
      title: plain(link[2]),
      description: plain(a.match(/<div class="rtds-card__description">([\s\S]*?)<div class="rtds-card__publication-details">/)?.[1]),
      published: dotDate(a.match(/Pubblicato il\s*([\d.]+)/)?.[1]),
      closes: deadline(a.match(/<small class="rtds-card__date">[\s\S]*?<time datetime="([^"]+)"/)?.[1]),
    });
  }
  return cards;
}

function wanted(c: Card, now: number): boolean {
  if (NOT_FUNDING.test(c.title) || RESULTS.test(c.title)) return false;
  if (c.closes) return new Date(c.closes).getTime() >= now;
  if (!c.published || now - new Date(c.published).getTime() > 3 * 365 * DAY || RESULTS.test(c.description.slice(0, 120))) return false;
  // A deadline written into the card text ("Scadenza avviso Linea 1: 20 febbraio 2025") that has passed.
  const written = [...c.description.matchAll(new RegExp(`(?:scadenza|scade|entro)[^.;]{0,40}?(\\d{1,2})°? (${MONTHS.join("|")}) (20\\d\\d)`, "gi"))].map((m) => romeIso(Number(m[3]), MONTHS.indexOf((m[2] as string).toLowerCase()), Number(m[1]), 23, 59));
  return written.length === 0 || written.some((d) => new Date(d).getTime() >= now);
}

// "euro 7.490.079,22", "€ 5.000.000", "343.423,56 euro", "19.5 milioni di euro", "500 mila euro". An amount spelled
// across words ("un milione 242 mila euro", "2 milioni 125.363,20 euro") is left out rather than read wrong.
function amount(text: string): number | null {
  const full = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?`;
  const m = text.match(new RegExp(`(?:euro|€)\\s*(${full})(?!\\s*(?:mila|milion|miliard))|(${full})\\s*(?:euro|€)|(\\d+(?:[.,]\\d{1,2})?)\\s*(mila|milion[ei]|miliard[oi])\\s*(?:di\\s*)?(?:euro|€)`, "i"));
  if (!m || /(?:milion[ei]|miliard[oi])\s*(?:e\s*)?$/i.test(text.slice(0, m.index))) return null;
  const unit = (m[4] ?? "").toLowerCase();
  const n = m[3] ? Number(m[3].replace(",", ".")) * (unit.startsWith("milia") ? 1e9 : unit.startsWith("milion") ? 1e6 : 1e3) : Number((m[1] ?? m[2] ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 1000 ? Math.round(n) : null;
}

function fundingTypes(text: string): Grant["funding_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["funding_types"][number]>();
  if (/prestit|microcredito|finanziament[oi] agevolat/.test(t)) out.add("loan");
  if (/fondo di garanzia|garanzie? /.test(t)) out.add("guarantee");
  if (/voucher/.test(t)) out.add("voucher");
  if (/\bpremi[oi]?\b/.test(t)) out.add("prize");
  if (/contribut|sovvenzion|finanziament|sostegno|incentiv|aiut|bors[ae]|bando/.test(t) || out.size === 0) out.add("grant");
  return [...out];
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/\bpmi\b|piccole e medie/.test(t)) out.add("sme");
  if (/impres|aziend|datori di lavoro|\bpmi\b|professionist|allevator|agricoltor/.test(t)) out.add("company");
  if (/cittadin|famigli|lavorator|lavoratric|student|donne|giovani|disoccupat|proprietari|persone/.test(t)) out.add("individual");
  if (/universit|ricerca|ricercator/.test(t)) out.add("research_org");
  if (/enti locali|comun[ei]\b|enti pubblici|scuol|istituzioni scolastiche|aziende usl/.test(t)) out.add("public_body");
  if (/terzo settore|associazion|\bets\b|onlus|volontariato/.test(t)) out.add("ngo");
  return [...out];
}

// Null when the page shows the call is not current: a rolling call whose page was not updated for a year.
function normalize(card: Card, html: string): Grant | null {
  const main = html.slice(Math.max(0, html.indexOf('<main id="mainContent">')));
  const id = main.match(/Article ID:\s*<strong>(\d+)/)?.[1];
  if (!id) throw new Error(`Regione Toscana call page without an article id: ${card.url}`);
  const title = plain(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]) || card.title;
  const category = plain(main.match(/rtds-page-header--bando">([\s\S]*?)<div class="rtds-page-header__content/)?.[1]).replace(/\s*\n\s*/g, " ").replace(/^Bando(?: in:)?\s*/, "");
  const description = plain(main.match(/<div class="rtds-page-header__description[^"]*">([\s\S]*?)<div class="rtds-space-y-2/)?.[1]) || card.description;
  const burt = dotDate(main.match(/pubblicazione bando su Burt:[\s\S]{0,80}?<time[^>]*>([\d.]+)/)?.[1]);
  const burtNumber = plain(main.match(/<p>(Numero e parte del Burt:[^<]*)<\/p>/)?.[1]);
  const closesText = plain(main.match(/Data di scadenza presentazione domande:[\s\S]{0,80}?<time[^>]*>([^<]*)/)?.[1]);
  const state = plain(main.match(/rtds-chip--status[^>]*>([\s\S]*?)<\/span>\s*<\/dd>/)?.[1]).replace(/^Stato:\s*/, "");
  const bodyHtml = main.match(/<div class="rtds-article-body">([\s\S]*?)<button id="sharebtn"/)?.[1] ?? "";
  const body = plain(bodyHtml.replace(/<picture[\s\S]*?<\/picture>/g, " "));
  const updated = dotDate(main.match(/Aggiornato al:\s*<time[^>]*>([\d.]+)/)?.[1]);
  const now = Date.now();
  if (!card.closes && (!updated || now - new Date(updated).getTime() > 365 * DAY)) return null;
  const documents: Grant["documents"] = [];
  for (const m of bodyHtml.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = (m[1] as string).replace(/&amp;/g, "&").trim();
    if (!/\/documents\/|bancadati\/atti\/Contenuto\.xml|\.pdf(?:$|\?)/i.test(href) || documents.length >= 40) continue;
    let url: string;
    try { url = new URL(href, SITE).href; } catch { continue; }
    if (url.startsWith("https://") && !documents.some((d) => d.url === url)) documents.push({ title: plain(m[2]).replace(/\n/g, " ") || "Documento", url });
  }
  const money = body.match(/(?:dotazione finanziaria|risorse disponibili|risorse finanziarie|stanziat[oaie]|stanziamento)[\s\S]{0,300}/i)?.[0] ?? "";
  // Free text: a small amount there is more likely a grant ceiling than the call budget, so it is dropped.
  const budget = amount(money);
  const text = `${title} ${description}`;
  const summary = [
    description,
    category && `Categoria: ${category}`,
    state && `Stato: ${state}`,
    closesText && `Scadenza presentazione domande: ${closesText}`,
    burt && `Pubblicazione sul Burt: ${burt.slice(0, 10)}${burtNumber ? ` (${burtNumber})` : ""}`,
    body,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `it_toscana:${id}`,
    source: "it_toscana",
    source_id: id,
    source_url: card.url,
    source_license: LICENSE,
    title,
    title_lang: "it",
    summary: summary || null,
    funder_name: "Regione Toscana",
    funder_level: "regional",
    country: "IT",
    regions: ["ITI1"],
    funding_types: fundingTypes(text),
    beneficiary_types: beneficiaryTypes(text),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: budget !== null && budget >= 50_000 ? budget : null,
    currency: "EUR",
    status: "open",
    opens_at: null,
    closes_at: card.closes,
    documents,
    source_updated_at: updated,
  };
}

export const itToscana: Source = {
  id: "it_toscana",
  license: LICENSE,
  start() {
    return "1";
  },
  // One list page (20 cards) and the detail pages of the cards that pass the list checks: 21 requests at most.
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const html = await get(`${LIST}?delta=${PER_PAGE}&start=${page}`);
    const cards = parseList(html);
    if (cards.length === 0 && page === 1) throw new Error("Regione Toscana returned no open calls (bot challenge or changed markup?)");
    const total = Number(html.match(/Mostrati\s+\d+\s*-\s*\d+\s+su\s+(\d+)\s+risultati/)?.[1] ?? 0);
    const now = Date.now();
    const kept = cards.filter((c) => /^https:\/\//.test(c.url) && wanted(c, now));
    const pages = await mapLimit(kept, 2, (c) => get(c.url));
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    kept.forEach((c, i) => {
      const g = normalize(c, pages[i] as string);
      if (!g || grants.some((x) => x.id === g.id)) return;
      grants.push(g);
      raws.push({ source_id: g.source_id, payload: { card: c, summary: g.summary } });
    });
    return { grants, raws, next: cards.length > 0 && page * PER_PAGE < total ? String(page + 1) : null };
  },
};
