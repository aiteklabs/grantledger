import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Slovenia, evropskasredstva.si: the government portal of EU funds (cohesion policy, Interreg, fisheries, AMIF, LIFE).
// The call list is server-rendered, 12 cards per page (/razpisi/<status>/stran/N), and each card already carries
// every field the portal has: issuer, EU programme, purpose, value, EU share, publication date, deadline, policy
// objective, eligible applicants and the links to the issuer's page and documents. So no detail pages are read: one
// request per fetchPage. Two statuses are read, "aktualen" (current) and "napovedan" (announced); "zakljucen"
// (closed) is not. The fields are free text typed by each ministry: dates and amounts come in several formats and
// are parsed leniently; a deadline that cannot be read as a date stays in the summary only. The portal is not kept
// tidy: a current card with a past deadline is emitted as closed, and an announced card whose expected publication
// date has passed (half of them, some by two years, some published since under another card) is emitted as
// "unknown" instead of forthcoming. The record URL is the WordPress short link (?p=id), which redirects to the
// call's own page whatever its status. The feed overlaps si_gov_objave for calls of the ministries. robots.txt
// allows everything; Cloudflare is in front and rewrites e-mail addresses, which are decoded back.
const SITE = "https://evropskasredstva.si";
const LICENSE = "evropskasredstva.si public call information, Republic of Slovenia";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const STATUSES = ["aktualen", "napovedan"] as const;
const MONTHS = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];
// Invitations to join a register of mentors or experts are not funding.
const NOT_FUNDING = /mentor|strokovnjak/i;

interface Cursor { status: (typeof STATUSES)[number]; page: number }
interface Card { id: string; title: string; fields: [string, string][]; links: Record<string, string> }

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/\s+/g, " ").trim();
const pad = (s: string | number) => String(s).padStart(2, "0");
// Cloudflare e-mail obfuscation: the first byte of data-cfemail is the XOR key of the rest.
function cfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

// Every date in a free-text field: "25.9.2026", "5. 9. 2025 do 23.59", "23. januar 2026".
function dates(text: string): { y: string; m: string; d: string; time: string | null }[] {
  const out: { y: string; m: string; d: string; time: string | null }[] = [];
  const months = MONTHS.map((m) => m.slice(0, -1)).join("|");
  for (const m of text.matchAll(new RegExp(`(\\d{1,2})\\s*\\.\\s*(?:(\\d{1,2})\\s*\\.|(${months})\\w*)\\s*(\\d{4})(?:,?\\s*do(?: vključno)?\\s+(\\d{1,2})[.:](\\d{2}))?`, "gi"))) {
    const month = m[2] ? Number(m[2]) : MONTHS.findIndex((n) => m[3]!.toLowerCase().startsWith(n.slice(0, -1))) + 1;
    if (month < 1 || month > 12 || Number(m[1]) > 31) continue;
    out.push({ y: m[4]!, m: pad(month), d: pad(m[1]!), time: m[5] ? `${pad(m[5])}:${m[6]}:00` : null });
  }
  return out;
}

// "1.894.260,40 €", "2441000.01 €", "200.000 EUR", "19,8 mio €", "11,7 mil. EUR".
function amount(text: string | undefined): number | null {
  const m = text?.match(/(\d[\d.,]*\d|\d)\s*(mio|mil)?/i);
  if (!m) return null;
  const raw = m[1]!;
  const n = num(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw);
  return n === null ? null : m[2] ? Math.round(n * 1e6) : n;
}

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const raw of html.split('<div class="card mb-15 tender">').slice(1)) {
    const part = raw.replace(/<a[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/a>/g, (_, hex: string) => cfEmail(hex));
    const id = part.match(/id="notation-card-(\d+)"/)?.[1];
    const title = clean(part.match(/<a data-toggle="collapse"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "");
    if (!id || !title) continue;
    const fields: [string, string][] = [];
    const links: Record<string, string> = {};
    for (const m of part.matchAll(/<div class="option_notation_left">\s*<p>([\s\S]*?)<\/p>[\s\S]*?<div class="option_notation_right">([\s\S]*?)<\/div>/g)) {
      const label = clean(m[1]!);
      const value = clean(m[2]!);
      if (!label || !value) continue;
      fields.push([label, value]);
      const href = m[2]!.match(/<a href="([^"]+)"/)?.[1];
      if (href) links[label] = decodeEntities(href).trim();
    }
    cards.push({ id, title, fields, links });
  }
  return cards;
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/podjetj|gospodarsk\w+ družb|samostojn\w+ podjetnik|zadrug/.test(t)) out.add("company");
  if (/\bmsp\b|mikro, mal|mala in srednj|malih in srednj|srednje velik/.test(t)) out.add("sme");
  if (/zagonsk|start-?up/.test(t)) out.add("startup");
  if (/fizičn\w+ oseb|nosil\w+ kmetij|ribič/.test(t)) out.add("individual");
  if (/raziskovaln|univerz|visokošolsk/.test(t)) out.add("research_org");
  if (/občin|javn\w+ zavod|javn\w+ sektor|javn\w+ sklad|javn\w+ agencij|državn\w+ organ|lokaln\w+ skupnost|ministrstv|osebe javnega prava/.test(t)) out.add("public_body");
  if (/nevladn|društv|humanitarn|zasebn\w+ zavod/.test(t)) out.add("ngo");
  return [...out];
}

function normalize(c: Card, listStatus: Cursor["status"]): Grant {
  const field = (re: RegExp) => c.fields.find(([label]) => re.test(label))?.[1];
  const now = new Date().toISOString();
  const due = dates(field(/^Rok za prijavo/i) ?? "").map((d) => `${d.y}-${d.m}-${d.d}T${d.time ?? "23:59:59"}.000Z`).sort().at(-1) ?? null;
  const published = dates(field(/^Datum objave/i) ?? "")[0];
  // Announced calls: "Predviden datum objave 30.09.2026" or "Načrtovani datum objave Oktober 2026"; a month stands
  // for its last day, as the portal's own dates do.
  const plannedText = field(/datum objave/i) ?? "";
  const plannedMonth = plannedText.match(new RegExp(`^(${MONTHS.join("|")})\\s+(\\d{4})$`, "i"));
  const monthIndex = plannedMonth ? MONTHS.indexOf(plannedMonth[1]!.toLowerCase()) : -1;
  const planned = dates(plannedText)[0] ?? (plannedMonth ? { y: plannedMonth[2]!, m: pad(monthIndex + 1), d: pad(new Date(Date.UTC(Number(plannedMonth[2]), monthIndex + 1, 0)).getUTCDate()) } : undefined);
  const announced = listStatus === "napovedan";
  let opens = announced ? (planned ? `${planned.y}-${planned.m}-${planned.d}T00:00:00.000Z` : null) : published ? `${published.y}-${published.m}-${published.d}T00:00:00.000Z` : null;
  const stale = announced && opens !== null && `${opens.slice(0, 10)}T23:59:59.000Z` < now;
  if (opens && (stale || (due && opens > due))) opens = null;
  const value = field(/^Razpisana vrednost/i);
  const issuer = field(/^Razpisovalec/i);
  const docs = c.links["Povezava do dokumentacije"];
  const summary = c.fields.map(([label, v]) => `${label}: ${v}`).join("\n").slice(0, 20000);
  return {
    id: `si_evropska_sredstva:${c.id}`,
    source: "si_evropska_sredstva",
    source_id: c.id,
    source_url: `${SITE}/?p=${c.id}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: "sl",
    summary: summary || null,
    funder_name: issuer ?? null,
    funder_level: "national",
    country: "SI",
    regions: [],
    funding_types: /vavčer/i.test(c.title) ? ["voucher"] : ["grant"],
    beneficiary_types: beneficiaryTypes(field(/upravičenih prijaviteljev/i) ?? ""),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: amount(value),
    currency: "EUR",
    status: stale ? "unknown" : announced ? "forthcoming" : due && due < now ? "closed" : "open",
    opens_at: opens,
    closes_at: announced ? null : due,
    documents: docs && /^https:\/\/\S+$/.test(docs) && URL.canParse(docs) ? [{ title: "Razpisna dokumentacija", url: docs }] : [],
    source_updated_at: null,
  };
}

export const siEvropskaSredstva: Source = {
  id: "si_evropska_sredstva",
  license: LICENSE,
  start() {
    return JSON.stringify({ status: STATUSES[0], page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const html = await fetchHtml(`${SITE}/razpisi/${c.status}/${c.page > 1 ? `stran/${c.page}/` : ""}`, UA);
    const all = parseCards(html);
    if (all.length === 0 && c.page === 1) throw new Error(`evropskasredstva.si returned no calls for ${c.status} (bot challenge or layout change?)`);
    const cards = all.filter((card) => !NOT_FUNDING.test(card.title));
    const grants = cards.map((card) => normalize(card, c.status));
    // The pager shows the last page number; a request beyond it is a 404.
    const last = Math.max(1, ...[...html.matchAll(/class="page-numbers[^"]*"[^>]*>(\d+)</g)].map((m) => Number(m[1])));
    const nextStatus = STATUSES[STATUSES.indexOf(c.status) + 1];
    const next: Cursor | null = c.page < last && all.length > 0 ? { status: c.status, page: c.page + 1 } : nextStatus ? { status: nextStatus, page: 1 } : null;
    return {
      grants,
      raws: cards.map((card) => ({ source_id: card.id, payload: card })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
