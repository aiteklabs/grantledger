import type { Grant } from "@grantledger/schema";
import { decodeEntities, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Norway, Regionale forskningsfond (regional research funds, RFF): eleven county funds that pay for research
// projects and for the FORREGION pre-projects that bring companies and the public sector into research. Each fund
// has a sub-site on regionaleforskningsfond.no with its own calls page, served by the same search API as
// forskningsradet.no (see no-forskningsradet.ts): POST /api/v1/search/proposal/no/<page id> with timeframe 0
// (current) or 1 (completed). The page id is read from the calls page of the fund on every crawl; the path of that
// page differs per fund and is listed below. One fund per fetchPage call: the calls page, both lists, then the call
// page of each current call (target groups, limits, full text, templates). Completed calls come from the list alone.
// Call ids are unique across the funds (219 calls checked on 2026-11-14). Regions are NUTS 2021 codes: the funds
// follow the 2020 county map (Viken, Vestfold og Telemark, Troms og Finnmark).
const SITE = "https://www.regionaleforskningsfond.no";
const LICENSE = "Regionale forskningsfond public call information (regionaleforskningsfond.no)";
const UA = "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)";
const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

const FUNDS = [
  { name: "RFF Agder", path: "/fondsregion-agder/utlysninger/", nuts: "NO092", lang: "no" },
  { name: "RFF Arktis", path: "/rff-arktis/rffarktis/utlysninger-listeside/", nuts: "NO074", lang: "no" },
  { name: "RFF Innlandet", path: "/innlandet/utlysninger/", nuts: "NO020", lang: "no" },
  { name: "RFF Møre og Romsdal", path: "/more-og-romsdal/sok-om-finansiering/alle-utlysingar/", nuts: "NO0A3", lang: "nn" },
  { name: "RFF Nordland", path: "/rff-nordland/rffnordland/utlysninger-listeside/", nuts: "NO071", lang: "no" },
  { name: "RFF Oslo", path: "/Oslo/sok-om-finansiering/utlysninger/", nuts: "NO081", lang: "no" },
  { name: "RFF Rogaland", path: "/rogaland/sok-om-finansiering/utlysninger/", nuts: "NO0A1", lang: "no" },
  { name: "RFF Trøndelag", path: "/trondelag/sok-om-finansiering/utlysninger2/", nuts: "NO060", lang: "no" },
  { name: "RFF Vestfold og Telemark", path: "/rff-vestfold/utlysninger-liste/", nuts: "NO091", lang: "no" },
  { name: "RFF Vestland", path: "/vestland/utlysingar/", nuts: "NO0A2", lang: "nn" },
  { name: "RFF Viken", path: "/viken/utlysninger-liste/", nuts: "NO082", lang: "no" },
] as const;
type Fund = (typeof FUNDS)[number];

interface Proposal {
  id: string;
  dateLabel?: string;
  date?: string;
  year?: string;
  metadata?: { items?: { label?: string; text?: string }[] };
  status?: { text?: string };
  tags?: { list?: string[] };
  text?: string;
  title: string;
  url: string;
}
interface Response { groups?: { title?: string; proposals?: Proposal[] }[] }

interface Detail { meta: { label: string; value: string }[]; body: string; documents: Grant["documents"]; updated: string | null }

async function get(url: string, init?: RequestInit): Promise<globalThis.Response> {
  const res = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init?.headers ?? {}) }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

// "12.03.2027", "12. mars 2027" or "12. mar" with the year in a field of its own; completed calls carry the full
// date in the year field.
function isoNo(date: string | undefined, year: string | undefined, time: string): string | null {
  for (const value of [date, year]) {
    const m = value?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return `${m[3]}-${(m[2] as string).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}T${time}.000Z`;
  }
  const m = date?.match(/(\d{1,2})\.?\s*([a-zæøå]{3})[a-zæøå]*\.?\s*(\d{4})?/i);
  const month = m ? MONTHS.indexOf((m[2] as string).toLowerCase()) + 1 : 0;
  const y = m?.[3] ?? year?.match(/^\d{4}$/)?.[0];
  return m && month && y ? `${y}-${String(month).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}T${time}.000Z` : null;
}

function parseDetail(html: string): Detail {
  const start = html.indexOf("<main");
  // The print footer ("Meldinger ved utskriftstidspunkt <now>") changes on every request and is cut off.
  const ends = ['<div class="message-global-list', "</main>"].map((k) => html.indexOf(k, start)).filter((i) => i !== -1);
  const main = html.slice(start === -1 ? 0 : start, ends.length ? Math.min(...ends) : undefined);
  const clean = (part: string | undefined) => stripHtml(part ?? "").replace(/[\u00a0\r]/g, " ").replace(/\s+/g, " ").trim();
  const meta = [...main.matchAll(/<span class="proposal-data--label">([\s\S]*?)<\/span><span class="proposal-data--value">([\s\S]*?)<\/span><\/div>/g)].map((m) => ({ label: clean(m[1]), value: clean(m[2]) })).filter((p) => p.label && p.value);
  const bodyStart = main.indexOf('proposal-page--description');
  const body = bodyStart === -1 ? "" : stripHtml(main.slice(main.lastIndexOf("<div", bodyStart)).replace(/<aside class="content-with-sidebar--sidebar">[\s\S]*?<\/aside>/g, "")).replace(/[\u00a0\r]/g, " ").replace(/[ \t]*\n\s*/g, "\n").trim();
  const documents: Grant["documents"] = [];
  for (const m of main.matchAll(/<a[^>]+href="(\/[^"]+\.(?:pdf|docx?|xlsx?|pptx?))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = `${SITE}${decodeEntities(m[1] as string)}`;
    const title = clean((m[2] as string).match(/download-list--item-text-name">([\s\S]*?)<\/div>/)?.[1] ?? (m[2] as string));
    if (title && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  const updated = clean(main).match(/Oppdatert (\d{1,2}\. [a-zæøå]{3,}\.? \d{4})/)?.[1];
  return { meta, body, documents, updated: isoNo(updated, undefined, "00:00:00") };
}

function nok(text: string | undefined): number[] {
  return [...(text ?? "").matchAll(/(\d[\d\s\u00a0]{3,})/g)].map((m) => num((m[1] as string).replace(/[\s\u00a0]/g, ""))).filter((n): n is number => n !== null);
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out: Grant["beneficiary_types"] = [];
  if (/næringsliv|bedrift|verksemd|føretak|foretak/.test(t)) out.push("company", "sme");
  if (/forskningsorganisasjon|forskingsorganisasjon|forskningsinstitu|universitet|høgskole|høyskole/.test(t)) out.push("research_org");
  if (/offentlig sektor|offentleg sektor|kommune|fylkeskommune/.test(t)) out.push("public_body");
  if (/frivillig|organisasjoner|organisasjonar/.test(t)) out.push("ngo");
  return out;
}

function normalize(fund: Fund, p: Proposal, completed: boolean, d: Detail | null): Grant {
  const items = d?.meta.length ? d.meta.map((m) => ({ label: m.label, text: m.value })) : (p.metadata?.items ?? []);
  const item = (re: RegExp) => items.find((i) => re.test(i.label ?? ""))?.text;
  const limits = nok(item(/Støttegrense/i));
  const closes = isoNo(p.date, p.year, "23:59:59");
  const rolling = /løpende|løpande/i.test(p.date ?? "");
  const label = p.status?.text ?? "";
  const status: Grant["status"] = completed || /Gjennomført|Stengt|Avlyst|Lukket/i.test(label) ? "closed" : /Planlagt|Kommende|Kommande/i.test(label) ? "forthcoming" : /Søk nå/i.test(label) || rolling ? "open" : statusFromDates(null, closes);
  const summary = [
    stripHtml(p.text ?? ""),
    `Fond: ${fund.name}`,
    label && `Status: ${label}`,
    !item(/Søknadsfrist/i) && p.date && `${p.dateLabel || "Søknadsfrist"}: ${p.date}`,
    ...items.map((i) => `${i.label}: ${i.text}`),
    p.tags?.list?.length ? `Tema: ${p.tags.list.join(", ")}` : "",
    d?.body,
  ].filter(Boolean).join("\n").slice(0, 20000);
  return {
    id: `no_regionale_forskningsfond:${p.id}`,
    source: "no_regionale_forskningsfond",
    source_id: p.id,
    source_url: p.url.startsWith("http") ? p.url : `${SITE}${p.url}`,
    source_license: LICENSE,
    title: stripHtml(p.title),
    title_lang: fund.lang,
    summary,
    funder_name: `Regionale forskningsfond (${fund.name})`,
    funder_level: "regional",
    country: "NO",
    regions: [fund.nuts],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(`${item(/Målgruppe/i) ?? ""} ${p.title}`),
    sectors: [],
    amount_min: limits.length > 1 ? Math.min(...limits) : null,
    amount_max: limits.length ? Math.max(...limits) : null,
    budget_total: nok(item(/midler|midlar/i))[0] ?? null,
    currency: "NOK",
    status,
    opens_at: null,
    // A completed call that was rolling keeps "Løpende" as its date; its year field then holds the day it ended.
    closes_at: rolling && !completed ? null : closes,
    documents: d?.documents ?? [],
    source_updated_at: d?.updated ?? null,
  };
}

export const noRegionaleForskningsfond: Source = {
  id: "no_regionale_forskningsfond",
  license: LICENSE,
  start() {
    return "0";
  },
  // The cursor is the index of the fund.
  async fetchPage(cursor): Promise<Page> {
    const index = Number(cursor);
    const fund = FUNDS[index];
    if (!fund) return { grants: [], raws: [], next: null };
    const listHtml = await (await get(`${SITE}${fund.path}`)).text();
    const api = listHtml.match(/\/?api\/v1\/search\/proposal\/no\/\d+/)?.[0];
    if (!api) throw new Error(`${fund.name}: the calls page ${fund.path} no longer names the search API (moved or changed?)`);
    const lists: Proposal[][] = [];
    for (const timeframe of [0, 1]) {
      const res = await get(`${SITE}/${api.replace(/^\//, "")}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeframe, subjects: [], targetGroups: [], deadlineTypes: [], applicationTypes: [] }),
      });
      const data = (await res.json().catch(() => null)) as Response | null;
      if (!data || !Array.isArray(data.groups)) throw new Error(`${fund.name}: the search API did not answer JSON (timeframe ${timeframe})`);
      lists.push(data.groups.flatMap((g) => g.proposals ?? []).filter((p) => p.id && p.title && p.url));
    }
    const current = lists[0] as Proposal[];
    const seen = new Set(current.map((p) => p.id));
    const completed = (lists[1] as Proposal[]).filter((p) => !seen.has(p.id) && Boolean(seen.add(p.id)));
    if (current.length + completed.length === 0) throw new Error(`${fund.name}: the search API lists no calls at all (changed?)`);
    const details = await mapLimit(current, 2, async (p) => parseDetail(await (await get(p.url.startsWith("http") ? p.url : `${SITE}${p.url}`)).text()));
    return {
      grants: [...current.map((p, i) => normalize(fund, p, false, details[i] ?? null)), ...completed.map((p) => normalize(fund, p, true, null))],
      raws: [...current.map((p, i) => ({ source_id: p.id, payload: { fund: fund.name, proposal: p, detail: details[i] ?? null } })), ...completed.map((p) => ({ source_id: p.id, payload: { fund: fund.name, proposal: p } }))],
      next: index + 1 < FUNDS.length ? String(index + 1) : null,
    };
  },
};
