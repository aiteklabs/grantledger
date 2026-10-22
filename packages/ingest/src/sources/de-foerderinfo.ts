import type { Grant } from "@grantledger/schema";
import { decodeEntities, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Germany, Förderberatung des Bundes (foerderinfo.bund.de): RSS feeds of federal funding announcements (Bekanntmachungen).
// The HTML list sits under a robots-disallowed path, the feeds are allowed. Each feed carries the latest 20 items.
const BASE = "https://www.foerderinfo.bund.de/foerderinfo/de/services/rss";
// Feed slugs as listed on the RSS index page (services/rss/rss_node.html).
const FEEDS = ["bekanntmachungen-alle", "bekanntmachungen-kmu-foerderung", "bekanntmachungen-klima-energie", "bekanntmachungen-gesundheit-ernaehrung", "bekanntmachungen-mobilitaet", "bekanntmachungen-bildung-hochschulen-wissenschaft", "bekanntmachungen-schluesseltechnologien", "bekanntmachungen-kommunikation", "bekanntmachungen-sicherheit", "bekanntmachungen-internationales", "bekanntmachungen-sozial-geistes-sozialwissenschaften"];
const LICENSE = "Bundesministerium für Forschung, Technologie und Raumfahrt, Förderberatung des Bundes (public announcements)";

interface Item { title: string; link: string; description: string; pubDate: string | null; guid: string }

function deDate(v: string): string | null {
  const m = v.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T12:00:00.000Z` : null;
}

function parseRss(xml: string): Item[] {
  const items: Item[] = [];
  for (const it of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const pick = (tag: string) => decodeEntities((it.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim();
    const link = pick("link");
    if (!link) continue;
    items.push({ title: pick("title"), link, description: stripHtml(pick("description")), pubDate: pick("pubDate") || null, guid: pick("guid") || link });
  }
  return items;
}

function normalize(it: Item): Grant {
  // "Title | 01.10.2026 - 31.12.2026" or "Title | 31.12.2026"
  const [rawTitle, window = ""] = it.title.split(/\s*\|\s*/);
  const dates = [...window.matchAll(/\d{2}\.\d{2}\.\d{4}/g)].map((m) => deDate(m[0]));
  const opens = dates.length > 1 ? dates[0]! : null;
  const closes = dates.length ? dates[dates.length - 1]! : null;
  const now = new Date().toISOString();
  const text = `${rawTitle} ${it.description}`.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (/kmu|mittelstand/.test(text)) bens.add("sme");
  if (/unternehmen/.test(text)) bens.add("company");
  if (/hochschul|forschungseinrichtung|universit/.test(text)) bens.add("research_org");
  if (/kommun|länder|gemeinde/.test(text)) bens.add("public_body");
  const idBase = (it.guid || it.link).replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_").slice(0, 150);
  return {
    id: `de_foerderinfo:${idBase}`,
    source: "de_foerderinfo",
    source_id: idBase,
    source_url: it.link,
    source_license: LICENSE,
    title: (rawTitle ?? it.title).trim() || it.link,
    title_lang: "de",
    summary: [it.description, window ? `Einreichfrist: ${window}` : "", it.pubDate ? `Veröffentlicht: ${it.pubDate}` : ""].filter(Boolean).join("\n") || null,
    funder_name: /bmwe|bmwk/i.test(it.link) ? "BMWE" : /bmftr|bmbf/i.test(it.link) ? "BMFTR" : "Bund",
    funder_level: "national",
    country: "DE",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : "open",
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
  };
}

export const deFoerderinfo: Source = {
  id: "de_foerderinfo",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const i = Number(cursor);
    const feed = FEEDS[i];
    if (!feed) return { grants: [], raws: [], next: null };
    const res = await fetch(`${BASE}/${feed}/rssnewsfeed.xml`, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" } });
    // A feed the publisher removed is skipped with a warning; any other failure stops the crawl.
    if (res.status === 404) {
      console.warn(`feed ${feed} no longer exists`);
      return { grants: [], raws: [], next: String(i + 1) };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for feed ${feed}`);
    const items = parseRss(await res.text());
    const grants = items.map(normalize);
    return { grants, raws: items.map((it, k) => ({ source_id: grants[k]!.source_id, payload: it })), next: i + 1 < FEEDS.length ? String(i + 1) : null };
  },
};
