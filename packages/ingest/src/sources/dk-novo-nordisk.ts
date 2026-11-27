import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Denmark, Novo Nordisk Fonden (Novo Nordisk Foundation): research grants, fellowships and teaching prizes.
// The grants page loads its cards from admin-ajax.php?action=content_api&type=grants&status=open (robots.txt allows
// admin-ajax.php): one HTML fragment with every call that has not closed yet, the ones that open later included
// (about 38), each with amount, opening and closing time and a link to its page. The Danish site is read: its list
// holds the Danish-only calls and prizes plus the calls published in English only (28 of them on the /en/ site,
// which misses the rest), so the language is set per card. Each call page adds purpose, eligibility, funding and the
// guidelines PDF. Calls for invited applicants are left out. Cloudflare sits in front of the site.
const SITE = "https://novonordiskfonden.dk";
const LIST_URL = `${SITE}/wp/wp-admin/admin-ajax.php?action=content_api&type=grants&status=open`;
const LICENSE = "Novo Nordisk Fonden public grant information (novonordiskfonden.dk)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "text/html,application/xhtml+xml", "accept-language": "da-DK,da;q=0.9,en;q=0.8" };
const MONTHS = ["jan", "feb", "mar", "apr", "ma", "jun", "jul", "aug", "sep", "o", "nov", "dec"];
// Call pages read per fetchPage call; the list is re-read each call.
const BATCH = 12;

interface Cursor { offset: number }

interface Card { id: string; url: string; onSite: boolean; title: string; lang: "da" | "en"; recurring: string; fields: { label: string; value: string }[] }

interface Detail { header: { label: string; value: string }[]; about: { label: string; value: string }[]; body: string; documents: Grant["documents"]; modified: string | null }

const clean = (html: string | undefined) => stripHtml(html ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function pairs(html: string, labelClass: string, valueClass: string): { label: string; value: string }[] {
  const re = new RegExp(`<div class="${labelClass}[^"]*">([\\s\\S]*?)</div>\\s*<div class="${valueClass}[^"]*">([\\s\\S]*?)</div>`, "g");
  return [...html.matchAll(re)].map((m) => ({ label: clean(m[1]), value: clean(m[2]) })).filter((p) => p.label && p.value);
}

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const block of html.split('<div class="col-4">').slice(1)) {
    const title = clean(block.match(/<h3>([\s\S]*?)<\/h3>/)?.[1]);
    const url = block.match(/<a href="(https:\/\/[^"]+)"[^>]*class="[^"]*nnf-grant-list-card__link/)?.[1];
    if (!title || !url) continue;
    const slug = url.match(/^https:\/\/novonordiskfonden\.dk\/grant\/([^/]+)\/?$/)?.[1];
    const fields: Card["fields"] = [];
    for (const m of block.matchAll(/<li>\s*<h6[^>]*>([\s\S]*?)<\/h6>([\s\S]*?)<\/li>/g)) {
      const field = { label: clean(m[1]), value: clean(m[2]) };
      // The expandable part of a card repeats the amount and shows the closing time again under "Closed".
      if (field.label && field.value && !/^(Closed|Lukket)$/.test(field.label) && !fields.some((f) => f.label === field.label)) fields.push(field);
    }
    cards.push({
      // Calls run by a partner link to the partner's site and have no page of their own: the id comes from the title.
      id: slug ?? title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80),
      url,
      onSite: Boolean(slug),
      title,
      lang: fields.some((f) => /^(Beløb|Kald åbner|Kald lukker)$/i.test(f.label)) ? "da" : "en",
      recurring: clean(block.match(/nnf-grant-list-card__type--recurring[^>]*>([\s\S]*?)<\/span>/)?.[1]),
      fields,
    });
  }
  return cards;
}

function parseDetail(html: string): Detail {
  const start = html.indexOf("<main");
  const end = html.indexOf("</main>", start);
  // Cloudflare rewrites e-mail addresses into placeholders with a random key on every response.
  const main = html.slice(start === -1 ? 0 : start, end === -1 ? undefined : end).replace(/<a[^>]*email-protection[^>]*>[\s\S]*?<\/a>/g, "").replace(/<span class="__cf_email__"[^>]*>[\s\S]*?<\/span>/g, "");
  const about = main.match(/<div class="nnf-project-sidebar__block my-medium">([\s\S]*?)<div class="nnf-project-sidebar__block nnf-contact-person">/)?.[1] ?? "";
  const bodyStart = main.indexOf('<div class="nnf-node-content__body');
  const bodyEnds = ['<div class="container body-1">', '<div class="nnf-color-block'].map((k) => main.indexOf(k, bodyStart)).filter((i) => i !== -1);
  const body = bodyStart === -1 ? "" : stripHtml(main.slice(bodyStart, bodyEnds.length ? Math.min(...bodyEnds) : undefined)).replace(/[\u00a0\r]/g, " ").replace(/[ \t]*\n\s*/g, "\n").trim();
  const documents: Grant["documents"] = [];
  for (const m of main.matchAll(/<a[^>]+href="(https:\/\/novonordiskfonden\.dk\/[^"]+\.(?:pdf|docx?|xlsx?))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decodeEntities(m[1] as string).replace("novonordiskfonden.dk//", "novonordiskfonden.dk/");
    const title = clean(m[2]);
    if (title && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  return {
    header: pairs(main, "nnf-grant-header__label", "nnf-grant-header__paragraph"),
    about: pairs(about, "nnf-project-sidebar__label", "nnf-project-sidebar__data"),
    body,
    documents,
    modified: toIso(html.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1]),
  };
}

// "6 January 2027 2:00pm (Copenhagen time)" as a UTC instant; "14 September 2026" as that calendar day (start of
// day for an opening, end of day for a deadline). Month names come in English and in Danish.
function nnfDate(value: string | undefined, fallbackTime: string): string | null {
  const m = value?.match(/(\d{1,2})\.? ([A-Za-zæøå]+) (\d{4})(?:\s+(\d{1,2})[:.](\d{2})\s*(am|pm)?)?/i);
  if (!m) return null;
  const name = (m[2] as string).toLowerCase();
  const month = MONTHS.findIndex((p) => name.startsWith(p)) + 1;
  if (!month) return null;
  const day = `${m[3]}-${String(month).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}`;
  if (!m[4]) return `${day}T${fallbackTime}.000Z`;
  const hour = (Number(m[4]) % 12) + (m[6]?.toLowerCase() === "pm" ? 12 : m[6] ? 0 : Number(m[4]) >= 12 ? 12 : 0);
  const local = new Date(`${day}T${String(hour).padStart(2, "0")}:${m[5]}:00Z`);
  // Denmark is UTC+1 in winter and UTC+2 in summer (last Sunday of March to last Sunday of October).
  const lastSunday = (mo: number) => { const last = new Date(Date.UTC(Number(m[3]), mo + 1, 0)); return last.getUTCDate() - last.getUTCDay(); };
  const d = Number(m[1]);
  const summer = (month > 3 && month < 10) || (month === 3 && d >= lastSunday(2)) || (month === 10 && d < lastSunday(9));
  return new Date(local.getTime() - (summer ? 2 : 1) * 3600_000).toISOString();
}

// "Up to DKK 7.6 million per grant", "DKK 1.5 mio.", "Op til DKK 4,59 millioner pr. bevilling", "DKK 200.000",
// "Up to DKK 12,500,000 per grant": the first amount in Danish kroner.
function kroner(value: string | undefined): number | null {
  const m = value?.match(/DKK\s*([\d.,]*\d)\s*(mio|million|mill)?/i);
  if (!m) return null;
  const n = m[2] ? Number((m[1] as string).replace(",", ".")) * 1_000_000 : Number((m[1] as string).replace(/[.,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function normalize(card: Card, d: Detail | null): Grant {
  const field = (re: RegExp) => card.fields.find((f) => re.test(f.label))?.value;
  const opens = nnfDate(field(/^(Call opens|Kald åbner)/i), "00:00:00");
  const closes = nnfDate(field(/^(Call closes|Kald lukker)/i), "23:59:59");
  const amount = field(/^(Amount|Beløb)/i);
  const prize = /\bpris\b|\bprize\b|pris$|prisen\b/i.test(card.title);
  const research = Boolean(field(/^Career stage/i)) || /research|forsk|investigator|postdoc|ph\.?d|fellowship|stipendi/i.test(`${card.title} ${d?.body.slice(0, 2000) ?? ""}`);
  const lines = (list: { label: string; value: string }[]) => list.map((p) => `${p.label}: ${p.value}`);
  const seen = new Set<string>();
  const summary = [
    ...[...lines(card.fields), ...lines(d?.header ?? []), ...lines(d?.about ?? [])].filter((l) => !seen.has(l) && Boolean(seen.add(l))),
    card.recurring,
    d?.body,
    card.onSite ? "" : `${card.lang === "da" ? "Ansøgning" : "Apply"}: ${card.url}`,
  ].filter(Boolean).join("\n").slice(0, 20000);
  return {
    id: `dk_novo_nordisk:${card.id}`,
    source: "dk_novo_nordisk",
    source_id: card.id,
    source_url: card.url,
    source_license: LICENSE,
    title: card.title,
    title_lang: card.lang,
    summary: summary || null,
    funder_name: "Novo Nordisk Fonden",
    funder_level: "national",
    country: "DK",
    regions: [],
    funding_types: [prize ? "prize" : "grant"],
    beneficiary_types: prize ? ["individual"] : research ? ["research_org"] : [],
    sectors: [],
    amount_min: null,
    amount_max: kroner(amount),
    budget_total: null,
    currency: "DKK",
    status: statusFromDates(opens, closes) === "unknown" ? "open" : statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: d?.modified ?? null,
  };
}

export const dkNovoNordisk: Source = {
  id: "dk_novo_nordisk",
  license: LICENSE,
  start() {
    return JSON.stringify({ offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const { offset } = JSON.parse(cursor) as Cursor;
    const cards = parseCards(await fetchHtml(LIST_URL, UA)).filter((c) => !/invited applicants|inviterede ansøgere/i.test(c.title));
    if (cards.length === 0) throw new Error("Novo Nordisk Fonden returned no open grants (bot challenge or layout change?)");
    const batch = cards.slice(offset, offset + BATCH);
    const details = await mapLimit(batch, 2, async (card) => (card.onSite ? parseDetail(await fetchHtml(card.url, UA)) : null));
    const grants = batch.map((card, i) => normalize(card, details[i] ?? null));
    const next = offset + BATCH;
    return {
      grants,
      raws: batch.map((card, i) => ({ source_id: card.id, payload: { card, detail: details[i] ?? null } })),
      next: next < cards.length ? JSON.stringify({ offset: next } satisfies Cursor) : null,
    };
  },
};
