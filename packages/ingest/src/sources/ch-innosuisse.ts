import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Switzerland, Innosuisse (Swiss Innovation Agency): the current calls for projects, national (Flagship, Innovation
// Booster, Quantum) and international (Eureka, Eurostars, Innowwide, bilateral calls). The page "Calls for projects
// and applications" is server-rendered (Nuxt): one card per call with the publication date, title and teaser. The
// call page holds the text, the schedule table and the downloads, but the table is only drawn in the browser, so
// the page content is read from the Nuxt payload embedded in the HTML (script __NUXT_DATA__, devalue format) rather
// than from the markup. About ten calls: one list request and one request per call. Left out: the "Calls for
// applications" block (expert recruitment) and event announcements. robots.txt allows everything, no crawl delay.
const SITE = "https://www.innosuisse.admin.ch";
const LIST_URL = `${SITE}/en/calls-for-projects-and-applications`;
const LICENSE = "Innosuisse public call information (innosuisse.admin.ch, Swiss Confederation)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;

interface Card { slug: string; path: string; title: string; teaser: string; published: string }
interface Block { identifier?: string; properties?: Record<string, unknown> | null; nestedContent?: Block[] | null }
interface Doc { updatedAt?: string; content?: Block[] }
interface Detail { lines: string[]; rows: string[]; documents: Grant["documents"]; updated: string | null }

const plain = (html: unknown) => (typeof html === "string" ? stripHtml(html).replace(/\s+/g, " ").trim() : "");

// Nuxt serializes payloads with devalue: a flat array where objects and arrays hold indexes into that array.
function hydrate(nodes: unknown[]): unknown {
  const cache = new Map<number, unknown>();
  const get = (i: number): unknown => {
    if (i < 0) return undefined;
    if (cache.has(i)) return cache.get(i);
    const n = nodes[i];
    if (Array.isArray(n)) {
      if (typeof n[0] === "string" && /^(ShallowReactive|Reactive|Ref|ShallowRef)$/.test(n[0])) {
        const v = get(n[1] as number);
        cache.set(i, v);
        return v;
      }
      if (typeof n[0] === "string") {
        cache.set(i, null);
        return null;
      }
      const arr: unknown[] = [];
      cache.set(i, arr);
      for (const j of n as number[]) arr.push(get(j));
      return arr;
    }
    if (n && typeof n === "object") {
      const o: Record<string, unknown> = {};
      cache.set(i, o);
      for (const [k, j] of Object.entries(n as Record<string, number>)) o[k] = get(j);
      return o;
    }
    cache.set(i, n);
    return n;
  };
  return get(0);
}

// The server answers an occasional HTTP 500 that the next request does not repeat: up to three attempts.
async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchHtml(url, UA);
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function parseList(html: string): Card[] {
  const from = html.indexOf('id="Calls-for-projects"');
  if (from === -1) return [];
  const to = html.indexOf('id="Calls-for-applications"', from);
  const cards: Card[] = [];
  for (const chunk of html.slice(from, to === -1 ? html.length : to).split('class="card card--default').slice(1)) {
    const path = chunk.match(/href="(\/en\/[^"#?]+)"/)?.[1];
    const title = plain(chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]);
    if (!path || !title || /online sessions?|webinar|information event/i.test(title)) continue;
    cards.push({ slug: path.replace(/^\/en\//, "").replace(/\/+$/, ""), path, title, teaser: plain(chunk.match(/card__description">([\s\S]*?)<\/div>/)?.[1]), published: plain(chunk.match(/meta-info__item">([^<]*)</)?.[1]) });
  }
  return cards;
}

// The content tree of a call page as text lines, with the table rows (schedule) and the downloads kept apart.
function walk(blocks: Block[] | null | undefined, out: Detail): void {
  for (const b of blocks ?? []) {
    const p = b.properties ?? {};
    const id = b.identifier ?? "";
    if (id === "title" || id.startsWith("teaser")) continue;
    if (id === "p" || id === "image") {
      const text = plain(p.text);
      if (text) out.lines.push(text);
    } else if (id.startsWith("heading-")) {
      if (plain(p.label)) out.lines.push("", `${plain(p.label)}:`);
    } else if (id === "accordion-item") {
      const title = plain((p.accordionItems as { title?: string } | undefined)?.title);
      if (title) out.lines.push("", `${title}:`);
    } else if (id === "list") {
      for (const item of (p.listItems as { text?: string }[] | undefined) ?? []) if (plain(item.text)) out.lines.push(`- ${plain(item.text)}`);
    } else if (id === "table") {
      const header = ((p.headerColumns as { text?: string }[] | undefined) ?? []).map((c) => plain(c.text)).join(" | ");
      const body = ((p.bodyRows as { cellContent?: { text?: string }[] }[][] | undefined) ?? []).map((row) => row.map((cell) => (cell.cellContent ?? []).map((c) => plain(c.text)).join(" ")).join(" | "));
      for (const row of [header, ...body]) {
        if (!row.replace(/[| ]/g, "")) continue;
        out.lines.push(row);
        out.rows.push(row);
      }
    } else if (id === "manual-download-list") {
      for (const item of (p.listItems as { text?: string; link?: string }[] | undefined) ?? []) {
        if (item.text && item.link?.startsWith("https://")) out.documents.push({ title: item.text.trim(), url: item.link });
      }
    }
    walk(b.nestedContent, out);
  }
}

async function detail(card: Card): Promise<Detail> {
  const out: Detail = { lines: [], rows: [], documents: [], updated: null };
  const html = await get(`${SITE}${card.path}`);
  const payload = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!payload) return out;
  const root = hydrate(JSON.parse(payload)) as { data?: Record<string, Doc | null> };
  const doc = root.data?.[`${card.path.slice(1)}.json`];
  if (!doc) return out;
  walk(doc.content, out);
  out.updated = toIso(doc.updatedAt);
  return out;
}

// "12 April 2027 | Submissions deadline (13h00, CET)" -> Swiss wall-clock time with a Z suffix, end of day without a time.
function rowDate(row: string, endOfDay: boolean): string | null {
  const m = row.match(DATE);
  if (!m) return null;
  const time = row.replace(m[0], " ").match(/\b(\d{1,2})[:h.](\d{2})\b/);
  const day = `${m[3]}-${String(MONTHS.indexOf((m[2] as string).toLowerCase()) + 1).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}`;
  return `${day}T${time ? `${(time[1] as string).padStart(2, "0")}:${time[2]}:00` : endOfDay ? "23:59:59" : "00:00:00"}.000Z`;
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/\bSMEs?\b|small and medium/i.test(text)) out.add("sme");
  if (/start-?ups?\b/i.test(text)) out.add("startup");
  if (/compan(y|ies)|implementation partners?|businesses|industr(y|ial) partners?/i.test(text)) out.add("company");
  if (/research (institut|partner|organi[sz]ation)|universit(y|ies)|higher education/i.test(text)) out.add("research_org");
  return [...out];
}

function normalize(card: Card, d: Detail): Grant {
  const deadlines = d.rows.filter((r) => /deadline/i.test(r)).map((r) => rowDate(r, true)).filter((v): v is string => v !== null).sort();
  const closes = deadlines.at(-1) ?? null;
  const launch = d.rows.filter((r) => /call launch|launch of the call|call opens|opening of the call/i.test(r)).map((r) => rowDate(r, false)).find((v) => v !== null) ?? null;
  const opens = launch && (!closes || launch <= closes) ? launch : null;
  const text = d.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // A listed call without a deadline in its schedule: announced ("will open", "will launch") or open.
  const status: Grant["status"] = closes ? statusFromDates(opens, closes) : /will (be )?(open|launch)/i.test(`${card.teaser} ${text}`) ? "forthcoming" : "open";
  const summary = [card.teaser, card.published && `Published: ${card.published}`, text].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `ch_innosuisse:${card.slug}`,
    source: "ch_innosuisse",
    source_id: card.slug,
    source_url: `${SITE}${card.path}`,
    source_license: LICENSE,
    title: card.title,
    title_lang: "en",
    summary: summary || null,
    funder_name: "Innosuisse",
    funder_level: "national",
    country: "CH",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(`${card.teaser} ${text}`),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "CHF",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: d.documents,
    source_updated_at: d.updated,
  };
}

export const chInnosuisse: Source = {
  id: "ch_innosuisse",
  license: LICENSE,
  start() {
    return "start";
  },
  async fetchPage(): Promise<Page> {
    const cards = parseList(await get(LIST_URL));
    if (cards.length === 0) throw new Error("Innosuisse returned no calls for projects (layout change?)");
    const details = await mapLimit(cards, 2, (card) => detail(card));
    const grants = cards.map((card, i) => normalize(card, details[i] as Detail));
    return { grants, raws: cards.map((card, i) => ({ source_id: card.slug, payload: { ...card, ...details[i] } })), next: null };
  },
};
