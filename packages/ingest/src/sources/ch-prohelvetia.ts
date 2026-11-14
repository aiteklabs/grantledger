import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchJson, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Switzerland, Pro Helvetia (Swiss Arts Council): the "Find support" factsheets, one per funding format (creation,
// production, translation, residencies, mobility, promotion) and per discipline or target group. The WordPress REST
// type funding-opportunities returns each factsheet in English with the call text, the application windows
// (meta.ph_periods: month and day, mostly without a year because the window recurs every year), the recurrence and
// taxonomies for discipline, activity and the range of the amount requested. 167 English factsheets, 100 per request.
// Left out: partner calls (meta._ph_external_url: a call run by another organisation, without a Pro Helvetia page)
// and factsheets the publisher hides from its own filter. A window without a year is resolved to its next
// occurrence, so opens_at and closes_at only change when a window has passed.
const SITE = "https://prohelvetia.ch/wp-json/wp/v2";
const LICENSE = "Pro Helvetia public funding information (prohelvetia.ch)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PER_PAGE = 100;
const FIELDS = "id,slug,link,title,content,modified_gmt,meta,disciplines,activities,funding-request-ranges,ph_place_of_practice,ph_recurrence,ph_target_group";
const TAXONOMIES = ["disciplines", "activities", "funding-request-ranges"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Cursor { page: number; terms?: Record<string, string> }
interface Point { year: number | null; month: number; day: number; hour: number | null; minute: number | null }
interface Period { start: Point; end: Point }
interface Post {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content?: { rendered?: string };
  modified_gmt?: string;
  meta?: { _ph_import_id?: string; _ph_hide_in_filter?: number | boolean; _ph_external_url?: string; ph_periods?: Period[] };
  disciplines?: number[];
  activities?: number[];
  "funding-request-ranges"?: number[];
  ph_place_of_practice?: string;
  ph_recurrence?: string;
  ph_target_group?: string;
}

// The CMS stores a deadline of "1 September, 23:59" as 2 September at 00:01.
const endMs = (p: Point, year: number) => Date.UTC(year, p.month - 1, p.day, p.hour ?? 23, p.minute ?? 59) - (p.hour === 0 && p.minute === 1 ? 120_000 : 0);

// Every window of this year and the next (or of its own year when it has one); the first that has not ended wins.
function nextWindow(periods: Period[], now: Date): { opens: string; closes: string } | null {
  const windows: { start: number; end: number }[] = [];
  for (const p of periods) {
    if (!p.start?.month || !p.end?.month) continue;
    const wraps = p.start.month > p.end.month || (p.start.month === p.end.month && p.start.day > p.end.day);
    for (const year of p.end.year ? [p.end.year] : [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      windows.push({ start: Date.UTC(p.start.year ?? (wraps ? year - 1 : year), p.start.month - 1, p.start.day, p.start.hour ?? 0, p.start.minute ?? 0), end: endMs(p.end, year) });
    }
  }
  windows.sort((a, b) => a.end - b.end);
  const w = windows.find((x) => x.end >= now.getTime()) ?? windows.at(-1);
  return w ? { opens: new Date(w.start).toISOString(), closes: new Date(w.end).toISOString() } : null;
}

function windowText(p: Period): string {
  const end = new Date(endMs(p.end, p.end.year ?? 2001));
  const day = (d: number, m: number, y: number | null) => `${d} ${MONTHS[m - 1]}${y ? ` ${y}` : ""}`;
  return `${day(p.start.day, p.start.month, p.start.year)} to ${day(end.getUTCDate(), end.getUTCMonth() + 1, p.end.year)}`;
}

// "Bis CHF 25'000", "CHF 25'001 - CHF 50'000", "Über CHF 50'000", "Kein Maximalbeitrag" (the terms are German only).
function range(name: string): { min: number | null; max: number | null; text: string } {
  const n = (name.match(/\d[\d’']*/g) ?? []).map((v) => Number(v.replace(/\D/g, "")));
  if (n.length >= 2) return { min: n[0] as number, max: n[1] as number, text: `CHF ${n[0]} to CHF ${n[1]}` };
  if (n.length === 1) return /^bis/i.test(name) ? { min: null, max: n[0] as number, text: `up to CHF ${n[0]}` } : { min: n[0] as number, max: null, text: `over CHF ${n[0]}` };
  return { min: null, max: null, text: "no maximum amount" };
}

// The factsheet text: the facts box and the sections (What, For Whom, Selection Criteria, Financial Contribution,
// Content Of Application, deadlines), without the header image, the apply button and the related-content teasers.
function body(html: string): string {
  const from = html.search(/<div class="wp-block-ph-one-factsheet-(meta|data)"/);
  if (from === -1) return "";
  const rest = html.slice(from);
  const cut = rest.search(/You might be interested in|Find out more about projects already supported/);
  // Label and value on one line (facts box, deadline table), a blank line before each section heading.
  const marked = (cut === -1 ? rest : rest.slice(0, cut)).replace(/<\/(dt|td)>\s*<(dd|td)[^>]*>/g, ": ").replace(/<\/dd>/g, "</dd>\n").replace(/<h2[^>]*>/g, "\n@@").replace(/<\/h2>/g, ":</h2>");
  const lines = stripHtml(marked).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  return lines.join("\n").replace(/\n?@@/g, "\n\n").replace(/\s*Send your application\s*$/, "").trim();
}

function normalize(x: Post, terms: Record<string, string>): Grant {
  const names = (ids: number[] | undefined) => (ids ?? []).map((id) => terms[String(id)]).filter(Boolean) as string[];
  const periods = x.meta?.ph_periods ?? [];
  const window = nextWindow(periods, new Date());
  const money = range(names(x["funding-request-ranges"])[0] ?? "");
  const hasRange = (x["funding-request-ranges"] ?? []).length > 0;
  const text = body(x.content?.rendered ?? "");
  // "Financial Contribution: Maximum grant of CHF 20,000" is more exact than the range of the filter.
  const stated = text.match(/\nFinancial Contribution:\n(?:Maximum grant|Max\.|Up to)[^\d\n]{0,20}CHF ([\d,.’']+)/i)?.[1];
  const label = (slug: string | undefined) => (slug ? slug.replace(/-/g, " ") : "");
  const summary = [
    [
      names(x.disciplines).length > 0 && `Discipline: ${names(x.disciplines).join(", ")}`,
      names(x.activities).length > 0 && `Activity: ${names(x.activities).join(", ")}`,
      x.ph_target_group && `Target group: ${label(x.ph_target_group)}`,
      x.ph_place_of_practice && `Place of practice: ${label(x.ph_place_of_practice)}`,
      x.ph_recurrence && `Recurrence: ${label(x.ph_recurrence)}`,
      periods.length > 0 && `Application windows: ${periods.map(windowText).join("; ")}`,
      hasRange && `Amount requested (filter range): ${money.text}`,
    ].filter(Boolean).join("\n"),
    text,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  const id = x.meta?._ph_import_id?.trim() || x.slug;
  return {
    id: `ch_prohelvetia:${id}`,
    source: "ch_prohelvetia",
    source_id: id,
    source_url: x.link,
    source_license: LICENSE,
    title: decodeEntities(x.title.rendered).trim(),
    title_lang: "en",
    summary: summary || null,
    funder_name: "Pro Helvetia",
    funder_level: "national",
    country: "CH",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: x.ph_target_group === "practitioners" ? ["individual"] : x.ph_target_group === "institutions" ? ["other"] : [],
    sectors: names(x.disciplines),
    amount_min: !stated && hasRange ? money.min : null,
    amount_max: stated ? Number(stated.replace(/\D/g, "")) : hasRange ? money.max : null,
    budget_total: null,
    currency: "CHF",
    // No window: the factsheet is open all year, or the publisher gives no dates for it.
    status: window ? statusFromDates(window.opens, window.closes) : "open",
    opens_at: window?.opens ?? null,
    closes_at: window?.closes ?? null,
    documents: [],
    source_updated_at: x.modified_gmt ? `${x.modified_gmt}.000Z` : null,
  };
}

async function loadTerms(): Promise<Record<string, string>> {
  const terms: Record<string, string> = {};
  for (const taxonomy of TAXONOMIES) {
    const rows = await fetchJson<{ id: number; name: string }[]>(`${SITE}/${taxonomy}?lang=en&per_page=100&_fields=id,name`, { headers: UA });
    for (const t of rows) terms[String(t.id)] = decodeEntities(t.name);
  }
  return terms;
}

export const chProhelvetia: Source = {
  id: "ch_prohelvetia",
  license: LICENSE,
  start() {
    return JSON.stringify({ page: 1 } satisfies Cursor);
  },
  // The first call also reads the three taxonomies (id to name) and hands them on in the cursor.
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const terms = c.terms ?? (await loadTerms());
    const res = await fetch(`${SITE}/funding-opportunities?lang=en&per_page=${PER_PAGE}&page=${c.page}&orderby=id&order=asc&_fields=${FIELDS}`, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Pro Helvetia funding opportunities (page ${c.page})`);
    const posts = (await res.json()) as Post[];
    if (c.page === 1 && posts.length === 0) throw new Error("Pro Helvetia returned no funding opportunities");
    const rows = posts.filter((x) => x.link?.startsWith("https://prohelvetia.ch/") && x.title?.rendered && !x.meta?._ph_external_url && !x.meta?._ph_hide_in_filter);
    const grants = rows.map((x) => normalize(x, terms));
    const pages = Number(res.headers.get("x-wp-totalpages") ?? "1");
    return {
      grants,
      raws: rows.map((x, i) => ({ source_id: grants[i]!.source_id, payload: x })),
      next: c.page < pages ? JSON.stringify({ page: c.page + 1, terms } satisfies Cursor) : null,
    };
  },
};
