import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Denmark, Carlsbergfondet (Carlsberg Foundation): grant instruments for basic research in the natural sciences,
// social sciences and humanities, research infrastructure and science communication. The applicant page (English
// version, same content as the Danish one) is server-rendered: about 18 cards under the headings "Open calls"
// (schemes open all year), "Upcoming calls" (next round with opening date and deadline) and "Closed calls", each
// with frequency and amount. Every open or upcoming instrument page adds purpose, who can apply, what is funded,
// requirements, assessment and FAQ. Cloudflare sits in front of the site.
const SITE = "https://www.carlsbergfondet.dk";
const LIST_URL = `${SITE}/en/applicant/`;
const LICENSE = "Carlsbergfondet public call information (carlsbergfondet.dk)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "text/html,application/xhtml+xml", "accept-language": "en-GB,en;q=0.9,da;q=0.8" };
// Instrument pages read per fetchPage call; the applicant page is re-read each call.
const BATCH = 10;

interface Cursor { offset: number }

interface Card { slug: string; section: "open" | "upcoming" | "closed"; title: string; teaser: string; deadline: string; fields: { label: string; value: string }[] }

const clean = (html: string | undefined) => stripHtml(html ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function parseCards(html: string): Card[] {
  const marks = [...html.matchAll(/<h2[^>]*>\s*(Open|Upcoming|Closed) calls\s*<\/h2>/g)].map((m) => ({ at: m.index ?? 0, section: (m[1] as string).toLowerCase() as Card["section"] }));
  const cards: Card[] = [];
  for (const m of html.matchAll(/<a href="\/en\/applicant\/([^"/]+)\/?"[^>]*aspect-call-card[^>]*>([\s\S]*?)<\/a>/g)) {
    const section = marks.filter((s) => s.at < (m.index ?? 0)).at(-1)?.section;
    const inner = m[2] as string;
    const title = clean(inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]);
    if (!section || !title) continue;
    const fields = [...inner.matchAll(/<p class="text-xs[^"]*">([\s\S]*?)<\/p>\s*<p class="text-sm[^"]*">([\s\S]*?)<\/p>/g)].map((f) => ({ label: clean(f[1]), value: clean(f[2]) })).filter((f) => f.label && f.value);
    cards.push({ slug: m[1] as string, section, title, teaser: clean(inner.match(/<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1]), deadline: clean(inner).match(/Deadline (\d{2}\.\d{2}\.\d{4}(?: - \d{2}:\d{2})?)/)?.[1] ?? "", fields });
  }
  return cards;
}

// The instrument page body: the content sections after the print link, up to the closing note and the newsletter.
function parseDetail(html: string): string {
  const print = html.indexOf("javascript:window.print()");
  const start = html.indexOf('<section data-type="container"', print === -1 ? html.indexOf("<main") : print);
  const ends = ["Please note: The foundation reserves", ">To overview<", "</main>"].map((k) => html.indexOf(k, start)).filter((i) => i !== -1);
  if (start === -1) return "";
  const body = html.slice(start, ends.length ? Math.min(...ends) : undefined).replace(/<p class="[^"]*hidden print:block[^"]*">[\s\S]*?<\/p>/g, "").replace(/&#xA;/gi, " ");
  return stripHtml(body).replace(/[\u00a0\r]/g, " ").replace(/[ \t]*\n\s*/g, "\n").trim();
}

// "01.09.2027 - 16:00" (Copenhagen time) as a UTC instant; a plain "01.06.2027" as that calendar day.
function daDate(value: string | undefined, fallbackTime: string): string | null {
  const m = value?.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s*-\s*(\d{2}):(\d{2}))?/);
  if (!m) return null;
  if (!m[4]) return `${m[3]}-${m[2]}-${m[1]}T${fallbackTime}.000Z`;
  const local = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00Z`);
  // Denmark is UTC+1 in winter and UTC+2 in summer (last Sunday of March to last Sunday of October).
  const lastSunday = (month: number) => { const end = new Date(Date.UTC(Number(m[3]), month + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
  const month = Number(m[2]) - 1;
  const day = Number(m[1]);
  const summer = (month > 2 && month < 9) || (month === 2 && day >= lastSunday(2)) || (month === 9 && day < lastSunday(9));
  return new Date(local.getTime() - (summer ? 2 : 1) * 3600_000).toISOString();
}

// "Maximum DKK 80,000", "DKK 15 - 25 million", "Min. DKK 300.000", "Over DKK 100,000"; "Project related" and
// "Salary and operating expenses" give no figure.
function amounts(value: string | undefined): { min: number | null; max: number | null } {
  const m = value?.match(/DKK\s*([\d.,]*\d)(?:\s*-\s*([\d.,]*\d))?\s*(million)?/i);
  if (!m) return { min: null, max: null };
  const n = (v: string) => (m[3] ? Math.round(Number(v.replace(",", ".")) * 1_000_000) : Number(v.replace(/[.,]/g, "")));
  if (m[2]) return { min: n(m[1] as string), max: n(m[2]) };
  return /^(min|over)/i.test(value ?? "") ? { min: n(m[1] as string), max: null } : { min: null, max: n(m[1] as string) };
}

function normalize(card: Card, body: string): Grant {
  const field = (label: string) => card.fields.find((f) => f.label === label)?.value;
  const opens = card.section === "open" ? null : daDate(field("Opens"), "00:00:00");
  const closes = card.section === "open" ? null : daDate(card.deadline, "23:59:59");
  const dated = statusFromDates(opens, closes);
  const money = amounts(field("Amount"));
  const summary = [
    card.teaser,
    `Status: ${card.section === "open" ? "Open call" : card.section === "upcoming" ? "Upcoming call" : "Closed call"}`,
    card.deadline && `Deadline: ${card.deadline}`,
    ...card.fields.map((f) => `${f.label}: ${f.value}`),
    body,
  ].filter(Boolean).join("\n").slice(0, 20000);
  return {
    id: `dk_carlsberg:${card.slug}`,
    source: "dk_carlsberg",
    source_id: card.slug,
    source_url: `${LIST_URL}${card.slug}/`,
    source_license: LICENSE,
    title: card.title,
    title_lang: "en",
    summary,
    funder_name: "Carlsbergfondet",
    funder_level: "national",
    country: "DK",
    regions: [],
    funding_types: ["grant"],
    // Applicants are researchers employed at (or returning to) Danish research institutions.
    beneficiary_types: ["research_org"],
    sectors: [],
    amount_min: money.min,
    amount_max: money.max,
    budget_total: null,
    currency: "DKK",
    // "Upcoming" covers the next round from its announcement to its deadline, so the dates decide between
    // forthcoming and open.
    status: card.section === "open" ? "open" : card.section === "closed" ? "closed" : dated === "unknown" ? "forthcoming" : dated,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const dkCarlsberg: Source = {
  id: "dk_carlsberg",
  license: LICENSE,
  start() {
    return JSON.stringify({ offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const { offset } = JSON.parse(cursor) as Cursor;
    const cards = parseCards(await fetchHtml(LIST_URL, UA));
    if (cards.length === 0) throw new Error("Carlsbergfondet applicant page lists no calls (bot challenge or layout change?)");
    const current = cards.filter((c) => c.section !== "closed");
    const batch = current.slice(offset, offset + BATCH);
    const bodies = await mapLimit(batch, 2, async (card) => parseDetail(await fetchHtml(`${LIST_URL}${card.slug}/`, UA)));
    const next = offset + BATCH;
    // Closed calls follow on the last page, from their cards alone.
    const closed = next < current.length ? [] : cards.filter((c) => c.section === "closed");
    const grants = [...batch.map((card, i) => normalize(card, bodies[i] ?? "")), ...closed.map((card) => normalize(card, ""))];
    return {
      grants,
      raws: [...batch.map((card, i) => ({ source_id: card.slug, payload: { card, body: bodies[i] ?? "" } })), ...closed.map((card) => ({ source_id: card.slug, payload: { card } }))],
      next: next < current.length ? JSON.stringify({ offset: next } satisfies Cursor) : null,
    };
  },
};
