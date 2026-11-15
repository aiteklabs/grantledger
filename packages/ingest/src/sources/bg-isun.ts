import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Bulgaria, ISUN 2020 (eumis2020.government.bg): the national information system through which every procedure of
// the EU funds programmes is opened and applied for. /bg/s/Procedure/Active is a server-rendered tree, programme ->
// procedures ("code - name", link to /bg/s/Procedure/Info/{uuid}); the detail page carries the description, the
// application windows, the documents and the evaluation tables. No amounts are published on these pages.
// Most active procedures are not open to applicants at large: technical assistance for the managing authorities,
// and direct awards to named beneficiaries. The page has no field for the procedure type, so it is derived:
//   - dropped by name: "Техническа помощ" (technical assistance) and "Бюджетни линии" (budget lines);
//   - dropped when the documents hold a "Покана" (invitation to the specific beneficiaries) or the text speaks of
//     "конкретни бенефициенти" or "директно предоставяне" (direct award);
//   - kept when the documents hold an "Обява" (the public notice that opens a selection procedure) or the
//     evaluation has a separate "Техническа и финансова оценка" (technical and financial scoring, used to rank
//     competing proposals). Procedures with neither sign (the ITI ones, the transport infrastructure ones) are
//     dropped: they are reserved for approved territorial concepts or for the state infrastructure companies.
// The detail pages are read 20 per call; the list is read again at each call (the cursor is the offset in it).
// There is no robots.txt (404). An F5 cookie is set but not required.
const SITE = "https://eumis2020.government.bg";
const LIST_URL = `${SITE}/bg/s/Procedure/Active`;
const LICENSE = "ISUN 2020 public procedure register, Republic of Bulgaria (eumis2020.government.bg)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PER_CALL = 20;
const NOT_OPEN_BY_NAME = /техническа помощ|бюджетни линии/i;

interface Item { uuid: string; code: string; name: string; programme: string }

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/\s+/g, " ").trim();

function parseList(html: string): Item[] {
  const items: Item[] = [];
  const from = html.indexOf('<div class="easy-tree">');
  if (from === -1) return items;
  let programme = "";
  // Tree nodes in document order: a programme node has no data-href, a procedure node has one.
  for (const m of html.slice(from).matchAll(/<li class="[^"]*"(?: data-href="\/bg\/s\/Procedure\/Info\/([0-9a-f-]{36})")?>\s*([^<]*)/g)) {
    const text = clean(m[2]!);
    if (!m[1]) { programme = text.replace(/\s*\(\d+\)$/, ""); continue; }
    const split = text.match(/^(\S+)\s+-\s+([\s\S]+)$/);
    if (split) items.push({ uuid: m[1], code: split[1]!, name: split[2]!.trim(), programme });
  }
  return items;
}

// "02.07.2026 г. 17:00 ч.": Bulgarian local time kept as written.
function bgDate(text: string): string | null {
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s*г\.)?(?:\s+(\d{1,2}):(\d{2}))?/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}:00.000Z` : null;
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/предприяти|оператори|организации на производители|стопанств|кораб/.test(t)) out.add("company");
  if (/\bмсп\b|малки и средни|микро/.test(t)) out.add("sme");
  if (/общин|публичн|държавн|училищ|детски градини/.test(t)) out.add("public_body");
  if (/неправителствен|юридически лица с нестопанска цел|\bюлнц\b|местни инициативни|\bмиг\b|\bмирг\b/.test(t)) out.add("ngo");
  if (/научн|университет|висши училища/.test(t)) out.add("research_org");
  return [...out];
}

// null when the procedure is not a competitive one (see the header).
function normalize(it: Item, html: string): Grant | null {
  const from = html.indexOf('<div class="procedure-info">');
  const block = from === -1 ? "" : html.slice(from, html.indexOf("<footer", from));
  if (!block) throw new Error(`ISUN procedure ${it.code} has no procedure block (layout change?)`);
  const text = clean(block);
  const docs = [...block.matchAll(/<a target="_blank" href="(\/bg\/s\/Procedure\/InfoDownload\/[^"]+)">([\s\S]*?)<\/a>/g)].map((m) => ({ title: clean(m[2]!), url: `${SITE}${m[1]!.replace(/&amp;/g, "&")}` })).filter((d) => d.title);
  const evals = [...block.matchAll(/<a target="_blank" href="\/bg\/s\/EvalTable[^"]*">([\s\S]*?)<\/a>/g)].map((m) => clean(m[1]!));
  const direct = docs.some((d) => /^покана/i.test(d.title)) || /конкретни\S* бенефициент|директно предоставяне/i.test(text);
  const competitive = docs.some((d) => /^обява/i.test(d.title)) || evals.some((e) => /техническа и финансова оценка/i.test(e));
  if (direct || !competitive) return null;

  const description = stripHtml(block.match(/<\/strong>([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/ /g, " ").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  const windows = [...block.matchAll(/<div class="procedure-info">\s*<p><b>[^<]*<\/b>\s*<span class="required-span">([^<]*)<\/span><\/p>\s*<p><b>[^<]*<\/b>\s*<span class="required-span">([^<]*)<\/span><\/p>/g)].map((m) => ({ from: clean(m[1]!), to: clean(m[2]!) }));
  const opens = windows.map((w) => bgDate(w.from)).filter((d): d is string => d !== null).sort()[0] ?? null;
  const closes = windows.map((w) => bgDate(w.to)).filter((d): d is string => d !== null).sort().at(-1) ?? null;
  const note = clean(block.match(/Допълнителна информация относно крайния срок<\/[^>]+>([\s\S]*?)<p>\s*<b>|Допълнителна информация относно крайния срок<\/[^>]+>([\s\S]*?)<h2>/)?.slice(1).find(Boolean) ?? "");
  const web = block.match(/<b>Интернет адрес:<\/b>\s*<a href="([^"]+)"/)?.[1] ?? clean(block.match(/Интернет адрес:<\/b>([\s\S]*?)<\/p>/)?.[1] ?? "");
  const summary = [
    `Код на процедурата: ${it.code}`,
    it.programme && `Програма: ${it.programme}`,
    description && `Описание: ${description}`,
    windows.length > 0 && `Срокове за кандидатстване:\n${windows.map((w) => `от ${w.from} до ${w.to}`).join("\n")}`,
    note && `Допълнителна информация относно крайния срок: ${note}`,
    web && `Интернет адрес: ${web}`,
    docs.length > 0 && `Документи за кандидатстване и информация: ${docs.map((d) => d.title).join("; ")}`,
    evals.length > 0 && `Оценителни таблици: ${evals.join("; ")}`,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `bg_isun:${it.code}`,
    source: "bg_isun",
    source_id: it.code,
    source_url: `${SITE}/bg/s/Procedure/Info/${it.uuid}`,
    source_license: LICENSE,
    title: it.name,
    title_lang: "bg",
    summary,
    funder_name: it.programme || null,
    funder_level: "national",
    country: "BG",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(`${it.name}\n${description}`),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: statusFromDates(opens, closes),
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents: docs.filter((d, i) => docs.findIndex((x) => x.url === d.url) === i),
    source_updated_at: null,
  };
}

export const bgIsun: Source = {
  id: "bg_isun",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const offset = Number(cursor);
    const all = parseList(await fetchHtml(LIST_URL, UA));
    if (all.length === 0) throw new Error("ISUN 2020 returned no active procedures (bot challenge or layout change?)");
    // Sorted by code so that the offset means the same procedure whatever order the tree is rendered in.
    const items = all.filter((it) => !NOT_OPEN_BY_NAME.test(it.name)).sort((a, b) => a.code.localeCompare(b.code));
    const batch = items.slice(offset, offset + PER_CALL);
    const results = await mapLimit(batch, 2, async (it) => normalize(it, await fetchHtml(`${SITE}/bg/s/Procedure/Info/${it.uuid}`, UA)));
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    results.forEach((g, i) => {
      if (!g) return;
      grants.push(g);
      raws.push({ source_id: g.source_id, payload: { item: batch[i], summary: g.summary } });
    });
    return { grants, raws, next: offset + PER_CALL < items.length ? String(offset + PER_CALL) : null };
  },
};
