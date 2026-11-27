import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Germany, Deutsche Stiftung für Engagement und Ehrenamt (DSEE): the foundation's funding database for non-profits
// and volunteering ("Förderdatenbank"), a register of about 1,375 programmes of third parties (foundations, Länder,
// federal bodies, lotteries). Craft CMS, server-rendered list sorted by name, 25 cards per page (/p2 to /p55).
// Records are built from the list cards only: title, funder, Länder and the teaser. The deadline ("Bewerbungsfrist",
// about three quarters say "Fortlaufende Förderung"), the maximum sum and the link to the funder's own programme page
// are only on the detail pages, and 1,375 detail requests per night are too many for this site. So every programme
// the register lists is open without a deadline, and source_url (the DSEE detail page) carries the rest.
// A full crawl is about 55 requests, five list pages per fetchPage call. The site has no robots.txt (404) and the
// imprint sets no terms of use.
const SITE = "https://foerderdatenbank.d-s-e-e.de";
const LICENSE = "DSEE Förderdatenbank public programme register (Deutsche Stiftung für Engagement und Ehrenamt)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PAGES_PER_CALL = 5;
// NUTS 1 codes of the Länder as the cards name them ("In Bayern"); "Bundesweit" is nationwide.
const LAENDER: Record<string, string> = {
  "Baden-Württemberg": "DE1", Bayern: "DE2", Berlin: "DE3", Brandenburg: "DE4", Bremen: "DE5", Hamburg: "DE6", Hessen: "DE7", "Mecklenburg-Vorpommern": "DE8",
  Niedersachsen: "DE9", "Nordrhein-Westfalen": "DEA", "Rheinland-Pfalz": "DEB", Saarland: "DEC", Sachsen: "DED", "Sachsen-Anhalt": "DEE", "Schleswig-Holstein": "DEF", Thüringen: "DEG",
};

interface Card { slug: string; title: string; funder: string; tags: string[]; teaser: string }

const clean = (s: string) => stripHtml(s).replace(/\xa0/g, " ").replace(/\s+/g, " ").trim();

function parseList(html: string): { cards: Card[]; last: number } {
  const cards: Card[] = [];
  for (const block of html.split('<div class="px-5 py-3 border-2 rounded-lg mb-8').slice(1)) {
    const slug = block.match(/href="https:\/\/foerderdatenbank\.d-s-e-e\.de\/foerderprogramme\/([^"/]+)"/)?.[1];
    const title = clean(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "");
    if (!slug || !title) continue;
    cards.push({
      slug,
      title,
      funder: clean(block.match(/\/institutionen\/[^"]+"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ""),
      tags: [...block.matchAll(/bg-gray-200">([^<]*)<\/div>/g)].map((m) => clean(m[1] as string)),
      teaser: clean(block.match(/<p class="mt-3 mb-4 text-lg">([\s\S]*?)<\/p>/)?.[1] ?? ""),
    });
  }
  return { cards, last: Number(html.match(/Seite \d+ von (\d+)/)?.[1] ?? 1) };
}

function normalize(c: Card): Grant {
  const lands = c.tags.map((t) => t.replace(/^In /, "")).filter((t) => t !== "Bundesweit");
  const nationwide = lands.length === 0;
  const summary = [
    c.funder && `Förderer: ${c.funder}`,
    c.tags.length && `Region: ${nationwide ? "Bundesweit" : lands.join(", ")}`,
    c.teaser,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    id: `de_dsee:${c.slug}`,
    source: "de_dsee",
    source_id: c.slug,
    source_url: `${SITE}/foerderprogramme/${c.slug}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: "de",
    summary: summary || null,
    funder_name: c.funder || null,
    funder_level: nationwide ? "national" : "regional",
    country: "DE",
    regions: lands.map((l) => LAENDER[l] ?? l),
    funding_types: ["grant"],
    beneficiary_types: ["ngo"],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: "open",
    opens_at: null,
    closes_at: null,
    documents: [],
    source_updated_at: null,
  };
}

const pageUrl = (n: number) => (n === 1 ? `${SITE}/` : `${SITE}/p${n}`);

export const deDsee: Source = {
  id: "de_dsee",
  license: LICENSE,
  start() {
    return "1";
  },
  // Cursor = number of the first list page of the next batch.
  async fetchPage(cursor): Promise<Page> {
    const from = Number(cursor);
    const first = parseList(await fetchHtml(pageUrl(from), UA));
    if (first.cards.length === 0) throw new Error(`DSEE Förderdatenbank list page ${from} returned no cards (bot challenge or layout change?)`);
    const to = Math.min(from + PAGES_PER_CALL - 1, first.last);
    const numbers = Array.from({ length: to - from }, (_, i) => from + 1 + i);
    const rest = await mapLimit(numbers, 2, async (n) => {
      const page = parseList(await fetchHtml(pageUrl(n), UA));
      if (page.cards.length === 0) throw new Error(`DSEE Förderdatenbank list page ${n} returned no cards`);
      return page.cards;
    });
    const seen = new Set<string>();
    const cards = [...first.cards, ...rest.flat()].filter((c) => !seen.has(c.slug) && seen.add(c.slug));
    return {
      grants: cards.map(normalize),
      raws: cards.map((c) => ({ source_id: c.slug, payload: c })),
      next: to < first.last ? String(to + 1) : null,
    };
  },
};
