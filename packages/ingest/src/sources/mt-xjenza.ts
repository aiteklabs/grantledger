import type { Grant } from "@grantledger/schema";
import { decodeEntities, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Malta, Xjenza Malta (formerly the Malta Council for Science and Technology): national research and innovation
// funding schemes and the Maltese side of joint European calls. The WordPress category "Open Funding Schemes"
// (id 49) holds one post per scheme the publisher currently shows as open; the REST list returns the full text,
// so the detail pages are not requested. Dates only exist in free text: a deadline is taken when the word
// "deadline" (or "close on") stands next to a full date, the last one when several are stated. A scheme without
// such a date is open with no closing date. robots.txt asks for a 30 second crawl delay: one request per fetchPage
// call with that pause before it, normally one request per crawl. The site answers 406 to a bare curl user agent
// and 200 to the grantledger one.
const API = "https://xjenzamalta.mt/wp-json/wp/v2/posts";
const LICENSE = "Xjenza Malta public funding scheme information (xjenzamalta.mt)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CATEGORY = 49;
const PER_PAGE = 100;
const CRAWL_DELAY_MS = 30_000;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE = "(\\d{1,2})(?:st|nd|rd|th)?\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{4})";

interface Post { id: number; link: string; modified_gmt?: string; title: { rendered: string }; content: { rendered: string } }

const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));

// A date with the time that follows it ("11 January 2027, 14:00 CET", "at 23:59", "11:59 PM"), as the wall-clock
// time with a Z suffix; without a time the end (or start) of the day.
function stamp(m: RegExpMatchArray, rest: string, endOfDay: boolean): string {
  const day = `${m[3]}-${String(MONTHS.indexOf((m[2] as string).toLowerCase()) + 1).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}`;
  const t = rest.match(/^[\s,]*(?:at\s+)?(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
  if (!t) return `${day}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z`;
  const half = (t[3] ?? "").toLowerCase();
  const hour = half === "pm" && Number(t[1]) < 12 ? Number(t[1]) + 12 : half === "am" && Number(t[1]) === 12 ? 0 : Number(t[1]);
  return `${day}T${String(hour).padStart(2, "0")}:${t[2]}:00.000Z`;
}

// Every date a line with "deadline" states, the dates that open the lines right below a "Deadline" heading,
// "close on <date>" and "submit ... by <date>". The last one is the closing date.
function deadline(lines: string[]): string | null {
  const found: string[] = [];
  const dates = (line: string) => [...line.matchAll(new RegExp(DATE, "gi"))].map((m) => stamp(m, line.slice((m.index ?? 0) + m[0].length), true));
  lines.forEach((line, i) => {
    if (/deadlines?\b/i.test(line)) {
      found.push(...dates(line));
      for (let j = i + 1; j < lines.length && new RegExp(`^${DATE}`, "i").test(lines[j] as string); j++) found.push(...dates(lines[j] as string));
    } else if (/\bclos(e|es|ing) on\b/i.test(line)) {
      found.push(...dates(line.slice(line.search(/\bclos(e|es|ing) on\b/i))));
    } else if (/\bsubmi(t|tted|ssion)\b/i.test(line)) {
      for (const m of line.matchAll(new RegExp(`\\bby (?:the |not later than )*${DATE}`, "gi"))) found.push(stamp(m, line.slice((m.index ?? 0) + m[0].length), true));
    }
  });
  return found.sort().at(-1) ?? null;
}

function opening(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(new RegExp(`\\bopens? on\\s+${DATE}`, "i"));
    if (m) return stamp(m, "", false);
  }
  return null;
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/\bSMEs?\b|small and medium/i.test(text)) out.add("sme");
  if (/start-?ups?\b/i.test(text)) out.add("startup");
  if (/compan(y|ies)|enterprises?|private (entit|sector)|industry|undertakings?/i.test(text)) out.add("company");
  if (/academi|universit(y|ies)|research (institut|organi[sz]ation|performing)|researchers?\b/i.test(text)) out.add("research_org");
  if (/public (entit|sector|bod|organi[sz]ation)|government/i.test(text)) out.add("public_body");
  if (/\bNGOs?\b|non-profit|voluntary organi[sz]ation/i.test(text)) out.add("ngo");
  return [...out];
}

function normalize(x: Post): Grant {
  // A two-column table row ("Deadline" | "7 December 2026") becomes one "label: value" line.
  const html = x.content.rendered.replace(/<\/td>\s*<td[^>]*>/g, ": ");
  const lines = stripHtml(html).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const text = lines.join("\n");
  const closes = deadline(lines);
  const opened = opening(lines);
  const opens = opened && (!closes || opened <= closes) ? opened : null;
  const now = new Date().toISOString();
  // The category is the publisher's "open" list; a stated deadline in the past closes the scheme all the same.
  const status: Grant["status"] = closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : "open";
  const upTo = [...text.matchAll(/(?:up to (?:a maximum of )?|Maximum Possible Grant:?\s*)(?:€\s?([\d,]+)|([\d,]+) Euros?\b)/gi)].map((m) => num(((m[1] ?? m[2]) as string).replace(/,/g, "")) ?? 0);
  const documents: Grant["documents"] = [];
  for (const m of html.matchAll(/<a\b[^>]*href="(https:\/\/[^"]+\.(?:pdf|docx?|xlsx?))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = stripHtml(m[2] as string).replace(/\s+/g, " ").trim();
    if (title && !documents.some((d) => d.url === m[1])) documents.push({ title, url: m[1] as string });
  }
  const id = String(x.id);
  return {
    id: `mt_xjenza:${id}`,
    source: "mt_xjenza",
    source_id: id,
    source_url: x.link,
    source_license: LICENSE,
    title: decodeEntities(x.title.rendered).trim(),
    title_lang: "en",
    summary: text.slice(0, 20000) || null,
    funder_name: "Xjenza Malta",
    funder_level: "national",
    country: "MT",
    regions: [],
    funding_types: /voucher/i.test(x.title.rendered) ? ["voucher"] : /loan/i.test(x.title.rendered) ? ["loan"] : ["grant"],
    beneficiary_types: beneficiaries(text),
    sectors: [],
    amount_min: null,
    amount_max: upTo.length ? Math.max(...upTo) || null : null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents,
    source_updated_at: x.modified_gmt ? `${x.modified_gmt}.000Z` : null,
  };
}

export const mtXjenza: Source = {
  id: "mt_xjenza",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    await pause();
    const res = await fetch(`${API}?categories=${CATEGORY}&per_page=${PER_PAGE}&page=${page}&orderby=id&order=asc&_fields=id,link,modified_gmt,title,content`, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Xjenza Malta open funding schemes (page ${page})`);
    const posts = (await res.json()) as Post[];
    if (page === 1 && posts.length === 0) throw new Error("Xjenza Malta returned no open funding schemes");
    // Not funding: the standing call for expert evaluators.
    const rows = posts.filter((x) => x.link?.startsWith("https://") && x.title?.rendered && !/expert evaluators?|expressions? of interest/i.test(x.title.rendered));
    return {
      grants: rows.map(normalize),
      raws: rows.map((x) => ({ source_id: String(x.id), payload: x })),
      next: page < Number(res.headers.get("x-wp-totalpages") ?? "1") ? String(page + 1) : null,
    };
  },
};
