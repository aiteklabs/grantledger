import type { Grant } from "@grantledger/schema";
import { mapLimit, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Sweden, Formas (research council for sustainable development): calls for proposals ("utlysningar").
// The list page is a Vue app over a Sitevision portlet route (?sv.target=...&query=...), and robots.txt disallows
// both of those query parameters. The sitemap (named in robots.txt, a gzip file) lists every call page as
// /soka-finansiering/alla-utlysningar/utlysningar/<publication date>-<slug>.html, and each call page is
// server-rendered with a status box (Kommande, Öppen, Stängd, Beslutad) and the opening and closing times.
// So: the sitemap once per crawl, then BATCH call pages per fetchPage. Only calls published in the last 18 months
// are read: on 2026-11-14 every open or upcoming call was under five months old, and older ones are decided.
const SITE = "https://formas.se";
const SITEMAP_INDEX = `${SITE}/sitemapindex.xml`;
const CALL_PATH = /^https:\/\/formas\.se\/soka-finansiering\/alla-utlysningar\/utlysningar\/((\d{4}-\d{2}-\d{2})-[^/<]+)\.html$/;
const LICENSE = "Formas public call information (formas.se)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "text/html,application/xhtml+xml,application/xml", "accept-language": "sv-SE,sv;q=0.9,en;q=0.8" };
const MAX_AGE_MONTHS = 18;
const BATCH = 12;
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

interface Detail { title: string; label: string; opens: string | null; closes: string | null; box: string; body: string; documents: Grant["documents"] }

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

// The sitemap files are served as application/x-gzip without a content encoding, so they are inflated here.
async function sitemapText(url: string): Promise<string> {
  const buf = new Uint8Array(await (await get(url)).arrayBuffer());
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return new TextDecoder().decode(buf);
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

// Slugs of the calls published in the last MAX_AGE_MONTHS, newest first.
async function listCalls(): Promise<string[]> {
  const index = await (await get(SITEMAP_INDEX)).text();
  const files = [...index.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1] as string);
  if (files.length === 0) throw new Error("Formas sitemap index lists no sitemap files (layout change?)");
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - MAX_AGE_MONTHS);
  const from = cutoff.toISOString().slice(0, 10);
  const slugs = new Set<string>();
  for (const file of files) {
    for (const m of (await sitemapText(file)).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const call = (m[1] as string).match(CALL_PATH);
      if (call && (call[2] as string) >= from) slugs.add(call[1] as string);
    }
  }
  return [...slugs].sort().reverse();
}

// "2027-01-14 14:00" or "2027-01-14" in Swedish local time, stored as wall-clock time with a Z suffix.
function seTime(text: string | undefined, fallbackTime: string): string | null {
  const m = text?.match(/(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? `${m[1]}T${m[2] ? `${m[2]}:${m[3]}:00` : fallbackTime}.000Z` : null;
}

function parseDetail(html: string): Detail | null {
  const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/\s+/g, " ");
  const start = html.indexOf("<h1");
  if (!title || start === -1) return null;
  const endMarks = ['<div id="Relateradinformation">', '<div id="Kontakter">', '<div id="Delasidan">', "<footer"].map((k) => html.indexOf(k, start)).filter((i) => i !== -1);
  const main = html.slice(start, endMarks.length ? Math.min(...endMarks) : undefined).replace(/<span class="env-assistive-text">[\s\S]*?<\/span>/g, "");
  // The status box: "Öppen: 61 dagar kvar. Sök senast: 2027-01-14 14:00", "Kommande: Öppnar för ansökningar: ...",
  // "Stängd: Beslutsdatum: ...", "Beslutad: ...". Its day counter changes daily, so the box stays out of the text.
  const boxStart = main.indexOf('<div class="sol-call-date">');
  const boxEnd = boxStart === -1 ? -1 : main.indexOf('<div id="Innehall">', boxStart);
  const status = boxStart === -1 ? "" : stripHtml(main.slice(boxStart, boxEnd === -1 ? boxStart + 2000 : boxEnd)).replace(/\s+/g, " ");
  const label = status.match(/^(Öppen|Kommande|Stängd|Beslutad)/)?.[1] ?? "";
  const text = (part: string) => stripHtml(part).replace(/\u00a0/g, " ").replace(/\n\s*\n/g, "\n\n").replace(/\d+\s*;?\s*dagar? kvar\.?/g, "").trim();
  const header = boxStart === -1 ? main : main.slice(0, boxStart);
  const box = text(header.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, ""));
  const body = text(boxEnd === -1 ? "" : main.slice(boxEnd));
  // The "Viktiga datum" list in the body is typed by hand ("2026-09-29 kl. 14:00", "29 september 2026, kl. 14.00",
  // or the placeholder "20XX-XX-XX" on a new call), so the status box wins and the list only adds the opening time.
  const listed = body.match(/Utlysningen öppnar:\s*(?:(\d{4}-\d{2}-\d{2})|(\d{1,2}) ([a-zåäö]+) (\d{4}))(?:,?\s*kl\.?\s*(\d{2})[:.](\d{2}))?/);
  const month = listed?.[3] ? MONTHS.indexOf(listed[3]) + 1 : 0;
  const listedDay = listed?.[1] ?? (month ? `${listed?.[4]}-${String(month).padStart(2, "0")}-${listed?.[2]?.padStart(2, "0")}` : null);
  const opens = seTime(status.match(/Öppnar för ansökningar:\s*([\d\- :]+)/)?.[1], "00:00:00") ?? (listedDay ? `${listedDay}T${listed?.[5] ? `${listed[5]}:${listed[6]}:00` : "00:00:00"}.000Z` : null);
  // A closed call no longer shows its deadline in the status box; the hand-typed list often still has it.
  const closes = seTime(status.match(/(?:Sök senast|Sista ansökningsdatum):\s*([\d\- :]+)/)?.[1], "23:59:59") ?? seTime(body.match(/Sista ansökningsdatum:\s*(\d{4}-\d{2}-\d{2}(?:\s*kl\.?\s*\d{2}:\d{2})?)/)?.[1]?.replace(/\s*kl\.?\s*/, " "), "23:59:59");
  const documents: Grant["documents"] = [];
  for (const m of main.matchAll(/<a[^>]+href="((?:https:\/\/formas\.se)?\/download\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = (m[1] as string).startsWith("/") ? `${SITE}${m[1]}` : (m[1] as string);
    const name = stripHtml(m[2] as string).replace(/\s+/g, " ");
    if (name && !documents.some((d) => d.url === url)) documents.push({ title: name, url });
  }
  return { title, label, opens, closes, box, body, documents };
}

// The amount box: "maximalt 3 miljoner kronor", "1-4 miljoner kronor", "mellan 1 och 2 miljoner kronor", "Maximalt
// 500 000 kronor". The largest amount in kronor is the ceiling per project; a single range also gives the floor.
// Amounts in euro (joint European calls) are left to the text.
function amounts(box: string): { min: number | null; max: number | null } {
  const part = box.match(/HUR MYCKET[^\n]*\n([\s\S]*)$/)?.[1] ?? "";
  const million = (n: string) => Math.round(Number(n.replace(",", ".")) * 1_000_000);
  const ranges = [...part.matchAll(/(\d+(?:,\d+)?)\s*(?:-|–|och|till)\s*(\d+(?:,\d+)?)\s+miljon(?:er)?\s+(?:svenska\s+)?kronor/g)].map((m) => [million(m[1] as string), million(m[2] as string)] as const);
  const values = [
    ...ranges.map((r) => r[1]),
    ...[...part.matchAll(/(\d+(?:,\d+)?)\s+miljon(?:er)?\s+(?:svenska\s+)?kronor/g)].map((m) => million(m[1] as string)),
    ...[...part.matchAll(/(\d{1,3}(?:[ \u00a0]\d{3})+)\s+(?:svenska\s+)?kronor/g)].map((m) => Number((m[1] as string).replace(/[ \u00a0]/g, ""))),
  ];
  const single = ranges.length === 1 && values.every((v) => v === ranges[0]![1]);
  return { min: single ? ranges[0]![0] : null, max: values.length ? Math.max(...values) : null };
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out: Grant["beneficiary_types"] = [];
  if (/forskare|universitet|högskol|forskningsinstitut|forskningsorganisation|disputera/.test(t)) out.push("research_org");
  if (/företag|näringsliv/.test(t)) out.push("company");
  if (/små och medelstora/.test(t)) out.push("sme");
  if (/kommun|region|offentlig|myndighet/.test(t)) out.push("public_body");
  if (/civilsamhälle|ideell/.test(t)) out.push("ngo");
  return out;
}

function normalize(slug: string, d: Detail): Grant {
  const status: Grant["status"] = d.label === "Öppen" ? "open" : d.label === "Kommande" ? "forthcoming" : d.label ? "closed" : statusFromDates(d.opens, d.closes);
  const who = d.box.match(/(?:VILKA|VEM) KAN SÖKA[^\n]*\n([\s\S]*?)(?=\n[^\n]*HUR MYCKET|$)/)?.[1] ?? "";
  const money = amounts(d.box);
  const summary = [
    d.label && `Status: ${d.label}`,
    d.opens && `Utlysningen öppnar: ${d.opens.slice(0, 16).replace("T", " ")}`,
    d.closes && `Sista ansökningsdatum: ${d.closes.slice(0, 16).replace("T", " ")}`,
    d.box,
    d.body,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `se_formas:${slug}`,
    source: "se_formas",
    source_id: slug,
    source_url: `${SITE}/soka-finansiering/alla-utlysningar/utlysningar/${slug}.html`,
    source_license: LICENSE,
    title: d.title,
    title_lang: "sv",
    summary: summary || null,
    funder_name: "Formas",
    funder_level: "national",
    country: "SE",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(who),
    sectors: [],
    amount_min: money.min,
    amount_max: money.max,
    budget_total: null,
    currency: "SEK",
    status,
    opens_at: d.opens,
    closes_at: d.closes,
    documents: d.documents,
    source_updated_at: null,
  };
}

export const seFormas: Source = {
  id: "se_formas",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the sitemap is read once; after that the cursor is the JSON list of call slugs still to read.
  async fetchPage(cursor): Promise<Page> {
    const slugs = cursor === "start" ? await listCalls() : (JSON.parse(cursor) as string[]);
    if (cursor === "start" && slugs.length === 0) throw new Error("Formas sitemap lists no recent call pages (layout change?)");
    const batch = slugs.slice(0, BATCH);
    const details = await mapLimit(batch, 2, async (slug) => parseDetail(await (await get(`${SITE}/soka-finansiering/alla-utlysningar/utlysningar/${slug}.html`)).text()));
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    batch.forEach((slug, i) => {
      const d = details[i];
      if (!d) return;
      grants.push(normalize(slug, d));
      raws.push({ source_id: slug, payload: d });
    });
    if (cursor === "start" && grants.length === 0) throw new Error("Formas call pages hold no title (layout change?)");
    const rest = slugs.slice(BATCH);
    return { grants, raws, next: rest.length ? JSON.stringify(rest) : null };
  },
};
