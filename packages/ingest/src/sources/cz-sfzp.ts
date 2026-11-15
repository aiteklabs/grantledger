import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Czechia, Státní fond životního prostředí ČR (SFŽP, State Environmental Fund): the currently offered calls of two
// programmes it runs, each on its own site with the same theme: Národní program Životní prostředí
// (narodniprogramzp.cz/nabidka-dotaci/) and Modernizační fond (sfzp.gov.cz/dotace-a-pujcky/modernizacni-fond/vyzvy/).
// The list page is server-rendered with the "currently offered" filter on: title, publication date, application
// window, allocation and a teaser per card, 10 cards at most. When a page is full, the theme's own "load more" script
// (the POST endpoint the page itself calls) is asked for the following cards. Each card links to a detail page with
// what is funded, who can apply, rates, deadlines and the call documents. Closed calls sit in the archive filter and
// are not read.
const LICENSE = "SFŽP ČR public call information (narodniprogramzp.cz, sfzp.gov.cz)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const SITES = [
  { key: "npzp", programme: "Národní program Životní prostředí", list: "https://www.narodniprogramzp.cz/nabidka-dotaci/", more: "https://www.narodniprogramzp.cz/wp-content/themes/npzp_theme/scripts/challenges.php", filter: "areaId" },
  { key: "modf", programme: "Modernizační fond", list: "https://sfzp.gov.cz/dotace-a-pujcky/modernizacni-fond/vyzvy/", more: "https://sfzp.gov.cz/wp-content/themes/sfzp_theme/scripts/modFond.php", filter: "programmeId" },
] as const;
const PER_LIST = 10;
const MAX_MORE = 5;

interface Cursor { site: number; offset: number }
interface Card { id: string; title: string; published: string; window: string; allocation: string; teaser: string }
interface Detail { text: string; applicants: string; documents: Grant["documents"] }

const clean = (s: string) => stripHtml(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();

function parseCards(html: string): Card[] {
  const out: Card[] = [];
  for (const block of html.split('<div class="row news__row">').slice(1)) {
    const head = block.match(/href="[^"]*detail-vyzvy\/\?id=(\d+)" class="news__title[^"]*">([\s\S]*?)<\/a>/);
    if (!head) continue;
    out.push({
      id: head[1]!,
      title: clean(head[2]!),
      published: clean(block.match(/fa-clock-o[\s\S]*?<span>([\s\S]*?)<\/span>/)?.[1] ?? ""),
      window: clean(block.match(/Příjem žádostí:<\/span><span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ""),
      allocation: clean(block.match(/Alokace:\s*<\/span><span>([\s\S]*?)<\/span>/)?.[1] ?? "").replace(/&nbsp/g, " ").replace(/\s+/g, " "),
      teaser: clean(block.match(/news__content[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? ""),
    });
  }
  return out;
}

async function list(site: (typeof SITES)[number]): Promise<Card[]> {
  const html = await fetchHtml(site.list, UA);
  if (!html.includes('id="challenges"')) throw new Error(`SFŽP ${site.programme}: the call list is missing from ${site.list} (layout change?)`);
  const cards = parseCards(html);
  // A full first page: ask the theme's load-more script for the next cards until it answers with an empty string.
  for (let page = 1; cards.length === page * PER_LIST && page <= MAX_MORE; page++) {
    const res = await fetch(site.more, {
      method: "POST",
      headers: { ...UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" },
      body: `applicantId=-1&${site.filter}=-1&currentOnly=true&searchName=&offset=${page}&limit=${PER_LIST}`,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${site.more}`);
    const more = (await res.json()) as unknown;
    if (typeof more !== "string" || !more.trim()) break;
    const seen = new Set(cards.map((c) => c.id));
    cards.push(...parseCards(more).filter((c) => !seen.has(c.id)));
  }
  return cards;
}

async function detail(url: string): Promise<Detail> {
  const html = await fetchHtml(url, UA);
  const from = html.indexOf('class="challenge__description"');
  const body = from < 0 ? "" : html.slice(html.indexOf(">", from) + 1, html.indexOf("<!-- Container end -->", from));
  const [main = "", files = ""] = body.split(/<h2>\s*Dokumenty ke stažení\s*<\/h2>/);
  const documents: Grant["documents"] = [];
  // "<li><a href=document record>Title</a> <a href=file>(stáhnout)</a></li>": the file link is the document.
  for (const m of files.matchAll(/<li>\s*<a href="[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<a href="([^"]+)"/g)) {
    const title = clean(m[1]!);
    let file: string;
    try { file = new URL(decodeEntities(m[2]!)).href; } catch { continue; }
    if (title && file.startsWith("https://")) documents.push({ title, url: file });
  }
  return {
    text: stripHtml(main).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim(),
    applicants: clean(main.match(/<h2>\s*Kdo může žádat\s*<\/h2>([\s\S]*?)(?:<h2>|$)/)?.[1] ?? ""),
    documents: documents.slice(0, 40),
  };
}

// "25.5.2026", Prague local time.
function czDate(v: string | undefined, time: string): string | null {
  const m = v?.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${time}:00.000Z` : null;
}

// The card gives the day; the detail text often adds the hour ("Ukončení příjmu žádostí: 30. listopadu 2026, 12:00 hod.").
function hour(text: string, label: string, fallback: string): string {
  const m = text.match(new RegExp(`${label}[^\\n]{0,60}?(\\d{1,2})[:.](\\d{2})\\s*hod`));
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : fallback;
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/obc[eí]|obcí|měst|kraj|svazk|příspěvkov|organizační slož|státní|veřejnoprávní|správ[aueě]/.test(t)) out.add("public_body");
  if (/podnik|obchodní společnost|právnick|provozovatel|vlastní[kc]|společenství/.test(t)) out.add("company");
  if (/fyzick[áé] osob|občan|domácnost/.test(t)) out.add("individual");
  if (/neziskov|spol[ek]|nadac|církv|obecně prospěšn|ústav/.test(t)) out.add("ngo");
  if (/výzkumn|vysok[áé] škol/.test(t)) out.add("research_org");
  return [...out];
}

function normalize(site: (typeof SITES)[number], c: Card, d: Detail): Grant {
  const [from, to] = c.window.split(/\s+-\s+/);
  const opens = czDate(from, hour(d.text, "Zahájení příjmu žádostí", "00:00"));
  const closes = czDate(to, hour(d.text, "Ukončení příjmu žádostí", "23:59"));
  // The list only holds calls the fund currently offers: one without dates is a rolling call.
  const status = opens || closes ? statusFromDates(opens, closes) : "open";
  return {
    id: `cz_sfzp:${site.key}-${c.id}`,
    source: "cz_sfzp",
    source_id: `${site.key}-${c.id}`,
    source_url: `${site.list}detail-vyzvy/?id=${c.id}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: "cs",
    summary: [
      `Program: ${site.programme}`,
      c.published ? `Zveřejněno: ${c.published}` : "",
      c.window ? `Příjem žádostí: ${c.window}` : "",
      c.allocation ? `Alokace: ${c.allocation}` : "",
      c.teaser,
      d.text,
    ].filter(Boolean).join("\n").slice(0, 20000),
    funder_name: "Státní fond životního prostředí ČR",
    funder_level: "national",
    country: "CZ",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(d.applicants),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: /Kč/.test(c.allocation) ? num(c.allocation.replace(/\s/g, "")) : null,
    currency: "CZK",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: d.documents,
    source_updated_at: null,
  };
}

export const czSfzp: Source = {
  id: "cz_sfzp",
  license: LICENSE,
  start() {
    return JSON.stringify({ site: 0, offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const site = SITES[c.site]!;
    const cards = await list(site);
    if (c.site === 0 && cards.length === 0) throw new Error(`SFŽP ${site.programme}: the call list holds no cards (layout change?)`);
    const slice = cards.slice(c.offset, c.offset + PER_LIST);
    const details = await mapLimit(slice, 2, (card) => detail(`${site.list}detail-vyzvy/?id=${card.id}`));
    const next: Cursor | null = c.offset + PER_LIST < cards.length ? { site: c.site, offset: c.offset + PER_LIST } : c.site + 1 < SITES.length ? { site: c.site + 1, offset: 0 } : null;
    return {
      grants: slice.map((card, i) => normalize(site, card, details[i]!)),
      raws: slice.map((card, i) => ({ source_id: `${site.key}-${card.id}`, payload: { card, text: details[i]!.text } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
