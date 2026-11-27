import type { Grant } from "@grantledger/schema";
import { mapLimit, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Italy, Regione Piemonte: the "Contributi e finanziamenti" section of the regional calls portal (Drupal, rendered on
// the server). The list is filtered by status (field_stato_target_id: 19 "Aperto", 87 "Pre-informazione"), 9 cards a
// page; the cards carry only the title, so every open or announced call gets its detail page, which holds the dates
// (real UTC in the <time> tags), the target groups, the budget text and the call documents. Expired calls, results,
// cancelled and suspended calls (ids 20 to 23) are not read. Tenders, appointments and job competitions live in other
// sections of the portal. The RSS feed only carries the 10 newest items, so it is not used.
const SITE = "https://bandi.regione.piemonte.it";
const LIST = `${SITE}/contributi-finanziamenti`;
const LICENSE = "Regione Piemonte public call information (bandi.regione.piemonte.it)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const STATES = [19, 87] as const;

interface Cursor { state: number; page: number }

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

const plain = (html: string | undefined) => (html ? stripHtml(html).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() : "");

// The <dd> values of a labelled field ("Temi", "Rivolto a", "Risorse").
function items(html: string, name: string): string[] {
  const block = html.match(new RegExp(`<dl class="[^"]*field--name-${name}\\b[\\s\\S]*?</dl>`))?.[0] ?? "";
  return [...block.matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => plain(m[1])).filter(Boolean);
}

function date(html: string, name: string): string | null {
  return toIso(html.match(new RegExp(`field--name-${name}\\b[\\s\\S]*?<time datetime="([^"]+)"`))?.[1]);
}

// "Euro 586.000,00", "€ 1.200.000", "2,5 milioni di euro": the largest amount of the budget section.
function budget(text: string): number | null {
  const found: number[] = [];
  const value = (n: string) => Number(n.replace(/\./g, "").replace(",", "."));
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(milioni|miliardi)(?: di)? (?:euro|€)/gi)) found.push(Number((m[1] as string).replace(",", ".")) * (/^milia/i.test(m[2] as string) ? 1e9 : 1e6));
  for (const m of text.matchAll(/(?:euro|€)\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(?!\s*(?:milioni|miliardi))/gi)) found.push(value(m[1] as string));
  for (const m of text.matchAll(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?)\s*(?:\([^)]{0,40}\)\s*)?(?:euro|€)/gi)) found.push(value(m[1] as string));
  const max = Math.max(0, ...found.filter((n) => Number.isFinite(n)));
  return max >= 1000 ? Math.round(max) : null;
}

function fundingTypes(text: string): Grant["funding_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["funding_types"][number]>();
  if (/prestit|finanziament[oi] agevolat|fondo rotativo|mutu[oi]|microcredito/.test(t)) out.add("loan");
  if (/garanzi/.test(t)) out.add("guarantee");
  if (/voucher|buon[oi] /.test(t)) out.add("voucher");
  if (/\bpremi[oi]?\b/.test(t)) out.add("prize");
  if (/contribut|fondo perduto|sovvenzion|sostegno|finanziament/.test(t) || out.size === 0) out.add("grant");
  return [...out];
}

const TARGETS: Record<string, Grant["beneficiary_types"][number]> = {
  "cittadini": "individual",
  "enti pubblici": "public_body",
  "imprese e liberi professionisti": "company",
  "terzo settore": "ngo",
};

function normalize(slug: string, html: string): Grant {
  const article = html.match(/<article about="\/contributi-finanziamenti\/[\s\S]*?<\/article>/)?.[0] ?? "";
  if (!article) throw new Error(`Regione Piemonte call page without an article block: ${slug}`);
  const title = plain(article.match(/field--name-field-display-title[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  const state = items(article, "field-stato")[0] ?? "";
  const procedure = plain(article.match(/field--name-field-procedura\b[\s\S]*?<div class="field__item">([\s\S]*?)<\/div>/)?.[1]);
  const subject = items(article, "field-oggetto-bando")[0] ?? "";
  const topics = items(article, "field-temi");
  const targets = items(article, "field-target");
  const resources = items(article, "field-risorse");
  const opens = date(article, "field-data-inizio");
  const closes = date(article, "field-data-scadenza");
  const body = plain(article.match(/field--name-body\b[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1]);
  // The collapsible sections: who can apply, budget, how to apply, office. Sections that only list files become
  // documents; the contact section (names, phone numbers) is left out.
  const sections = [...article.matchAll(/<details[^>]*><summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({ label: plain(m[1]), html: m[2] as string }));
  const texts = sections.filter((s) => !/class="file /.test(s.html) && !/^Contatti$/i.test(s.label)).map((s) => ({ label: s.label, text: plain(s.html) })).filter((s) => s.text);
  const money = texts.find((s) => /^Dotazione/i.test(s.label))?.text ?? "";
  const documents: Grant["documents"] = [];
  for (const m of article.matchAll(/<span class="file [^"]*"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = new URL((m[1] as string).replace(/&amp;/g, "&"), SITE).href;
    if (url.startsWith("https://") && !documents.some((d) => d.url === url)) documents.push({ title: plain(m[2]) || "Documento", url });
  }
  const summary = [
    subject && `Oggetto del bando: ${subject}`,
    body && body !== subject && body,
    procedure && `Procedura: ${procedure}`,
    state && `Stato: ${state}`,
    topics.length > 0 && `Temi: ${topics.join(", ")}`,
    targets.length > 0 && `Rivolto a: ${targets.join(", ")}`,
    resources.length > 0 && `Risorse: ${resources.join(", ")}`,
    opens && `Domande dal: ${opens.slice(0, 16).replace("T", " ")} UTC`,
    closes && `Scadenza: ${closes.slice(0, 16).replace("T", " ")} UTC`,
    ...texts.map((s) => `${s.label}: ${s.text}`),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  const announced = /pre-?informazione/i.test(state);
  const dated = statusFromDates(opens, closes);
  return {
    id: `it_piemonte:${slug}`,
    source: "it_piemonte",
    source_id: slug,
    source_url: `${LIST}/${slug}`,
    source_license: LICENSE,
    title: title || subject || slug,
    title_lang: "it",
    summary: summary || null,
    funder_name: "Regione Piemonte",
    funder_level: "regional",
    country: "IT",
    regions: ["ITC1"],
    funding_types: fundingTypes(`${title} ${subject} ${procedure}`),
    beneficiary_types: [...new Set(targets.map((t) => TARGETS[t.toLowerCase()]).filter((t) => t !== undefined))],
    sectors: topics,
    amount_min: null,
    amount_max: null,
    budget_total: budget(money),
    currency: "EUR",
    status: announced ? (dated === "closed" ? "closed" : "forthcoming") : dated === "unknown" ? "open" : dated,
    opens_at: opens,
    closes_at: closes,
    documents,
    source_updated_at: null,
  };
}

export const itPiemonte: Source = {
  id: "it_piemonte",
  license: LICENSE,
  start() {
    return JSON.stringify({ state: STATES[0], page: 0 } satisfies Cursor);
  },
  // One list page (9 cards) and its detail pages per call: 10 requests.
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const html = await get(`${LIST}?field_stato_target_id=${c.state}&page=${c.page}`);
    const slugs = [...new Set([...html.matchAll(/<article about="\/contributi-finanziamenti\/([^"/?#]+)"/g)].map((m) => m[1] as string))];
    // The list of announced calls is often empty; the list of open calls never is.
    if (slugs.length === 0 && c.state === STATES[0] && c.page === 0) throw new Error("Regione Piemonte returned no open calls (bot challenge or changed markup?)");
    const pages = await mapLimit(slugs, 2, (slug) => get(`${LIST}/${slug}`));
    const grants = slugs.map((slug, i) => normalize(slug, pages[i] as string));
    const nextState = STATES[STATES.indexOf(c.state as (typeof STATES)[number]) + 1];
    const next: Cursor | null = slugs.length > 0 && /rel="next"/.test(html) ? { state: c.state, page: c.page + 1 } : nextState ? { state: nextState, page: 0 } : null;
    return {
      grants,
      raws: grants.map((g, i) => ({ source_id: g.source_id, payload: { url: g.source_url, article: (pages[i] as string).match(/<article about="\/contributi-finanziamenti\/[\s\S]*?<\/article>/)?.[0] ?? "" } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
