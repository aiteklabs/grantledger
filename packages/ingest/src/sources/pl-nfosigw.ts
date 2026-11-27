import type { Grant } from "@grantledger/schema";
import { decodeEntities, mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Poland, Narodowy Fundusz Ochrony Środowiska i Gospodarki Wodnej (National Fund for Environmental Protection and
// Water Management): the schedule of calls ("harmonogram naborów"), one hand-edited table on gov.pl with the
// programme, mode, planned start and end, state (running or planned) and the call id, which usually links to the call
// page. A row gives one record per linked call page (a row can hold a grant call and a loan call with separate pages).
// The call pages on www.gov.pl share one template and add the purpose, beneficiaries, form of funding, budget and
// documents; they are read only for running and planned calls. The table is small (about 50 calls) and is fetched
// again on every fetchPage call, the cursor is the offset into its records. Dates given as quarters stay as text in
// the summary. Coordinator names and phone numbers are left out, and so are rows in the non-competitive mode (projects
// named in advance). Links wrapped by Outlook "safelinks" are unwrapped.
const SITE = "https://www.gov.pl";
const LIST_URL = `${SITE}/web/nfosigw/harmonogram-naborow`;
const LICENSE = "CC BY-SA 4.0 (gov.pl text content, Narodowy Fundusz Ochrony Środowiska i Gospodarki Wodnej)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const BATCH = 20;

interface Item {
  id: string;
  title: string;
  group: string;
  nr: string;
  name: string;
  mode: string;
  start: string;
  end: string;
  state: string;
  ids: string;
  notes: string;
  link: string | null;
}
interface Detail { heading: string; text: string; documents: Grant["documents"] }

function plain(html: string | null | undefined): string {
  return html ? stripHtml(html).replace(/[\u00a0\u200b\u202f]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim() : "";
}
const oneLine = (html: string | null | undefined) => plain(html).replace(/\n/g, " ");

function slug(text: string): string {
  return text.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

// The target of a link in the table: Outlook safelinks carry the real address in the `url` parameter.
function target(href: string): string | null {
  let url = decodeEntities(href).trim();
  if (/safelinks\.protection\.outlook\.com/.test(url)) {
    try {
      url = new URL(url).searchParams.get("url") ?? "";
    } catch {
      return null;
    }
  }
  url = url.replace(/#.*$/, "").replace(/^http:\/\//, "https://");
  return /^https:\/\/[a-z0-9.-]+\.[a-z]+(\/[^@\s]*)?$/i.test(url) ? url : null;
}

function parseTable(html: string): Item[] {
  const table = html.match(/<table[^>]*class="Table"[\s\S]*?<\/table>/)?.[0] ?? html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
  const items: Item[] = [];
  let group = "";
  let nr = "";
  let nameHtml = "";
  for (const row of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    let cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1] as string);
    // One or two cells: the heading of a priority area. Seven cells: a further call of the programme in the row above
    // (its number and name cells span several rows).
    if (cells.length <= 2) {
      group = oneLine(cells.at(-1)) || group;
      continue;
    }
    if (cells.length === 7) cells = [nr, nameHtml, ...cells];
    if (cells.length < 9) continue;
    nr = oneLine(cells[0]);
    nameHtml = cells[1] as string;
    const name = oneLine(nameHtml).replace(/\s*\*+$/, "");
    const state = oneLine(cells[5]);
    const mode = oneLine(cells[2]);
    // The non-competitive mode ("niekonkurencyjny") is for projects named in advance: a direct award, not a call.
    if (!name || /^Stan naboru/i.test(state) || /^niekonkurencyjny/i.test(mode)) continue;
    const base = { group, nr, name, mode, start: oneLine(cells[3]), end: oneLine(cells[4]), state, notes: oneLine(cells[8]) };
    // Calls of the row: the linked ids grouped by their page; a row without links is one call.
    const calls = new Map<string, string[]>();
    for (const a of (cells[6] as string).matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const link = target(a[1] as string);
      const id = oneLine(a[2]).replace(/^Ogłoszenie o naborze\s+/i, "");
      if (link && id) calls.set(link, [...(calls.get(link) ?? []), id]);
    }
    const allIds = plain(cells[6]).split("\n").join(", ");
    if (calls.size <= 1) {
      const [link, ids] = [...calls][0] ?? [null, []];
      items.push({ ...base, id: slug(ids[0] ?? plain(cells[6]).split("\n")[0] ?? "") || slug(`${nr} ${name}`), title: name, ids: allIds, link });
    } else {
      for (const [link, ids] of calls) items.push({ ...base, id: slug(ids[0] as string), title: name, ids: ids.join(", "), link });
    }
  }
  // Calls that share a programme name get the call id in the title; repeated ids get a counter.
  const titles = new Map<string, number>();
  for (const it of items) titles.set(it.title, (titles.get(it.title) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const it of items) {
    if ((titles.get(it.title) ?? 0) > 1 && it.ids) it.title = `${it.title} (${it.ids})`;
    const n = (seen.get(it.id) ?? 0) + 1;
    seen.set(it.id, n);
    if (n > 1) it.id = `${it.id}-${n}`;
  }
  return items;
}

// "2026-11-02" or "2026.12.01"; quarters and other wording give null.
function day(text: string, endOfDay = false): string | null {
  const m = text.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z` : null;
}

// A call page of the gov.pl template. A link that redirects away from the page (removed pages go to the home page)
// or a page without the article gives null.
async function detail(url: string): Promise<Detail | null> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!res.url.startsWith(`${SITE}/web/`)) return null;
  const article = (await res.text()).match(/<article class="article-area__article[\s\S]*?<\/article>/)?.[0];
  if (!article) return null;
  const body = article
    .replace(/<h2>[\s\S]*?<\/h2>/, "")
    .replace(/<p class="event-date">[\s\S]*?<\/p>/, "")
    .replace(/<div class="main-photo">[\s\S]*?<\/picture>\s*<\/div>/, "")
    .split(/<h3>Materiały<\/h3>/)[0];
  const documents: Grant["documents"] = [];
  for (const m of article.matchAll(/<a class="file-download" href="(\/attachment\/[^"]+)"[^>]*>([\s\S]*?)<br/g)) {
    const title = oneLine(m[2]);
    const href = `${SITE}${m[1]}`;
    if (title && !documents.some((d) => d.url === href)) documents.push({ title, url: href });
  }
  return { heading: oneLine(article.match(/<h2>([\s\S]*?)<\/h2>/)?.[1]), text: plain(body), documents };
}

// "Alokacja ... 45 000 000,00 zł", "Budżet naboru ... wynosi do 500 mln zł", "Limit środków ... 400 000 tys. zł".
function budget(text: string): number | null {
  const m = text.match(/(?:Alokacja|Budżet (?:naboru|programu)|Limit środków|Kwota środków przeznaczona)[^\d]{0,140}(\d[\d ]*)(?:,(\d{1,2}))?\s*(mln|mld|tys)?\.?\s*zł/i);
  if (!m) return null;
  const scale = { mln: 1e6, mld: 1e9, tys: 1e3 }[(m[3] ?? "").toLowerCase()] ?? 1;
  const value = num(`${(m[1] as string).replace(/ /g, "")}.${m[2] ?? "0"}`);
  return value === null ? null : Math.round(value * scale * 100) / 100;
}

function fundingTypes(it: Item, text: string): Grant["funding_types"] {
  const find = (s: string): Grant["funding_types"] => [/dotacj/i.test(s) && "grant", /pożycz|poż\b/i.test(s) && "loan"].filter(Boolean) as Grant["funding_types"];
  const fromTable = find(`${it.ids} ${it.name}`);
  if (fromTable.length) return fromTable;
  const fromPage = find(text.match(/Form[ay] dofinansowania[\s\S]{0,300}/)?.[0] ?? text.match(/w formie (?:dotacji|pożyczki)[^\n]*/)?.[0] ?? "");
  if (fromPage.length) return fromPage;
  // Calls under the EU programme FEnIKS are non-repayable co-financing.
  return /Fundusze Europejskie/.test(it.group) ? ["grant"] : [];
}

function beneficiaryTypes(it: Item, text: string): Grant["beneficiary_types"] {
  const who = text.match(/(?:Beneficjen|Uprawnionymi|Kto może|Rodzaj podmiotów)[\s\S]{0,500}/)?.[0] ?? "";
  // The remarks column counts only when it names the addressees ("Nabór skierowany do ...", "nabór dla ...").
  const t = `${/nabór (?:skierowany do|dla|przeznaczony dla|dotyczy)/i.test(it.notes) ? it.notes : ""} ${who}`.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/mśp|mikroprzedsiębior|małe i średnie/.test(t)) out.add("sme");
  if (/przedsiębior|spółk/.test(t)) out.add("company");
  if (/instytut|uczelni|szkoły wyższe|naukow|badawcz/.test(t)) out.add("research_org");
  if (/samorząd|gmin|powiat|jednost\w+ budżetow|park\w* narodow|administracj|wfośigw|wojewódzki\w+ fundusz/.test(t)) out.add("public_body");
  if (/pozarządow|organizacj\w+ ekologiczn|stowarzysz|fundacj/.test(t)) out.add("ngo");
  if (/osoby fizyczne|osób fizycznych/.test(t)) out.add("individual");
  return [...out].sort();
}

function normalize(it: Item, d: Detail | null, fetched: boolean): Grant {
  const opens = day(it.start);
  const closes = day(it.end, true);
  const now = new Date().toISOString();
  const status: Grant["status"] = closes && closes < now ? "closed" : /trwa/i.test(it.state) ? "open" : /planowan/i.test(it.state) ? "forthcoming" : "unknown";
  const text = d?.text ?? "";
  const summary = [
    [
      it.group && `Obszar: ${it.group}`,
      `Program priorytetowy: ${[it.nr, it.name].filter(Boolean).join(" ")}`,
      it.mode && `Tryb naboru: ${it.mode}`,
      it.start && `Planowana data rozpoczęcia naboru wniosków: ${it.start}`,
      it.end && `Planowana data zakończenia naboru wniosków: ${it.end}`,
      it.state && `Stan naboru: ${it.state}`,
      it.ids && `Oznaczenie naboru: ${it.ids}`,
      it.notes && `Uwagi: ${it.notes}`,
    ].filter(Boolean).join("\n"),
    d?.heading,
    text,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `pl_nfosigw:${it.id}`,
    source: "pl_nfosigw",
    source_id: it.id,
    // A linked page that turned out to be gone falls back to the schedule itself.
    source_url: it.link && !(fetched && !d) ? it.link : LIST_URL,
    source_license: LICENSE,
    title: it.title,
    title_lang: "pl",
    summary,
    funder_name: "Narodowy Fundusz Ochrony Środowiska i Gospodarki Wodnej (NFOŚiGW)",
    funder_level: "national",
    country: "PL",
    regions: [],
    funding_types: fundingTypes(it, text),
    beneficiary_types: beneficiaryTypes(it, text),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: budget(text),
    currency: "PLN",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: null,
  };
}

export const plNfosigw: Source = {
  id: "pl_nfosigw",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const offset = Number(cursor);
    const res = await fetch(LIST_URL, { headers: UA, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${LIST_URL}`);
    const all = parseTable(await res.text());
    if (all.length === 0) throw new Error("NFOŚiGW call schedule holds no rows (changed markup?)");
    const items = all.slice(offset, offset + BATCH);
    const now = new Date().toISOString();
    // Call pages of the gov.pl template only, and only for calls that still run or are planned.
    const wanted = (it: Item) => !!it.link && it.link.startsWith(`${SITE}/web/`) && !((day(it.end, true) ?? "9") < now);
    const details = await mapLimit(items, 2, (it) => (wanted(it) ? detail(it.link as string) : Promise.resolve(null)));
    const grants = items.map((it, i) => normalize(it, details[i] ?? null, wanted(it)));
    return {
      grants,
      raws: items.map((it) => ({ source_id: it.id, payload: it })),
      next: offset + BATCH < all.length ? String(offset + BATCH) : null,
    };
  },
};
