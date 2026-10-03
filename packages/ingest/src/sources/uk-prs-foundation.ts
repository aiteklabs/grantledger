import type { Grant } from "@grantledger/schema";
import { fetchJson, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// UK, PRS Foundation (music funder): the "All Upcoming Deadlines" page is one table with every current fund (name, link,
// opening dates, deadlines); each fund page adds the description. The site is WordPress and its REST API is public.
const SITE = "https://prsfoundation.com";
const API = `${SITE}/wp-json/wp/v2/pages`;
// https://prsfoundation.com/funding-support/deadlines/
const DEADLINES_PAGE = 16431;
const LICENSE = "PRS Foundation public funding programme information";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

interface WpPage { link: string; modified_gmt: string; content: { rendered: string } }

interface Row { id: string; title: string; link: string; opens: string; deadlines: string }

function parseRows(html: string): Row[] {
  const rows: Omit<Row, "id">[] = [];
  for (const tr of html.split(/<tr[^>]*>/).slice(1)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1] as string);
    const link = cells[0]?.match(/<a href="(https:\/\/prsfoundation\.com\/[^"]+)"/)?.[1];
    if (!link || cells.length < 3) continue;
    rows.push({ title: stripHtml(cells[0] as string).replace(/\s+/g, " ").trim(), link, opens: stripHtml(cells[1] as string), deadlines: stripHtml(cells[2] as string) });
  }
  // Several rows can point at one fund page (PPL Momentum Accelerator has one row per region): the title tells them apart.
  return rows.map((r) => {
    const segment = r.link.replace(/\/$/, "").split("/").pop() as string;
    const shared = rows.filter((o) => o.link === r.link).length > 1;
    return { ...r, id: shared ? `${segment}-${r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : segment };
  });
}

// Every "18 March 2026" / "23rd September 2026" / "6th Jan 2027" in a cell, as ISO at `hour` London time, in page order.
// A date printed without a year ("3 September: Round 18") takes the year of the date before it.
function dates(text: string, hour: number): string[] {
  const found = [...text.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(\d{4}))?/gi)];
  let year = found.find((m) => m[3])?.[3];
  const out: string[] = [];
  for (const m of found) {
    year = m[3] ?? year;
    if (!year) continue;
    const month = MONTHS.indexOf((m[2] as string).toLowerCase());
    const day = Number(m[1]);
    // UK is UTC+1 from the last Sunday of March to the last Sunday of October.
    const lastSunday = (mo: number) => { const end = new Date(Date.UTC(Number(year), mo + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
    const summer = (month > 2 && month < 9) || (month === 2 && day >= lastSunday(2)) || (month === 9 && day < lastSunday(9));
    out.push(new Date(Date.UTC(Number(year), month, day, hour - (summer ? 1 : 0))).toISOString());
  }
  return out;
}

function normalize(row: Row, detail: WpPage | null): Grant {
  const now = new Date().toISOString();
  // "All deadlines are 6:00pm unless otherwise stated." The next deadline wins; when all have passed, the last one.
  const deadlines = dates(row.deadlines, 18).sort();
  const closes = deadlines.find((d) => d >= now) ?? deadlines.at(-1) ?? null;
  // The round that ends at `closes` opened on the latest opening date before that day.
  const opens = closes ? dates(row.opens, 0).sort().filter((o) => new Date(o).getTime() + 86_400_000 <= new Date(closes).getTime()).at(-1) ?? null : null;
  const rolling = /rolling/i.test(row.deadlines);
  const text = detail ? stripHtml(detail.content.rendered) : "";
  // "grants of up to £5000", "up to £15k".
  const upTo = text.match(/up to £\s?([\d,.]+)\s*(k\b)?/i);
  return {
    id: `uk_prs_foundation:${row.id}`,
    source: "uk_prs_foundation",
    source_id: row.id,
    source_url: row.link,
    source_license: LICENSE,
    title: row.title,
    title_lang: "en",
    summary: [text, row.opens ? `Application opens\n${row.opens}` : "", row.deadlines ? `Deadlines (6pm UK time unless stated)\n${row.deadlines}` : ""].filter(Boolean).join("\n\n").replace(/ /g, " ").replace(/\n[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") || null,
    funder_name: "PRS Foundation",
    funder_level: "national",
    country: "GB",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: row.link.includes("/funding-for-organisations/") ? ["ngo", "company"] : ["individual"],
    sectors: ["music"],
    amount_min: null,
    amount_max: upTo ? (num((upTo[1] as string).replace(/,/g, "")) ?? 0) * (upTo[2] ? 1000 : 1) || null : null,
    budget_total: null,
    currency: "GBP",
    status: rolling ? "open" : statusFromDates(opens, closes),
    opens_at: rolling ? null : opens,
    closes_at: rolling ? null : closes,
    documents: [],
    source_updated_at: detail ? `${detail.modified_gmt}Z` : null,
  };
}

export const ukPrsFoundation: Source = {
  id: "uk_prs_foundation",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(): Promise<Page> {
    const list = await fetchJson<WpPage>(`${API}/${DEADLINES_PAGE}?_fields=link,modified_gmt,content`, { headers: UA });
    const rows = parseRows(list.content.rendered);
    if (rows.length === 0) throw new Error("PRS Foundation deadlines table returned no funds (layout change?)");
    const links = [...new Set(rows.map((r) => r.link))];
    const pages = await mapLimit(links, 4, async (link) => {
      const slug = link.replace(/\/$/, "").split("/").pop() as string;
      const found = await fetchJson<WpPage[]>(`${API}?slug=${slug}&_fields=link,modified_gmt,content`, { headers: UA });
      return found.find((p) => p.link === link) ?? null;
    });
    const details = rows.map((r) => pages[links.indexOf(r.link)] ?? null);
    return { grants: rows.map((r, i) => normalize(r, details[i] as WpPage | null)), raws: rows.map((r, i) => ({ source_id: r.id, payload: { ...r, page: details[i] } })), next: null };
  },
};
