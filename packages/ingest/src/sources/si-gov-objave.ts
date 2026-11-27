import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Slovenia, GOV.SI "Javne objave": the public notices of all ministries and government bodies. The collection is a
// server-rendered table (code, title, institution, publication date, due date, status) filtered by notice type and
// status; two types are read, 2 "Javni razpisi" (public calls) and 6 "Javni pozivi" (public invitations, where the
// vouchers and the Eco Fund style incentives sit), with status=ongoing and 100 rows per request (paging ?start=N).
// Both types mix funding calls with vacancies, appointments to boards and councils, consultations and concessions,
// and the site has no category for them, so rows are filtered by title: see NOT_FUNDING, and type 6 must also name a
// form of funding (FUNDING). Each kept row gets its detail page (text, exact deadline time, documents), 20 per call.
// The table has no opening date: opens_at is the publication date. No robots.txt rule covers these paths.
const SITE = "https://www.gov.si";
const LIST = `${SITE}/zbirke/javne-objave/`;
const LICENSE = "GOV.SI public notices, Republic of Slovenia (gov.si)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const TYPES = [2, 6];
const PER_LIST = 100;
const PER_CALL = 20;

// Vacancies and trainee posts, candidates and representatives for boards, councils and commissions, secondments to
// missions, consultations, authorisations, mining rights, honorary awards.
const NOT_FUNDING = /prost\w* (delovn\w* )?mest|kandidat|predstavnik|\bčlan(a|ov|e|ic|ico)?\b|imenovanj|evidentiranje|pripravnišk|pripomb|pooblastil|rudarske pravice|priznanj|dodelitev \S+ sodnik|za opravljanje \S+ dela/i;
const FUNDING = /financ|spodbud|vavčer|subvenc|podpor|štipendij|nepovratn|sredst|pomoč/i;

interface Row { slug: string; code: string; title: string; publisher: string; published: string; due: string; label: string }
interface Cursor { type: number; start: number; rest?: Row[]; more?: boolean }

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/\s+/g, " ").trim();

// "1. 4. 2027" or "1. 4. 2027 do 14.00": Slovenian local time kept as written, end of day when no time is given.
function siDate(text: string | undefined, endOfDay: boolean): string | null {
  const m = text?.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+do\s+(\d{1,2})[.:](\d{2}))?/);
  if (!m) return null;
  const time = m[4] ? `${m[4].padStart(2, "0")}:${m[5]}:00` : endOfDay ? "23:59:59" : "00:00:00";
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${time}.000Z`;
}

function parseList(html: string): Row[] {
  const rows: Row[] = [];
  for (const m of html.matchAll(/<tr>\s*<td class="td-id"[\s\S]*?<\/tr>/g)) {
    const tr = m[0];
    const cell = (cls: string) => clean(tr.match(new RegExp(`<td class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</td>`))?.[1] ?? "");
    const slug = tr.match(/href="\/zbirke\/javne-objave\/([^"/]+)\/?"/)?.[1];
    const title = cell("td-title");
    if (!slug || !title) continue;
    rows.push({ slug, code: cell("td-id"), title, publisher: cell("td-publisher"), published: cell("td-published-date"), due: cell("td-due-date"), label: cell("td-status") });
  }
  return rows;
}

// The title decides when it names the instrument (vouchers, the loan products of the regional development fund);
// otherwise the text is read and a call without loan or guarantee wording is a grant.
function fundingTypes(title: string, body: string): Grant["funding_types"] {
  if (/vavčer/i.test(title)) return ["voucher"];
  if (/posojil|finančn\w+ produkt/i.test(title)) return ["loan"];
  const out = new Set<Grant["funding_types"][number]>();
  if (/posojil/i.test(body)) out.add("loan");
  if (/poroštv|garancij/i.test(body)) out.add("guarantee");
  if (out.size === 0 || /nepovratn|sofinanc|subvenc/i.test(`${title}\n${body}`)) out.add("grant");
  return [...out];
}

// Read from the title and the lines that speak about applicants, not from the whole text.
function beneficiaryTypes(title: string, body: string): Grant["beneficiary_types"] {
  const t = [title, ...body.split("\n").filter((l) => /upravičen|prijavitelj|prijavijo|vlagatelj|prejemnik|kandidira|namenjen/i.test(l))].join("\n").toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/podjetj|gospodarsk\w+ družb|samostojn\w+ podjetnik|zadrug/.test(t)) out.add("company");
  if (/\bmsp\b|mikro, mal|mala in srednj|malih in srednj|srednje velik/.test(t)) out.add("sme");
  if (/zagonsk|podjetnik\w* začetnik/.test(t)) out.add("startup");
  if (/fizičn\w+ oseb|posameznik|kmet(?!ijsk)|nosil\w+ kmetij|študent|dijak|ustvarjal/.test(t)) out.add("individual");
  if (/raziskovaln\w+ organizacij|raziskovaln\w+ zavod|univerz|visokošolsk/.test(t)) out.add("research_org");
  if (/občin|javn\w+ zavod|javn\w+ sektor|državn\w+ organ|lokaln\w+ skupnost/.test(t)) out.add("public_body");
  if (/nevladn|društv|zasebn\w+ zavod|humanitarn/.test(t)) out.add("ngo");
  return [...out];
}

// The call budget, only where the text states it as such: "Višina razpisanih sredstev znaša 1.000.000 evrov".
function budget(text: string): number | null {
  const m = text.match(/(?:razpisan\w*|na razpolago|višina (?:\S+ ){0,2}sredstev|okvirna višina)[^\n]{0,160}?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?(?=\s*milijon))\s*(milijon\w*\s*)?(?:evrov|EUR|€)/i);
  if (!m) return null;
  const n = num(m[1]!.replace(/\./g, "").replace(",", "."));
  return n === null ? null : m[2] ? Math.round(n * 1e6) : n;
}

function normalize(r: Row, html: string): Grant {
  const info = (label: string) => clean(html.match(new RegExp(`<li><strong>${label}</strong>([\\s\\S]*?)</li>`))?.[1] ?? "");
  const from = html.indexOf('<div class="cols article-cols');
  const article = from === -1 ? "" : html.slice(from, html.indexOf("</article>", from));
  const body = stripHtml(article.replace(/<ul class="list-small tender-info">[\s\S]*?<\/ul>/, ""))
    .replace(/ /g, " ")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  const due = info("Rok za prijavo") || r.due;
  const closes = siDate(due, true);
  const opens = siDate(info("Datum objave") || r.published, false);
  const code = info("Šifra") || r.code;
  const publisher = info("Institucija") || r.publisher;
  const documents: Grant["documents"] = [];
  for (const m of article.matchAll(/<a href="([^"]+\.(?:pdf|docx?|xlsx?|odt|ods|zip|rtf))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(decodeEntities(m[1]!), SITE).href;
    const title = clean(m[2]!);
    if (url.startsWith("https://") && title && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  const summary = [
    [code && `Šifra: ${code}`, publisher && `Institucija: ${publisher}`, r.published && `Datum objave: ${r.published}`, due && `Rok za prijavo: ${due}`].filter(Boolean).join("\n"),
    body,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `si_gov_objave:${r.slug}`,
    source: "si_gov_objave",
    source_id: r.slug,
    source_url: `${LIST}${r.slug}/`,
    source_license: LICENSE,
    title: r.title,
    title_lang: "sl",
    summary: summary || null,
    funder_name: publisher || null,
    funder_level: "national",
    country: "SI",
    regions: [],
    funding_types: fundingTypes(r.title, body),
    beneficiary_types: beneficiaryTypes(r.title, body),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: budget(body),
    currency: "EUR",
    status: closes && closes < new Date().toISOString() ? "closed" : r.label === "V teku" ? "open" : "unknown",
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents,
    source_updated_at: null,
  };
}

export const siGovObjave: Source = {
  id: "si_gov_objave",
  license: LICENSE,
  start() {
    return JSON.stringify({ type: TYPES[0]!, start: 0 } satisfies Cursor);
  },
  // A cursor without `rest` reads one list request and keeps the funding rows; the rows that do not fit in this call
  // travel in the cursor, so the list is not read twice.
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    let rows = c.rest;
    let more = c.more ?? false;
    if (!rows) {
      const all = parseList(await fetchHtml(`${LIST}?type=${c.type}&status=ongoing&nrOfItems=${PER_LIST}&start=${c.start}`, UA));
      if (all.length === 0 && c.start === 0) throw new Error(`GOV.SI javne objave returned no rows for type ${c.type} (bot challenge or layout change?)`);
      more = all.length === PER_LIST;
      rows = all.filter((r) => !NOT_FUNDING.test(r.title) && (c.type !== 6 || FUNDING.test(r.title)));
    }
    const batch = rows.slice(0, PER_CALL);
    const rest = rows.slice(PER_CALL);
    const grants = await mapLimit(batch, 2, async (r) => normalize(r, await fetchHtml(`${LIST}${r.slug}/`, UA)));
    const nextType = TYPES[TYPES.indexOf(c.type) + 1];
    const next: Cursor | null = rest.length ? { type: c.type, start: c.start, rest, more } : more ? { type: c.type, start: c.start + PER_LIST } : nextType ? { type: nextType, start: 0 } : null;
    return {
      grants,
      raws: batch.map((r, i) => ({ source_id: r.slug, payload: { row: r, summary: grants[i]!.summary } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
