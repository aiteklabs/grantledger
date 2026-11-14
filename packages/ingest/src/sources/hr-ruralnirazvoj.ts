import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, num, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Croatia, ruralnirazvoj.hr (Ministry of Agriculture, Forestry and Fisheries): calls ("natječaji") of the CAP
// Strategic Plan 2023-2027, the rural development and sector interventions paid by the Paying Agency (APPRRR). The
// list at /natjecaji/ is server-rendered WordPress, 12 calls per page (?tab=spzpp&page_spzpp=N, about 5 pages), each
// with a status badge, the first and the last day for applications; open calls come first. The call page adds the
// call value, the documents and a short structured text (subject, co-financing, eligible beneficiaries, aid per
// project, deadline), and is read only for calls that are not closed. The status badge can lag behind the end date,
// so a call past its last day is closed whatever the badge says. Times are Croatian wall-clock times kept with a Z
// suffix, like the other Croatian source. robots.txt has no rule for these paths and no crawl delay.
const SITE = "https://ruralnirazvoj.hr";
const LICENSE = "ruralnirazvoj.hr public call information (Ministarstvo poljoprivrede, šumarstva i ribarstva)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const MAX_PAGES = 10;

interface Item { url: string; slug: string; title: string; badge: string; from: string | null; to: string | null }

const clean = (html: string): string => stripHtml(html.replace(/\s+/g, " ")).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();
// "21. 10. 2026" to "2026-10-21".
const hrDay = (s: string | undefined): string | null => { const m = s?.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/); return m ? `${m[3]}-${(m[2] as string).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}` : null; };
// "15.000.000,00" to 15000000.
const hrNumber = (s: string | undefined): number | null => (s ? num(s.replace(/\./g, "").replace(",", ".")) : null);

function parseList(html: string): { items: Item[]; hasNext: boolean } {
  const pane = html.slice(html.indexOf('id="pane-spzpp"'), html.indexOf('id="pane-plan"') === -1 ? undefined : html.indexOf('id="pane-plan"'));
  const items: Item[] = [];
  for (const m of pane.matchAll(/<article class="tender__item">([\s\S]*?)<\/article>/g)) {
    const block = m[1] as string;
    const link = block.match(/<a href="(https:\/\/ruralnirazvoj\.hr\/([^"/]+)\/?)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    items.push({
      url: link[1] as string,
      slug: link[2] as string,
      title: clean(link[3] as string),
      badge: clean(block.match(/<span class="btn btn-sm disabled[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? ""),
      from: hrDay(block.match(/Datum prijave:<\/strong>([^<]*)/)?.[1]),
      to: hrDay(block.match(/Kraj prijave:<\/strong>([^<]*)/)?.[1]),
    });
  }
  return { items, hasNext: /class="next page-numbers"/.test(pane) };
}

function status(item: Item): Grant["status"] {
  const today = new Date().toISOString().slice(0, 10);
  if (/zatvoren|završen|poništen/i.test(item.badge) || (item.to !== null && item.to < today)) return "closed";
  if (/najav|uskoro|priprem/i.test(item.badge) || (item.from !== null && item.from > today)) return "forthcoming";
  return /otvoren/i.test(item.badge) || item.from || item.to ? "open" : "unknown";
}

function beneficiaryTypes(s: string): Grant["beneficiary_types"] {
  const t = s.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/poljoprivredn|proizvođačk|pravne osobe|obrt|poduzet|trgovačk|zadrug|šumoposjedni/.test(t)) out.add("company");
  if (/mikro|mala i srednja|malih i srednjih|msp/.test(t)) out.add("sme");
  if (/fizičke osobe(?! i pravne osobe upisane)|šumoposjedni/.test(t)) out.add("individual");
  if (/jedinice lokalne|jedinice područne|općin|gradovi|javn(a|e|i|o) (ustanov|tijel|poduzeć)|županij/.test(t)) out.add("public_body");
  if (/udrug|lokalne akcijske|lag-?ov/.test(t)) out.add("ngo");
  if (/znanstven|istraživačk|fakultet|sveučilišt/.test(t)) out.add("research_org");
  return [...out];
}

function normalize(item: Item, page: string | null): Grant {
  const article = page?.match(/<main id="main"[\s\S]*?<\/main>/)?.[0].split('<div class="share-wrapper">')[0] ?? "";
  const programme = clean(article.match(/<div class="col-md-12 tender-key[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const value = clean(article.match(/<h3>\s*Vrijednost natječaja:\s*<span>([\s\S]*?)<\/span>/)?.[1] ?? "");
  const body = clean(article.match(/<div class="alert alert-light" role="alert">([\s\S]*)$/)?.[1] ?? "");
  const documents = [...(article.match(/<ul class="docs">([\s\S]*?)<\/ul>/)?.[1] ?? "").matchAll(/<a href="(https:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ title: clean(m[2] as string), url: (m[1] as string).replace(/ /g, "%20") })).filter((d) => d.title);
  // "Visina javne potpore po projektu: od 15.000 EUR-a do 500.000 EUR-a".
  const aid = body.match(/(?:Visina|Iznos)[^\n]*potpore[^\n]*\n?[^\n]*?od\s*([\d.]+(?:,\d+)?)\s*(?:EUR|eura)[^\n]*?do\s*([\d.]+(?:,\d+)?)\s*(?:EUR|eura)/i);
  // "Visina potpore po korisniku: Maksimalni iznos godišnje potpore po korisniku je 75.000 EUR."
  const cap = aid ? null : body.match(/(?:Visina|Iznos)[^\n]*potpore[^\n]*\n[^\n]*?(?:maksimaln|najviš)[^\n]*?([\d.]+(?:,\d+)?)\s*(?:EUR|eura)/i);
  // "Rok za podnošenje ...: od 21. listopada 2026. godine od 12:00 sati do 1. prosinca 2026. do 12:00 sati".
  const hours = [...(body.match(/Rok za podnošenje[\s\S]{0,400}/)?.[0] ?? "").matchAll(/(\d{1,2})[:.](\d{2})\s*sati/g)];
  const first = hours.length > 1 ? hours[0] : undefined;
  const last = hours.at(-1);
  const time = (m: RegExpMatchArray | undefined, fallback: string) => (m ? `${(m[1] as string).padStart(2, "0")}:${m[2]}:00` : fallback);
  const applicants = body.match(/Prihvatljivi (?:korisnici|prijavitelji)[\s\S]{0,1200}/i)?.[0] ?? "";
  const summary = [
    programme && `Program: ${programme}`,
    item.badge && `Status: ${item.badge}`,
    item.from && `Datum prijave: ${Number(item.from.slice(8))}. ${Number(item.from.slice(5, 7))}. ${item.from.slice(0, 4)}.`,
    item.to && `Kraj prijave: ${Number(item.to.slice(8))}. ${Number(item.to.slice(5, 7))}. ${item.to.slice(0, 4)}.`,
    value && `Vrijednost natječaja: ${value}`,
    body,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `hr_ruralnirazvoj:${item.slug}`,
    source: "hr_ruralnirazvoj",
    source_id: item.slug,
    source_url: item.url,
    source_license: LICENSE,
    title: item.title,
    title_lang: "hr",
    summary: summary || null,
    funder_name: "Ministarstvo poljoprivrede, šumarstva i ribarstva",
    funder_level: "national",
    country: "HR",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(applicants),
    sectors: [],
    amount_min: hrNumber(aid?.[1]),
    amount_max: hrNumber(aid?.[2] ?? cap?.[1]),
    budget_total: hrNumber(value.match(/[\d.]+(?:,\d+)?/)?.[0]),
    currency: "EUR",
    status: status(item),
    opens_at: item.from ? `${item.from}T${time(first, "00:00:00")}.000Z` : null,
    closes_at: item.to ? `${item.to}T${time(last, "23:59:59")}.000Z` : null,
    documents,
    source_updated_at: toIso(page?.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1]),
  };
}

export const hrRuralnirazvoj: Source = {
  id: "hr_ruralnirazvoj",
  license: LICENSE,
  start() {
    return "1";
  },
  // The cursor is the list page number: one list page and the call pages of its calls that are not closed.
  async fetchPage(cursor): Promise<Page> {
    const pageNo = Number(cursor);
    const { items, hasNext } = parseList(await fetchHtml(`${SITE}/natjecaji/?tab=spzpp&page_spzpp=${pageNo}`, UA));
    if (pageNo === 1 && items.length === 0) throw new Error("ruralnirazvoj.hr: no calls on /natjecaji/ (bot challenge or changed markup?)");
    const pages = await mapLimit(items, 2, (item) => (status(item) === "closed" ? Promise.resolve(null) : fetchHtml(item.url, UA)));
    const grants = items.map((item, i) => normalize(item, pages[i] ?? null));
    return {
      grants,
      raws: grants.map((g, i) => ({ source_id: g.source_id, payload: { ...items[i], summary: g.summary } })),
      next: hasNext && items.length > 0 && pageNo < MAX_PAGES ? String(pageNo + 1) : null,
    };
  },
};
