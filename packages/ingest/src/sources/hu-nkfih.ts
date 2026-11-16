import type { Grant } from "@grantledger/schema";
import { fetchHtml, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Hungary, NKFIH (Nemzeti Kutatási, Fejlesztési és Innovációs Hivatal): the national research, development and
// innovation office. /palyazoknak/palyazatok/aktualis-felhivasok lists the current domestic calls (NKFI Fund,
// Széchenyi Plan Plus, other support) as server-rendered rows; the Horizon Europe tab of the same page is not read.
// Each row links to a call page with a structured block (code, announcement and modification dates, deadlines,
// applicants, budget, grant size, duration), the call summary, the documents and the contact. The page
// /palyazoknak/palyazatok only shows the five latest calls, so it is not used. The current list keeps calls whose
// last deadline has passed: they are emitted as closed. A call with several submission dates closes at the last
// one; a call without any deadline (the capital programmes) is open with no closing date. The list had one page
// when this was written; its pager is script-driven and is not followed. robots.txt: no Disallow for general
// crawlers, Crawl-delay 1, kept with a pause before every request.
const SITE = "https://nkfih.gov.hu";
const LIST_URL = `${SITE}/palyazoknak/palyazatok/aktualis-felhivasok`;
const LICENSE = "NKFIH public call information (nkfih.gov.hu)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CRAWL_DELAY_MS = 1100;
const PER_CALL = 20;
const MONTHS = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/\s+/g, " ").trim();
const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));

// Every date in a text: "2027. október 15. 16:00", "2026. november 15.", "2029.12.31". Hungarian local time kept as written.
function dates(text: string): { day: string; time: string | null }[] {
  const out: { day: string; time: string | null }[] = [];
  for (const m of text.matchAll(new RegExp(`(\\d{4})\\.\\s*(?:(${MONTHS.join("|")})\\s+|(\\d{1,2})\\.\\s*)(\\d{1,2})\\.?(?:\\s+(\\d{1,2}):(\\d{2}))?`, "gi"))) {
    const month = m[2] ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : Number(m[3]);
    if (month < 1 || month > 12) continue;
    out.push({ day: `${m[1]}-${String(month).padStart(2, "0")}-${m[4]!.padStart(2, "0")}`, time: m[5] ? `${m[5].padStart(2, "0")}:${m[6]}:00` : null });
  }
  return out;
}

function parseList(html: string): string[] {
  const from = html.indexOf('id="palyazatok-table-desktop"');
  if (from === -1) return [];
  const to = html.indexOf('id="palyazatok-table-mobil"', from);
  const table = html.slice(from, to === -1 ? undefined : to);
  return [...new Set([...table.matchAll(/<a class="comp-list-link" href="(\/palyazoknak\/[^"#]+)"/g)].map((m) => m[1]!))];
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/vállalkozás|vállalkozói/.test(t)) out.add("company");
  if (/felsőoktatási|kutatóhely|hun-ren|kutatóintézet/.test(t)) out.add("research_org");
  if (/költségvetési/.test(t)) out.add("public_body");
  if (/non-?profit/.test(t)) out.add("ngo");
  if (/magánszemély|természetes személy/.test(t)) out.add("individual");
  return [...out];
}

function normalize(path: string, html: string): Grant {
  const from = html.indexOf('<div id="palyazat_adatok"');
  if (from === -1) throw new Error(`NKFIH call page ${path} has no data block (layout change?)`);
  const end = html.indexOf('<a name="kovetem">', from);
  const boxes = html.slice(from, end === -1 ? undefined : end).split(/<div class="doboz[ "]/).slice(1);
  const box = (re: RegExp) => boxes.find((b) => re.test(b)) ?? "";
  const head = box(/id="main-header-wrapper"/);
  const title = clean(head.match(/<div class="header">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const code = clean(head.match(/<div class="header-code">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const fund = clean(head.match(/<div class="header-link-button">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const meta = clean(box(/Meghirdetés dátuma/));
  const announced = dates(meta.match(/Meghirdetés dátuma:([^M]*)/)?.[1] ?? "")[0];
  const modified = dates(meta.match(/Módosítás:(.*)/)?.[1] ?? "")[0];
  const due = box(/id="palyazati_hataridok"/);
  const electronic = clean(due.match(/Elektronikus benyújtás határideje:([\s\S]*?)<\/div>/)?.[1] ?? "");
  const next = clean(due.match(/kov-hatido-datum">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const further = clean(due.match(/További beadási határidők:<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
  // The last day among all the deadlines, with the time of day when one of them states it for that day.
  const all = dates(`${electronic} ; ${next} ; ${further}`);
  const lastDay = all.map((d) => d.day).sort().at(-1);
  const closes = lastDay ? `${lastDay}T${all.find((d) => d.day === lastDay && d.time)?.time ?? "23:59:59"}.000Z` : null;
  const opens = announced ? `${announced.day}T00:00:00.000Z` : null;
  const fields: [string, string][] = [];
  for (const m of box(/class="list-table adatok"/).matchAll(/<div class="list-cell bold[^"]*">([\s\S]*?)<\/div>\s*<div class="list-cell[^"]*">([\s\S]*?)<\/div>/g)) {
    const label = clean(m[1]!);
    const value = clean(m[2]!);
    if (label && value && !/elektronikus benyújtása/i.test(label)) fields.push([label, value]);
  }
  const field = (label: string) => fields.find(([l]) => l === label)?.[1] ?? "";
  // "150 000 000 Ft" is the call budget; "4-6 MFt", "0,01 - 7,5 MFt" the grant per project in million forints. An
  // amount in another currency ("1000 EUR/fő") stays in the summary only.
  const budget = /Ft/.test(field("Keretösszeg")) ? num(field("Keretösszeg").replace(/\s/g, "").replace(/Ft.*/, "")) : null;
  const size = field("Igényelhető támogatás").match(/^(?:max\.?\s*)?(?:([\d,]+)\s*-\s*)?([\d,]+)\s*MFt/i);
  const million = (s: string | undefined) => (s ? Math.round((num(s.replace(",", ".")) ?? 0) * 1e6) : null);
  const description = stripHtml(box(/^><div class="default-text-wrapper"/))
    .replace(/^>/, "").replace(/ /g, " ")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  const contact = clean(box(/<h4 class="panel-title">\s*Kapcsolat\s*<\/h4>/).replace(/<h4[\s\S]*?<\/h4>/, "").replace(/^[^>]*>/, ""));
  const documents: Grant["documents"] = [];
  for (const m of box(/class="default-panel-wrapper download"/).matchAll(/<div class="download-file"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = new URL(m[1]!.replace(/&amp;/g, "&"), SITE).href;
    const name = clean(m[2]!).replace(/\s*\((?:pdf|docx?|xlsx?|zip|rtf|pptx?)[^)]*\)$/i, "");
    if (url.startsWith("https://") && name && !documents.some((d) => d.url === url)) documents.push({ title: name, url });
  }
  const summary = [
    [
      code && `Pályázat azonosító száma: ${code}`,
      fund && `Forrás: ${fund}`,
      announced && `Meghirdetés dátuma: ${announced.day}`,
      modified && `Módosítás: ${modified.day}`,
      electronic && `Elektronikus benyújtás határideje: ${electronic}`,
      next && `Következő beadási határidő: ${next}`,
      further && `További beadási határidők: ${further}`,
      ...fields.map(([l, v]) => `${l}: ${v}`),
    ].filter(Boolean).join("\n"),
    description,
    contact && `Kapcsolat: ${contact}`,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  const slug = path.replace(/\/+$/, "").split("/").at(-2) ?? "";
  if (!title || !slug) throw new Error(`NKFIH call page ${path} has no title (layout change?)`);
  return {
    id: `hu_nkfih:${slug}`,
    source: "hu_nkfih",
    source_id: slug,
    source_url: `${SITE}${path}`,
    source_license: LICENSE,
    title,
    title_lang: "hu",
    summary,
    funder_name: "Nemzeti Kutatási, Fejlesztési és Innovációs Hivatal",
    funder_level: "national",
    country: "HU",
    regions: [],
    funding_types: /tőkeprogram/i.test(title) ? ["equity"] : ["grant"],
    beneficiary_types: beneficiaryTypes(`${field("Pályázat benyújtója")}, ${field("Támogatásra jogosultak köre")}`),
    sectors: [],
    amount_min: million(size?.[1]),
    amount_max: million(size?.[2]),
    budget_total: budget,
    currency: "HUF",
    status: closes && closes < new Date().toISOString() ? "closed" : "open",
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents,
    source_updated_at: modified ? `${modified.day}T00:00:00.000Z` : null,
  };
}

export const huNkfih: Source = {
  id: "hu_nkfih",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the list, then its first call pages. After that the cursor is the JSON list of call paths still
  // to read. Requests run one after the other with the crawl delay before each.
  async fetchPage(cursor): Promise<Page> {
    let paths: string[];
    if (cursor === "start") {
      await pause();
      paths = parseList(await fetchHtml(LIST_URL, UA));
      if (paths.length === 0) throw new Error("NKFIH returned no current calls (bot challenge or layout change?)");
    } else paths = JSON.parse(cursor) as string[];
    const batch = paths.slice(0, PER_CALL);
    const rest = paths.slice(PER_CALL);
    const grants: Grant[] = [];
    for (const path of batch) {
      await pause();
      grants.push(normalize(path, await fetchHtml(`${SITE}${path}`, UA)));
    }
    return {
      grants,
      raws: grants.map((g, i) => ({ source_id: g.source_id, payload: { path: batch[i], summary: g.summary } })),
      next: rest.length ? JSON.stringify(rest) : null,
    };
  },
};
