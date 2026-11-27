import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Czechia, Technologická agentura ČR (TA ČR, Technology Agency of the Czech Republic): public competitions and calls
// for applied research funding, including the national side of European partnerships (Eurostars, Water4All, DUT).
// The WordPress REST list /wp-json/wp/v2/call gives title, link, text and modification time, newest first, but no
// dates and no status taxonomy (callProgramme is the only one). The submission window, allocation, maximum grant and
// applicant types sit in the "Základní informace" box of the call page, so every listed call costs one page fetch.
// About 20 calls are published per year out of 180 in the archive: the crawl reads 10 per page and stops at the
// first page that holds no current call and whose posts are all older than one year.
const SITE = "https://tacr.gov.cz";
const LICENSE = "TA ČR public call information (tacr.gov.cz)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PER_PAGE = 10;
const YEAR_MS = 365 * 24 * 3600 * 1000;

interface Row { id: number; date: string; modified_gmt: string; link: string; title: { rendered: string }; content: { rendered: string } }
interface Detail { programme: string; info: Record<string, string>; documents: Grant["documents"] }

const clean = (s: string) => stripHtml(s).replace(/[⁠​]/g, "").replace(/\s+/g, " ").trim();

// "26. 11. 2026", Prague local time.
function czDate(v: string | undefined, time: string): string | null {
  const m = v?.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${time}.000Z` : null;
}

// "10 mil. Kč", "730 000 Kč", "500 000 EUR", "celkem 600 000 €". Only a value that starts with the figure counts:
// "PP1: 15 mil. Kč, PP2: neomezeno" and prose limits are left to the summary.
function money(v: string | undefined): number | null {
  const m = v?.match(/^(?:celkem\s+)?(\d[\d\s]*(?:,\d+)?)\s*(mil\.|mld\.)?\s*(?:Kč|EUR|€)/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * (m[2] ? (/^mil/i.test(m[2]) ? 1e6 : 1e9) : 1)) : null;
}

async function detail(url: string): Promise<Detail> {
  const html = await fetchHtml(url, UA);
  const info: Record<string, string> = {};
  for (const m of html.matchAll(/infobox__label">([\s\S]*?)<\/div>\s*<div class="infobox__(?:big)?value">([\s\S]*?)<\/div>/g)) {
    const label = clean(m[1]!);
    const value = clean(m[2]!);
    if (label && value) info[label] = value;
  }
  const documents: Grant["documents"] = [];
  for (const m of html.matchAll(/<a class="files__item" href="([^"]+)"[\s\S]*?<div class="files__title">([\s\S]*?)<\/div>/g)) {
    const title = clean(m[2]!);
    let url: string;
    try { url = new URL(decodeEntities(m[1]!), SITE).href; } catch { continue; }
    if (title && url.startsWith("https://") && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  const crumbs = [...html.matchAll(/class="breadcrumbs__link"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => clean(m[1]!));
  return { programme: crumbs.at(-1) ?? "", info, documents: documents.slice(0, 40) };
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/mal[ýée]\b|středn|msp/.test(t)) out.add("sme");
  if (/podnik/.test(t)) out.add("company");
  if (/výzkumn/.test(t)) out.add("research_org");
  if (/organizační slož|veřejn[áé] správ|obc[eí]|kraj/.test(t)) out.add("public_body");
  return [...out];
}

function normalize(r: Row, d: Detail): Grant {
  const window = d.info["Lhůta pro podání návrhů projektů"] ?? "";
  const [from, to] = window.split(/\s+-\s+/);
  const opens = czDate(from, "00:00:00");
  const closes = czDate(to, "23:59:00");
  const allocation = d.info["Alokace"];
  const maximum = d.info["Maximální výše podpory na projekt"];
  const name = clean(r.title.rendered);
  // Calls of the European partnerships are all named "Call 2026": the programme name makes the title unique.
  const title = d.programme && !name.toLowerCase().includes(d.programme.replace(/^Program\s+/, "").toLowerCase()) ? `${d.programme}: ${name}` : name;
  const text = stripHtml(r.content.rendered).replace(/[⁠​]/g, "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return {
    id: `cz_tacr:${r.id}`,
    source: "cz_tacr",
    source_id: String(r.id),
    source_url: r.link,
    source_license: LICENSE,
    title,
    title_lang: "cs",
    summary: [d.programme ? `Program: ${d.programme}` : "", ...Object.entries(d.info).map(([k, v]) => `${k}: ${v}`), text].filter(Boolean).join("\n").slice(0, 20000) || null,
    funder_name: "Technologická agentura ČR",
    funder_level: "national",
    country: "CZ",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(d.info["Uchazeči"] ?? ""),
    sectors: [],
    amount_min: null,
    amount_max: money(maximum),
    budget_total: money(allocation),
    currency: /EUR|€/.test(`${allocation ?? ""} ${maximum ?? ""}`) && !/Kč/.test(`${allocation ?? ""} ${maximum ?? ""}`) ? "EUR" : "CZK",
    status: statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: d.documents,
    source_updated_at: toIso(`${r.modified_gmt}Z`),
  };
}

export const czTacr: Source = {
  id: "cz_tacr",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const url = `${SITE}/wp-json/wp/v2/call?per_page=${PER_PAGE}&page=${page}&_fields=id,date,modified_gmt,link,title,content`;
    const res = await fetch(url, { headers: { ...UA, accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for TA ČR call list (page ${page})`);
    const rows = ((await res.json()) as Row[]).filter((r) => r.id && r.link?.startsWith("https://"));
    if (page === 1 && rows.length === 0) throw new Error("TA ČR call list returned no calls");
    const details = await mapLimit(rows, 2, (r) => detail(r.link));
    const grants = rows.map((r, i) => normalize(r, details[i]!));
    const current = grants.some((g) => g.status === "open" || g.status === "forthcoming");
    const recent = rows.some((r) => Date.now() - new Date(`${r.date}Z`).getTime() < YEAR_MS);
    const more = page < Number(res.headers.get("x-wp-totalpages") ?? 0) && (current || recent);
    return {
      grants,
      raws: rows.map((r, i) => ({ source_id: String(r.id), payload: { id: r.id, date: r.date, modified_gmt: r.modified_gmt, link: r.link, title: r.title.rendered, programme: details[i]!.programme, info: details[i]!.info } })),
      next: more ? String(page + 1) : null,
    };
  },
};
