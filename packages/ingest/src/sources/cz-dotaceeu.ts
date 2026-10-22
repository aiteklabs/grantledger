import type { Grant } from "@grantledger/schema";
import { stripHtml } from "../util";
import type { Page, Source } from "./types";

// Czechia, dotaceeu.cz (Ministry of Regional Development): three server-rendered call feeds, 5 items per page.
const SITE = "https://dotaceeu.cz";
const FEEDS = ["vyzvyfeeddotace", "vyzvyfeedeuprog", "vyzvyfeedfinanc"];
const LICENSE = "dotaceeu.cz public call list (Ministerstvo pro místní rozvoj ČR)";
interface Cursor { feed: number; page: number }

function czDate(v: string): string | null {
  const m = v.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T12:00:00.000Z` : null;
}

function normalize(li: string, feed: string): Grant | null {
  const href = li.match(/href="(\/Jak-ziskat[^"]+)"/)?.[1];
  if (!href) return null;
  const title = stripHtml(li.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "").trim();
  const tags = [...li.matchAll(/class="tag[^"]*"[^>]*>([\s\S]*?)<\/a>|class="tag[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => stripHtml(m[1] ?? m[2] ?? "").trim()).filter(Boolean);
  const programme = tags[0] ?? "";
  const statusText = tags.find((t) => /Otevřená|Plánovaná|Uzavřená|Ukončená/.test(t)) ?? "";
  const window = stripHtml(li.match(/Termín pro podání žádosti:\s*<\/span>([\s\S]*?)<\/p>/)?.[1] ?? "");
  const [from, to] = window.split(/\s*-\s*/);
  const opens = from ? czDate(from) : null;
  const closes = to ? czDate(to) : null;
  const now = new Date().toISOString();
  const slug = href.split("/").filter(Boolean).slice(-2).join("/");
  return {
    id: `cz_dotaceeu:${slug}`,
    source: "cz_dotaceeu",
    source_id: slug,
    source_url: `${SITE}${href}`,
    source_license: LICENSE,
    title: title || slug,
    title_lang: "cs",
    summary: [programme ? `Program: ${programme}` : "", window ? `Termín pro podání žádosti: ${window}` : "", feed === "vyzvyfeedfinanc" ? "Finanční nástroj" : feed === "vyzvyfeedeuprog" ? "Program EU" : "Národní dotace"].filter(Boolean).join("\n"),
    funder_name: programme || null,
    funder_level: feed === "vyzvyfeedeuprog" ? "supranational" : "national",
    country: "CZ",
    regions: [],
    funding_types: feed === "vyzvyfeedfinanc" ? ["loan", "guarantee"] : ["grant"],
    beneficiary_types: [],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "CZK",
    status: /Uzavřená|Ukončená/.test(statusText) || (closes && closes < now) ? "closed" : /Plánovaná/.test(statusText) || (opens && opens > now) ? "forthcoming" : "open",
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const czDotaceeu: Source = {
  id: "cz_dotaceeu",
  license: LICENSE,
  start() {
    return JSON.stringify({ feed: 0, page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const feed = FEEDS[c.feed]!;
    const res = await fetch(`${SITE}/cs/ajax-pages/${feed}?page=${c.page}`, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${feed} page ${c.page}`);
    const html = await res.text();
    const items = html.match(/<li class="js-ajax-item">[\s\S]*?<\/li>/g) ?? [];
    const pairs = items.flatMap((li) => { const g = normalize(li, feed); return g ? [{ grant: g, raw: li }] : []; });
    const grants = pairs.map((p) => p.grant);
    const more = grants.length > 0 && c.page < 200;
    const next: Cursor | null = more ? { feed: c.feed, page: c.page + 1 } : c.feed + 1 < FEEDS.length ? { feed: c.feed + 1, page: 1 } : null;
    return { grants, raws: pairs.map((p) => ({ source_id: p.grant.source_id, payload: p.raw })), next: next ? JSON.stringify(next) : null };
  },
};
