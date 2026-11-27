import type { Grant } from "@grantledger/schema";
import { fetchHtml, fetchJson, mapLimit, num, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Slovakia, Fond na podporu umenia (Slovak Arts Council): the calls of the current programme year from the
// server-rendered table at /sk/vyzvy/ (call number, application window, subprogrammes, status). One call bundles
// several subprogrammes, each with its own purpose, applicants and amounts, so one record is one subprogramme in one
// call; its details come from the subprogramme page (/sk/podpora/<slug>/), read only while the call is open or
// announced. The WordPress REST list (/sk/wp-json/wp/v2/calls) adds the modification time and the call text with the
// submission hour of the last day. The site is behind Cloudflare; robots.txt only disallows /wp-admin/.
const SITE = "https://www.fpu.sk";
const LIST_URL = `${SITE}/sk/vyzvy/`;
const REST_URL = `${SITE}/sk/wp-json/wp/v2/calls?per_page=20&_fields=slug,modified_gmt,content`;
const LICENSE = "Fond na podporu umenia public call information (fpu.sk)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

interface Sub { url: string; number: string; name: string; type: string }
interface Call { slug: string; title: string; window: string; state: string; pdf: string | null; subs: Sub[]; terms: string; modified: string | null }

const clean = (html: string): string => stripHtml(html.replace(/\s+/g, " ")).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();

// Central European wall-clock time as ISO in UTC (UTC+2 from the last Sunday of March to the last Sunday of October).
function cetIso(year: number, month: number, day: number, hour: number, minute: number): string {
  const lastSunday = (m: number) => { const end = new Date(Date.UTC(year, m + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
  const summer = (month > 3 && month < 10) || (month === 3 && day >= lastSunday(2)) || (month === 10 && day < lastSunday(9));
  return new Date(Date.UTC(year, month - 1, day, hour - (summer ? 2 : 1), minute)).toISOString();
}

function parseList(html: string): Call[] {
  const table = html.match(/<table class="table[^"]*">([\s\S]*?)<\/table>/)?.[1] ?? "";
  const calls: Call[] = [];
  for (const row of table.split(/<tr>/).slice(1)) {
    const link = row.match(/<a href="https:\/\/www\.fpu\.sk\/sk\/vyzvy\/([^"/]+)\/?"[^>]*>([^<]+)<\/a>/);
    const cells = row.split(/<td[^>]*>/);
    if (!link || cells.length < 5) continue;
    const subs: Sub[] = [];
    for (const m of row.matchAll(/<a href="(https:\/\/www\.fpu\.sk\/sk\/podpora\/[^"]+)"[^>]*>\s*<span class="mr-2">([^<]*)<\/span>([\s\S]*?)(?:<span class="badge[^>]*>([\s\S]*?)<\/span>\s*)?<\/a>/g)) {
      const number = (m[2] as string).trim();
      if (subs.some((s) => s.number === number)) continue;
      subs.push({ url: m[1] as string, number, name: clean(m[3] as string), type: clean(m[4] ?? "") });
    }
    calls.push({
      slug: link[1] as string,
      title: clean(link[2] as string),
      window: clean(cells[2] as string),
      state: clean(cells.at(-1) as string),
      pdf: row.match(/<a href="(https:\/\/[^"]+\.pdf)"/)?.[1] ?? null,
      subs,
      terms: "",
      modified: null,
    });
  }
  return calls;
}

// "19.10.2026 - 16.11.2026" plus the hour of the last day from the call text ("najneskôr do 15:00 hod.").
function dates(call: Call): { opens: string | null; closes: string | null } {
  const all = [...call.window.matchAll(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/g)];
  const first = all.length > 1 ? all[0] : undefined;
  const last = all.at(-1);
  const hour = call.terms.match(/najneskôr do (\d{1,2})[:.](\d{2})\s*hod/);
  const iso = (m: RegExpMatchArray) => `${m[3]}-${(m[2] as string).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}`;
  return {
    opens: first ? `${iso(first)}T00:00:00.000Z` : null,
    closes: last ? (hour ? cetIso(Number(last[3]), Number(last[2]), Number(last[1]), Number(hour[1]), Number(hour[2])) : `${iso(last)}T23:59:59.000Z`) : null,
  };
}

function status(call: Call, opens: string | null, closes: string | null): Grant["status"] {
  if (closes && closes < new Date().toISOString()) return "closed";
  if (/uzavret|ukončen|zrušen/i.test(call.state)) return "closed";
  if (/priprav|plánovan/i.test(call.state)) return "forthcoming";
  if (/otvoren/i.test(call.state)) return opens && opens > new Date().toISOString() ? "forthcoming" : "open";
  return statusFromDates(opens, closes);
}

function beneficiaryTypes(text: string, type: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/štipendi/i.test(type) || /fyzick(á|é|ej) osob[ay](?! [–-] živnostník)/.test(t)) out.add("individual");
  if (/živnostník|obchodn(á|é) spoločnos/.test(t)) out.add("company");
  if (/občianske združeni|nadáci|neziskov|neinvestičn|cirk/.test(t)) out.add("ngo");
  if (/\bobec\b|vyšší územný celok|rozpočtov|príspevkov/.test(t)) out.add("public_body");
  if (/vysok(á|é) škol/.test(t)) out.add("research_org");
  return [...out];
}

// "1 000 - 60 000 EUR", "do 5 000 EUR", "4 000 EUR".
function amounts(value: string): { min: number | null; max: number | null } {
  const numbers = [...value.matchAll(/\d[\d  ]*/g)].map((m) => num(m[0].replace(/\D/g, ""))).filter((n): n is number => n !== null && n >= 100);
  if (numbers.length === 0) return { min: null, max: null };
  return { min: numbers.length > 1 ? Math.min(...numbers) : null, max: Math.max(...numbers) };
}

function normalize(call: Call, sub: Sub, page: string | null): Grant {
  const { opens, closes } = dates(call);
  const article = page?.match(/<article class="post-type-support"[\s\S]*?<\/article>/)?.[0].replace(/\s+/g, " ") ?? "";
  const boxes = new Map<string, string>();
  for (const m of article.matchAll(/<div class="text-base text-uppercase mb-3">([^<]*)<\/div>\s*<div class="text-primary font-weight-bold">([\s\S]*?)<\/div>/g)) boxes.set(clean(m[1] as string).toLowerCase(), clean(m[2] as string).replace(/\n/g, " "));
  const amount = [...boxes].find(([label]) => label.startsWith("výška"));
  const money = amounts(amount?.[1] ?? "");
  // The body without the heading and the application window box: that box follows the page, not this call.
  const body = clean(
    article
      .replace(/<h1[\s\S]*?<\/h1>/, "")
      .replace(/<div class="text-base text-uppercase mb-3">Odovzdanie žiadosti<\/div>[\s\S]*?(?=<div class="col-md-6 mb-3">)/, "")
      .replace(/<div class="text-base text-uppercase mb-3">([^<]*)<\/div>/g, "<p>$1: "),
  );
  const applicants = body.match(/Oprávnen[^\n]*žiadatelia[\s\S]*?(?=\nDoplňujúce informácie|$)/)?.[0] ?? "";
  const type = sub.type || boxes.get("typ podpory") || "";
  const summary = [
    `Výzva: ${call.title}`,
    `Podprogram: ${sub.number} ${sub.name}`,
    type && `Typ podpory: ${type}`,
    call.window && `Termín predkladania žiadostí: ${call.window}`,
    call.state && `Stav výzvy: ${call.state}`,
    body,
    call.terms && `Podmienky výzvy: ${call.terms}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  const guide = article.match(/<a href="(https:\/\/[^"]+\.pdf)"/)?.[1];
  const sourceId = `${call.slug}-${sub.number}`;
  return {
    id: `sk_fpu:${sourceId}`,
    source: "sk_fpu",
    source_id: sourceId,
    source_url: sub.url,
    source_license: LICENSE,
    title: `${sub.number} ${sub.name} (${call.title})`,
    title_lang: "sk",
    summary,
    funder_name: "Fond na podporu umenia",
    funder_level: "national",
    country: "SK",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(applicants, type),
    sectors: [],
    amount_min: money.min,
    amount_max: money.max,
    budget_total: null,
    currency: "EUR",
    status: status(call, opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: [call.pdf && { title: `${call.title} (PDF)`, url: call.pdf }, guide && guide !== call.pdf && { title: "Zásady a priority podpornej činnosti", url: guide }].filter((d): d is { title: string; url: string } => !!d),
    source_updated_at: call.modified,
  };
}

export const skFpu: Source = {
  id: "sk_fpu",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the table and the REST list; closed calls are emitted from the table alone. After that the cursor
  // is the JSON list of open calls still to read, one call (its subprogramme pages) per fetchPage call.
  async fetchPage(cursor): Promise<Page> {
    if (cursor === "start") {
      const calls = parseList(await fetchHtml(LIST_URL, UA));
      if (calls.length === 0 || calls.every((c) => c.subs.length === 0)) throw new Error("Fond na podporu umenia: no calls in the table at /sk/vyzvy/ (bot challenge or changed markup?)");
      const posts = await fetchJson<{ slug: string; modified_gmt?: string; content?: { rendered?: string } }[]>(REST_URL, { headers: UA });
      for (const call of calls) {
        const post = posts.find((p) => p.slug === call.slug);
        // The call text up to its download button.
        call.terms = clean((post?.content?.rendered ?? "").split(/<a class="file-button/)[0] as string);
        call.modified = toIso(post?.modified_gmt ? `${post.modified_gmt}Z` : null);
      }
      const isCurrent = (c: Call) => { const d = dates(c); return status(c, d.opens, d.closes) !== "closed"; };
      const closed = calls.filter((c) => !isCurrent(c));
      const grants = closed.flatMap((c) => c.subs.map((s) => normalize(c, s, null)));
      const open = calls.filter(isCurrent);
      return { grants, raws: grants.map((g) => ({ source_id: g.source_id, payload: { summary: g.summary } })), next: open.length ? JSON.stringify(open) : null };
    }
    const [call, ...rest] = JSON.parse(cursor) as Call[];
    if (!call) return { grants: [], raws: [], next: null };
    const pages = await mapLimit(call.subs, 2, (s) => fetchHtml(s.url, UA));
    const grants = call.subs.map((s, i) => normalize(call, s, pages[i] ?? null));
    return {
      grants,
      raws: grants.map((g, i) => ({ source_id: g.source_id, payload: { call: { ...call, subs: undefined }, sub: call.subs[i], summary: g.summary } })),
      next: rest.length ? JSON.stringify(rest) : null,
    };
  },
};
