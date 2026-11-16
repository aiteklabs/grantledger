import type { Grant } from "@grantledger/schema";
import { fetchHtml, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Austria, FFG (Forschungsförderungsgesellschaft): server-rendered call list, 10 cards per page, three status filters.
const SITE = "https://www.ffg.at";
const LICENSE = "FFG public call information";
// The site's WAF answers a bot user agent from datacenter IPs with 403; a browser user agent passes.
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "de-AT,de;q=0.9,en;q=0.8" };
const STATUSES = [1, 2, 3];

interface Cursor { status: number; page: number }

function deDate(v: string): string | null {
  const m = v.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T12:00:00.000Z` : null;
}

function parseCards(html: string): { slug: string; title: string; subtitle: string; teaser: string; status: string; period: string; max: string }[] {
  const out = [];
  for (const card of html.match(/<article data-component-id="ao_canvas:call-teaser"[\s\S]*?<\/article>/g) ?? []) {
    // Cards link to many path families (/ausschreibung/, /europa/..., /tiks/...); the path itself is the id.
    const path = card.match(/href=["']?(\/[^"'\s>]+)/)?.[1];
    if (!path) continue;
    const slug = path.replace(/^\//, "");
    const text = stripHtml(card).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
    out.push({
      slug,
      title: stripHtml(card.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? slug).trim(),
      subtitle: stripHtml(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "").trim(),
      teaser: stripHtml(card.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "").trim(),
      status: text.match(/(Geöffnet|Geschlossen|Demnächst|In Vorbereitung|Beendet)/)?.[1] ?? "",
      period: text.match(/Einreichzeitraum\s*\n?\s*([^\n]+)/)?.[1]?.trim() ?? "",
      max: text.match(/Max\. Förderung pro\s+Projekt\s*\n?\s*([^\n]+)/)?.[1]?.trim() ?? "",
    });
  }
  return out;
}

function normalize(c: ReturnType<typeof parseCards>[number]): Grant {
  const [from, to] = c.period.split(/\s*-\s*/);
  const opens = from ? deDate(from) : null;
  const closes = to ? deDate(to) : null;
  const now = new Date().toISOString();
  const who = `${c.subtitle} ${c.teaser}`.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (/kmu|klein/.test(who)) bens.add("sme");
  if (/start-?up/.test(who)) bens.add("startup");
  if (/unternehmen|betrieb/.test(who)) bens.add("company");
  if (/forschungseinrichtung|universit|hochschul/.test(who)) bens.add("research_org");
  if (/gemeinde|stadt|öffentlich/.test(who)) bens.add("public_body");
  const status: Grant["status"] = /Geschlossen|Beendet/.test(c.status) ? "closed" : closes && closes < now ? "closed" : /Demnächst|Vorbereitung/.test(c.status) || (opens && opens > now) ? "forthcoming" : "open";
  return {
    id: `at_ffg:${c.slug}`,
    source: "at_ffg",
    source_id: c.slug,
    source_url: `${SITE}/${c.slug}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: "de",
    summary: [c.subtitle, c.teaser, c.period ? `Einreichzeitraum: ${c.period}` : "", c.max ? `Max. Förderung pro Projekt: ${c.max}` : ""].filter(Boolean).join("\n\n") || null,
    funder_name: "FFG",
    funder_level: "national",
    country: "AT",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: num(c.max.replace(/\./g, "").replace(",", ".")),
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

// www.ffg.at answers 403 to Cloudflare Workers and GitHub runners alike (seen 2026-09-29); a timer on a home
// machine runs scripts/push-local.ts for it instead.
export const atFfg: Source = {
  id: "at_ffg",
  license: LICENSE,
  runner: "local",
  start() {
    return JSON.stringify({ status: 1, page: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const cards = parseCards(await fetchHtml(`${SITE}/foerderungen?status%5B${c.status}%5D=${c.status}&page=${c.page}`, UA));
    // The first open-calls page always has cards; none means the WAF served a challenge page instead of the list.
    if (cards.length === 0 && c.status === STATUSES[0] && c.page === 0) throw new Error("FFG returned no call cards (WAF challenge?)");
    const nextStatus = STATUSES[STATUSES.indexOf(c.status) + 1];
    const next: Cursor | null = cards.length > 0 ? { status: c.status, page: c.page + 1 } : nextStatus ? { status: nextStatus, page: 0 } : null;
    return { grants: cards.map(normalize), raws: cards.map((x) => ({ source_id: x.slug, payload: x })), next: next ? JSON.stringify(next) : null };
  },
};
