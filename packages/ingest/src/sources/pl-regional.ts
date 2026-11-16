import type { Grant } from "@grantledger/schema";
import { mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Poland, regional EU programmes 2021-2027 (Fundusze Europejskie dla ...): the calls ("nabory") of five voivodeship
// sites built on the same Drupal distribution. /nabory is a server-rendered list, 10 calls per page, with status,
// start, end and the maximum amount, rate or call budget. Two variants of the template exist: "nabory" (Małopolskie,
// Dolnośląskie, Pomorskie) and "recruitment" (Opolskie, Wielkopolskie); both take a status filter in the query string,
// so only running and upcoming calls are listed (one to three pages per site instead of the whole history). The call
// page adds who can apply, what is funded, the budget, how to apply and the documents. Calls in the non-competitive
// mode ("niekonkurencyjny", projects named in advance) are left out. Other voivodeships run other systems.
const LICENSE = "Regional EU programme public call notices (voivodeship managing authorities, Fundusze Europejskie 2021-2027)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

interface Site { key: string; host: string; nuts: string; programme: string; variant: "nabory" | "recruitment" }
const SITES: Site[] = [
  { key: "malopolskie", host: "fundusze.malopolska.pl", nuts: "PL21", programme: "Fundusze Europejskie dla Małopolski 2021-2027", variant: "nabory" },
  { key: "dolnoslaskie", host: "funduszeuedolnoslaskie.pl", nuts: "PL51", programme: "Fundusze Europejskie dla Dolnego Śląska 2021-2027", variant: "nabory" },
  { key: "pomorskie", host: "funduszeuepomorskie.pl", nuts: "PL63", programme: "Fundusze Europejskie dla Pomorza 2021-2027", variant: "nabory" },
  { key: "opolskie", host: "funduszeue.opolskie.pl", nuts: "PL52", programme: "Fundusze Europejskie dla Opolskiego 2021-2027", variant: "recruitment" },
  { key: "wielkopolskie", host: "funduszeue.wielkopolskie.pl", nuts: "PL41", programme: "Fundusze Europejskie dla Wielkopolski 2021-2027", variant: "recruitment" },
];
// Status filter of each variant: the taxonomy ids of "running" and "upcoming" are the same on every site of a variant.
const FILTER = {
  nabory: { open: "1195", upcoming: "1197", param: "field_status_naboru" },
  recruitment: { open: "16", upcoming: "15", param: "field_recruitment_status_target_id" },
};
// Lines of the call page that are interface controls or file sizes, not content.
const NOISE = /^(?:Voice|Prędkość|Zapisz w moje|Spis treści|Powiadom o wynikach|Zobacz wszystkie|Dokument|\((?:pdf|docx?|xlsx?|zip|odt|rtf),|\d+(?:[.,]\d+)?|[KM]b\))$/i;
// Where the contact blocks start (addresses, phone numbers, names of contact persons). On the "nabory" variant they
// close the page; on the "recruitment" variant only the Wielkopolskie heading is safe to cut at.
const CONTACTS = {
  nabory: /\n(?:Nazwa i adres instytucji organizującej nabór|Gdzie szukać informacji\?|Dane do kontak\w* w sprawie naboru|Osoba do kontaktu:?)\n/,
  recruitment: /\nMasz pytania\? Skontaktuj się:\n/,
};

// Call numbers of the 2021-2027 programmes, like "FEMP.14.01-IZ.00-122/26".
const CALL_NUMBER = /\bFE[A-Z]{2}\.\d{2}\.\d{2}-I[A-Z]\.\d{2}-\d{3}\/\d{2}\b/g;

interface Cursor { site: number; page: number }
interface Row { path: string; id: string; title: string; statusId: string; status: string; intro: string; start: string; end: string; startIso: string | null; endIso: string | null; funding: string[] }
interface Detail { text: string; numbers: string[]; documents: Grant["documents"] }

function plain(html: string | null | undefined): string {
  return html ? stripHtml(html).replace(/[\u00a0\u200b\u202f]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim() : "";
}
const oneLine = (html: string | null | undefined) => plain(html).replace(/\n/g, " ");

// The text of the first field with this Drupal field name inside a fragment.
function field(html: string, name: string): string {
  return oneLine(html.match(new RegExp(`field--name-${name}[ "][^>]*>([\\s\\S]*?)(?=<(?:div|h\\d)\\s[^>]*class="[^"]*field--name-|$)`))?.[1]);
}

// Start and end of the application period. The "nabory" variant prints dd.mm.yyyy; the "recruitment" variant adds a
// <time datetime> in UTC, which is a real hour only when it is not local midnight, local end of day or the noon
// placeholder. A day without an hour is kept as that day: a start at 00:00, an end at 23:59:59.
function dates(fragment: string, endOfDay: boolean): { text: string; iso: string | null } {
  const time = fragment.match(/<time datetime="([^"]+)"/)?.[1];
  const m = fragment.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return { text: "", iso: null };
  const exact = time && !/T(22:00:00|23:00:00|21:59:59|22:59:59|12:00:00)Z$/.test(time) ? new Date(time) : null;
  const iso = exact && !Number.isNaN(exact.getTime()) ? exact.toISOString() : `${m[3]}-${m[2]}-${m[1]}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z`;
  return { text: m[0], iso };
}

function parseList(html: string, site: Site): Row[] {
  const rows: Row[] = [];
  const marker = site.variant === "nabory" ? /<div data-history-node-id="(\d+)" class="node node--type-nabory / : /<div class="node node--type-recruitment node--view-mode-teaser/;
  const parts = html.split(new RegExp(`(?=${marker.source})`)).slice(1);
  for (const part of parts) {
    const link = part.match(/<h[23]>\s*<a href="(\/nabory\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const path = link[1] as string;
    const nodeId = part.match(marker)?.[1];
    const status = site.variant === "nabory" ? part.match(/cshs-term-group__title" data-id="(\d+)">\s*([^<]*)/) : part.match(/class="recruitment-status--(\d+)[^"]*">([^<]*)/);
    const [startPart, endPart] = part.split(/Koniec\s*<\/(?:h3|div)>/);
    const start = dates((startPart ?? "").split(/(?:Start|Początek)\s*<\/(?:h3|div)>/)[1] ?? "", false);
    const end = dates(endPart ?? "", true);
    // Labelled money lines: "Maksymalny procent dofinansowania: 85%", "Budżet naboru: 30 660 000,00 PLN".
    const funding: string[] = [];
    let label = "";
    for (const f of part.matchAll(/field--name-(field-maksymalna-kwota-opis|field-maksymalny-procent-opis|field-max-level-funding-label|field-max-perc-funding-label|field-maksymalny-procent-dofinan|field-maksymalna-kwota-dofinanso|field-max-level-funding|field-max-perc-funding)[ "]/g)) {
      const text = field(part.slice(f.index), f[1] as string);
      if (/(opis|label)$/.test(f[1] as string)) label = text;
      else if (text) funding.push(label ? `${label}: ${text}` : text);
    }
    rows.push({
      path,
      id: `${site.key}-${nodeId ?? path.split("/").pop()}`,
      title: oneLine(link[2]),
      statusId: status?.[1] ?? "",
      status: (status?.[2] ?? "").trim(),
      intro: [field(part, "field-wprowadzenie"), field(part, "field-recruitment-introduction"), field(part, "field-intro"), field(part, "field-na-co-opis")].filter(Boolean).join("\n"),
      start: start.text,
      end: end.text,
      startIso: start.iso,
      endIso: end.iso,
      funding,
    });
  }
  return rows;
}

// The call page: the text of <main> without the contact blocks at its end, the call numbers and the linked files.
async function detail(site: Site, path: string): Promise<Detail | null> {
  const url = `https://${site.host}${path}`;
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  if (!main) return null;
  // The table of contents and the forms (bulk download of the files, page rating) are not part of the text.
  const full = plain(main.replace(/<(nav|form)\b[\s\S]*?<\/\1>/g, " "));
  const text = full
    .split("\n")
    .filter((line) => !NOISE.test(line))
    .join("\n")
    .split(CONTACTS[site.variant])[0] as string;
  const documents: Grant["documents"] = [];
  for (const m of main.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = (m[1] as string).trim();
    const title = oneLine(m[2]);
    // Links to an alternative format of the same file are titled "docx 103.33 KB".
    if (!/\.(pdf|docx?|xlsx?|zip|odt|ods|rtf|7z|pptx?)$/i.test(href) || !title || /^[a-z0-9]{2,4} [\d.,]+ ?[KM]B$/i.test(title)) continue;
    try {
      const abs = new URL(href, url).href;
      if (abs.startsWith("https://") && !documents.some((d) => d.url === abs) && documents.length < 50) documents.push({ title, url: abs });
    } catch {
      // A malformed link is not a document.
    }
  }
  return { text, numbers: [...new Set(full.match(CALL_NUMBER) ?? [])], documents };
}

// "21 552 500,00 zł", "15 000 000 PLN", "2,5 mln zł".
function money(text: string | undefined): number | null {
  const m = (text ?? "").replace(/[\u00a0\u202f]/g, " ").match(/(\d[\d ]*)(?:[,.](\d{1,2}))?\s*(mln|mld|tys)?\.?\s*(?:zł|pln)/i);
  if (!m) return null;
  const scale = { mln: 1e6, mld: 1e9, tys: 1e3 }[(m[3] ?? "").toLowerCase()] ?? 1;
  const value = num(`${(m[1] as string).replace(/ /g, "")}.${m[2] ?? "0"}`);
  return value === null ? null : Math.round(value * scale * 100) / 100;
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = (text.match(/(?:Kto może składać wniosek|Kto może ubiegać się|Typ beneficjenta|Dla kogo|Szczegóły naboru)[\s\S]{0,800}/)?.[0] ?? "").toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/mśp|mikroprzedsiębior|mał\w+ (?:i|oraz|lub) średni|małe przedsiębior|średnie przedsiębior/.test(t)) out.add("sme");
  if (/przedsiębior|spółk/.test(t)) out.add("company");
  if (/uczelni|naukow|badawcz|szkoł\w+ wyższ|instytucje nauki/.test(t)) out.add("research_org");
  if (/samorząd|\bjst\b|administracj|gmin|powiat|służby publiczne|jednost\w+ budżetow|instytucje kultury|instytucje ochrony zdrowia/.test(t)) out.add("public_body");
  if (/pozarządow|\bngo\b|fundacj|organizacje społeczne|(?<!związki i )stowarzysz/.test(t)) out.add("ngo");
  if (/osoby fizyczne/.test(t)) out.add("individual");
  return [...out].sort();
}

function normalize(site: Site, r: Row, d: Detail | null): Grant {
  const now = new Date().toISOString();
  const filter = FILTER[site.variant];
  const status: Grant["status"] = r.endIso && r.endIso < now ? "closed" : r.statusId === filter.upcoming || (r.startIso && r.startIso > now) ? "forthcoming" : r.statusId === filter.open ? "open" : "unknown";
  const text = d?.text ?? "";
  const all = `${r.funding.join("\n")}\n${text}`;
  const numbers = d?.numbers.length ? d.numbers : [...new Set(`${r.title} ${r.intro}`.match(CALL_NUMBER) ?? [])];
  const summary = [
    [
      `Program: ${site.programme}`,
      numbers.length > 0 && `Numer naboru: ${numbers.join(", ")}`,
      r.status && `Status: ${r.status}`,
      r.start && `Start: ${r.start}`,
      r.end && `Koniec: ${r.end}`,
      ...r.funding,
    ].filter(Boolean).join("\n"),
    text || r.intro,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `pl_regional:${r.id}`,
    source: "pl_regional",
    source_id: r.id,
    source_url: `https://${site.host}${r.path}`,
    source_license: LICENSE,
    title: r.title,
    title_lang: "pl",
    summary,
    funder_name: site.programme,
    funder_level: "regional",
    country: "PL",
    regions: [site.nuts],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(text),
    sectors: [],
    amount_min: null,
    amount_max: money(all.match(/Maksymalna (?:kwota|wartość) dofinansowania[^\n]*?[:\n]\s*([^\n]+)/)?.[1]),
    budget_total: money(all.match(/(?:Ogólna pula środków|Pula środków na nabór|Budżet naboru|Kwota alokacji)[^\n]*?[:\n]\s*([^\n]+)/)?.[1]),
    currency: "PLN",
    status,
    opens_at: r.startIso,
    closes_at: r.endIso,
    documents: d?.documents ?? [],
    source_updated_at: null,
  };
}

export const plRegional: Source = {
  id: "pl_regional",
  license: LICENSE,
  start() {
    return JSON.stringify({ site: 0, page: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const site = SITES[c.site];
    if (!site) return { grants: [], raws: [], next: null };
    const filter = FILTER[site.variant];
    const url = `https://${site.host}/nabory?${filter.param}%5B${filter.open}%5D=${filter.open}&${filter.param}%5B${filter.upcoming}%5D=${filter.upcoming}&page=${c.page}`;
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const html = await res.text();
    // A region can have no running call, so an empty list is accepted only when the list view itself is there.
    if (!html.includes("views-exposed-form")) throw new Error(`${site.host}: the list of calls is missing (bot challenge or changed markup)`);
    const listed = parseList(html, site);
    if (c.page === 0 && listed.length === 0 && /node--type-(nabory|recruitment)/.test(html)) throw new Error(`${site.host}: calls are listed but none could be parsed (changed markup)`);
    const rows = listed.filter((r) => !/niekonkurencyjn/i.test(`${r.title} ${r.intro}`));
    const details = await mapLimit(rows, 2, (r) => detail(site, r.path));
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    rows.forEach((r, i) => {
      const d = details[i] ?? null;
      // The selection mode is sometimes stated on the call page only.
      if (d && /(?:Sposób wyboru projektów|Rodzaj pomocy|Tryb naboru)\n\s*niekonkurencyjn/i.test(d.text)) return;
      grants.push(normalize(site, r, d));
      raws.push({ source_id: r.id, payload: { host: site.host, ...r } });
    });
    const more = new RegExp(`[?&;]page=${c.page + 1}(?!\\d)`).test(html);
    const next: Cursor | null = more ? { site: c.site, page: c.page + 1 } : c.site + 1 < SITES.length ? { site: c.site + 1, page: 0 } : null;
    return { grants, raws, next: next ? JSON.stringify(next) : null };
  },
};
