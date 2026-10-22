import type { Grant } from "@grantledger/schema";
import { fetchHtml, londonIso, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// UK, Sussex Community Foundation: the Main grants page carries the dates of the next rounds; the Additional grants
// page lists the other funds (name, teaser, open or closed, link) and each fund page adds eligibility, amounts and
// sometimes a deadline. robots.txt disallows /wp-json/ and asks for a 10 second crawl delay, so the HTML pages are
// read one per fetchPage call with that pause in between.
const SITE = "https://sussexcommunityfoundation.org";
const MAIN_URL = `${SITE}/grants/how-to-apply/main-grants/`;
const LIST_URL = `${SITE}/grants/how-to-apply/additional-grants/`;
const LICENSE = "Sussex Community Foundation public grant programme information";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CRAWL_DELAY_MS = 10_000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Brighton and Hove, East Sussex, West Sussex (South West), West Sussex (North East).
const SUSSEX = ["UKJ21", "UKJ22", "UKJ27", "UKJ28"];

interface Item { slug: string; title: string; open: boolean; individuals: boolean }

const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());

// The page body: every content block ("text-image-block" section) except the "Get in touch" one that closes each page.
function body(html: string): string {
  const blocks = (html.match(/<section class='text-image-block[\s\S]*?<\/section>/g) ?? []).filter((b) => !/<h2[^>]*>\s*Get in touch/.test(b));
  return stripHtml(blocks.join("\n")).replace(/\u00a0/g, " ").replace(/\n\s*\n/g, "\n\n");
}

// "range from £1,000 to £10,000", "£10,000–£20,000", else "up to £7,500". With several amounts the largest maximum wins.
function amounts(text: string): { min: number | null; max: number | null } {
  const pounds = (n: string) => num(n.replace(/,/g, ""));
  const range = text.match(/£([\d,]+)\s*(?:-|–|—|to)\s*£([\d,]+)/);
  const upTo = [...text.matchAll(/up to £([\d,]+)/gi)].map((m) => pounds(m[1] as string) ?? 0);
  const max = Math.max(range ? (pounds(range[2] as string) ?? 0) : 0, ...upTo);
  return { min: range && upTo.length === 0 ? pounds(range[1] as string) : null, max: max || null };
}

function record(id: string, url: string, title: string, text: string, rest: Pick<Grant, "status" | "opens_at" | "closes_at" | "beneficiary_types">): Grant {
  const money = amounts(text);
  return {
    id: `uk_sussex_cf:${id}`,
    source: "uk_sussex_cf",
    source_id: id,
    source_url: url,
    source_license: LICENSE,
    title,
    title_lang: "en",
    summary: text || null,
    funder_name: "Sussex Community Foundation",
    funder_level: "regional",
    country: "GB",
    regions: SUSSEX,
    funding_types: ["grant"],
    sectors: [],
    amount_min: money.min,
    amount_max: money.max,
    budget_total: null,
    currency: "GBP",
    documents: [],
    source_updated_at: null,
    ...rest,
  };
}

// Main grants: "Spring 2027 / Applications open: Monday 14 December / Applications close: Friday 8 January". The year
// in the heading is the year of the closing date; a round that opens in December closes in the next year.
function mainGrants(html: string): Grant {
  // The introduction sits in a rich-text block above the content blocks.
  const intro = stripHtml(html.match(/<div[^>]*class="oxy-rich-text[^"]*"[^>]*>(\s*<h1>[\s\S]*?)<\/div>/)?.[1] ?? "");
  const text = [intro, body(html)].filter(Boolean).join("\n\n");
  const now = new Date().toISOString();
  const rounds = [...text.matchAll(/(?:Spring|Summer|Autumn|Winter) (\d{4})\s+Applications open:\s*\w+ (\d{1,2}) (\w+)\s+Applications close:\s*\w+ (\d{1,2}) (\w+)/g)].map((m) => {
    const year = Number(m[1]);
    const openMonth = monthIndex(m[3] as string);
    const closeMonth = monthIndex(m[5] as string);
    return { opens: londonIso(openMonth > closeMonth ? year - 1 : year, openMonth, Number(m[2]), 0), closes: londonIso(year, closeMonth, Number(m[4]), 23, 59) };
  });
  const round = rounds.find((r) => r.closes >= now) ?? rounds.at(-1);
  return record("main-grants", MAIN_URL, "Main grants", text, { status: statusFromDates(round?.opens ?? null, round?.closes ?? null), opens_at: round?.opens ?? null, closes_at: round?.closes ?? null, beneficiary_types: ["ngo"] });
}

function parseList(html: string): Item[] {
  const individualsFrom = html.indexOf("Grants for individuals");
  const items: Item[] = [];
  for (const m of html.matchAll(/<h2 class='ct-headline copy-title--on-white'>([\s\S]*?)<\/h2>([\s\S]*?)<\/section>/g)) {
    const slug = (m[2] as string).match(/href="[^"]*\/additional-grants\/([^"/]+)\/?"/)?.[1];
    if (!slug) continue;
    items.push({ slug, title: stripHtml(m[1] as string).replace(/\s+/g, " ").replace(/\.$/, "").trim(), open: /is\s+open\s+for\s+applications/i.test(stripHtml(m[2] as string)), individuals: individualsFrom !== -1 && (m.index ?? 0) > individualsFrom });
  }
  return items;
}

// "The deadline is 5pm on Friday 16 October 2026." A deadline printed without a year is left out: the page does not
// say which year it means.
function deadline(text: string): string | null {
  const m = text.match(/deadline[^.\n]*?(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/i);
  if (!m) return null;
  const hour = (m[0] as string).match(/(\d{1,2})\s*pm/i)?.[1];
  return hour ? londonIso(Number(m[3]), monthIndex(m[2] as string), Number(m[1]), Number(hour) + 12) : londonIso(Number(m[3]), monthIndex(m[2] as string), Number(m[1]), 23, 59);
}

function fund(item: Item, html: string): Grant {
  const text = body(html);
  const closes = item.open ? deadline(text) : null;
  return record(item.slug, `${LIST_URL}${item.slug}/`, item.title, text, { status: item.open ? "open" : "closed", opens_at: null, closes_at: closes, beneficiary_types: item.individuals ? ["individual"] : ["ngo"] });
}

export const ukSussexCf: Source = {
  id: "uk_sussex_cf",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the Main grants page and the list of additional funds. After that the cursor is the JSON list of
  // funds still to read, one fund page per call.
  async fetchPage(cursor): Promise<Page> {
    if (cursor === "start") {
      const main = await fetchHtml(MAIN_URL, UA);
      await pause();
      const items = parseList(await fetchHtml(LIST_URL, UA));
      if (items.length === 0) throw new Error("Sussex Community Foundation returned no additional funds (layout change?)");
      const grant = mainGrants(main);
      return { grants: [grant], raws: [{ source_id: grant.source_id, payload: { summary: grant.summary } }], next: JSON.stringify(items) };
    }
    const [item, ...rest] = JSON.parse(cursor) as Item[];
    if (!item) return { grants: [], raws: [], next: null };
    await pause();
    const grant = fund(item, await fetchHtml(`${LIST_URL}${item.slug}/`, UA));
    return { grants: [grant], raws: [{ source_id: item.slug, payload: { ...item, summary: grant.summary } }], next: rest.length ? JSON.stringify(rest) : null };
  },
};
