import type { Grant } from "@grantledger/schema";
import { fetchJson, londonIso, mapLimit, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Italy, Fondazione Con il Sud: calls ("bandi" and "iniziative") of the private foundation that funds third-sector
// organisations in southern Italy. The archive page is a FacetWP list rendered on the server; the facet
// ?_stato_bando=false returns the calls "In corso" (3 of 97 on 2026-11-14) with Risorse and Scadenza on the card.
// The WordPress REST API (/wp-json/wp/v2/bando) has no status (the stato_bando taxonomy is empty) and its content is
// raw page-builder shortcodes, so it is only asked for the modification time and the territory terms of the open
// calls; the text and the documents come from the call pages. One fetchPage does the whole crawl: 2 requests plus one
// per open call.
const SITE = "https://www.fondazioneconilsud.it";
const LIST = `${SITE}/bandi/?_stato_bando=false`;
const LICENSE = "Fondazione Con il Sud public call information (fondazioneconilsud.it)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
// NUTS 2 codes of the regions the foundation works in, keyed by the slug of its "territorio" terms.
const NUTS: Record<string, string> = { abruzzo: "ITF1", molise: "ITF2", campania: "ITF3", puglia: "ITF4", basilicata: "ITF5", calabria: "ITF6", sicilia: "ITG1", sardegna: "ITG2" };
const DEFAULT_REGIONS = ["ITF3", "ITF4", "ITF5", "ITF6", "ITG1", "ITG2"];

interface Card { id: string; url: string; title: string; area: string; resources: string; deadline: string }
interface Post { id: number; modified_gmt?: string; class_list?: string[] | Record<string, string> }

const plain = (html: string | undefined) => (html ? stripHtml(html).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() : "");

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseList(html: string): Card[] {
  const cards: Card[] = [];
  for (const a of html.match(/<article class="bando-card[^"]*"[^>]*data-bando-id="\d+"[\s\S]*?<\/article>/g) ?? []) {
    const link = a.match(/<h3 class="bando-card__title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || !/bando-status--in-corso/.test(a)) continue;
    const meta = (label: string) => plain(a.match(new RegExp(`bando-metaLabel">${label}:</span>\\s*<span class="bando-metaValue">([\\s\\S]*?)</span>`))?.[1]);
    cards.push({ id: a.match(/data-bando-id="(\d+)"/)?.[1] as string, url: link[1] as string, title: plain(link[2]), area: plain(a.match(/bando-badge--pill">([\s\S]*?)<\/span>/)?.[1]), resources: meta("Risorse"), deadline: meta("Scadenza") });
  }
  return cards;
}

// "euro 7.490.079,22", "€ 5.000.000", "343.423,56 euro", "19.5 milioni di euro", "500 mila euro". An amount spelled
// across words ("un milione 242 mila euro", "2 milioni 125.363,20 euro") is left out rather than read wrong.
function amount(text: string): number | null {
  const full = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?`;
  const m = text.match(new RegExp(`(?:euro|€)\\s*(${full})(?!\\s*(?:mila|milion|miliard))|(${full})\\s*(?:euro|€)|(\\d+(?:[.,]\\d{1,2})?)\\s*(mila|milion[ei]|miliard[oi])\\s*(?:di\\s*)?(?:euro|€)`, "i"));
  if (!m || /(?:milion[ei]|miliard[oi])\s*(?:e\s*)?$/i.test(text.slice(0, m.index))) return null;
  const unit = (m[4] ?? "").toLowerCase();
  const n = m[3] ? Number(m[3].replace(",", ".")) * (unit.startsWith("milia") ? 1e9 : unit.startsWith("milion") ? 1e6 : 1e3) : Number((m[1] ?? m[2] ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 1000 ? Math.round(n) : null;
}

function normalize(card: Card, post: Post | undefined, html: string): Grant {
  const title = plain(html.match(/<h1 class="bando-detail__title">([\s\S]*?)<\/h1>/)?.[1]) || card.title;
  const bodyHtml = (html.match(/<div class="bando-detail__body">([\s\S]*?)<\/div><!-- \/\.container\.bando-detail -->/)?.[1] ?? "").replace(/<div\s+class="bando-infobox"[\s\S]*?<\/button>\s*<\/div>/, " ");
  const body = plain(bodyHtml);
  // "10/12/2026": the end of that day in Italy (one hour ahead of London all year).
  const d = card.deadline.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const closes = d ? londonIso(Number(d[3]), Number(d[2]) - 1, Number(d[1]), 22, 59) : null;
  const documents: Grant["documents"] = [];
  for (const m of bodyHtml.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = (m[1] as string).replace(/&amp;/g, "&").replace(/^http:\/\/(www\.)?fondazioneconilsud\.it/, SITE);
    if (/^https:\/\/\S+\/wp-content\/uploads\/\S+$/.test(url) && !documents.some((x) => x.url === url)) documents.push({ title: plain(m[2]) || "Documento", url });
  }
  const classes = Object.values(post?.class_list ?? {});
  const territories = classes.filter((c) => c.startsWith("territorio-")).map((c) => c.slice("territorio-".length));
  const regions = territories.map((t) => NUTS[t]).filter((r): r is string => !!r).sort();
  const max = body.match(/(?:contributo|importo|finanziamento) massimo (?:di|pari a)[^.]{0,60}/i)?.[0];
  const summary = [
    body,
    card.area && `Area tematica: ${card.area}`,
    territories.length > 0 && `Territorio: ${territories.join(", ")}`,
    card.resources && `Risorse: ${card.resources}`,
    "Stato: In corso",
    card.deadline && `Scadenza: ${card.deadline}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `it_con_il_sud:${card.id}`,
    source: "it_con_il_sud",
    source_id: card.id,
    source_url: card.url,
    source_license: LICENSE,
    title,
    title_lang: "it",
    summary: summary || null,
    funder_name: "Fondazione Con il Sud",
    funder_level: "regional",
    country: "IT",
    regions: regions.length > 0 ? regions : DEFAULT_REGIONS,
    funding_types: ["grant"],
    beneficiary_types: ["ngo"],
    sectors: card.area ? [card.area] : [],
    amount_min: null,
    amount_max: max ? amount(max) : null,
    budget_total: amount(card.resources),
    currency: "EUR",
    status: "open",
    opens_at: null,
    closes_at: closes,
    documents,
    source_updated_at: toIso(post?.modified_gmt ? `${post.modified_gmt}Z` : null),
  };
}

export const itConIlSud: Source = {
  id: "it_con_il_sud",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(): Promise<Page> {
    const cards = parseList(await get(LIST)).filter((c) => /^https:\/\//.test(c.url));
    // The foundation always has its two permanent schemes open, so an empty list means a problem.
    if (cards.length === 0) throw new Error("Fondazione Con il Sud returned no open calls (bot challenge or changed markup?)");
    const posts = await fetchJson<Post[]>(`${SITE}/wp-json/wp/v2/bando?per_page=100&include=${cards.map((c) => c.id).join(",")}&_fields=id,modified_gmt,class_list`, { headers: UA });
    const byId = new Map(posts.map((p) => [String(p.id), p]));
    const pages = await mapLimit(cards, 2, (c) => get(c.url));
    const grants = cards.map((c, i) => normalize(c, byId.get(c.id), pages[i] as string));
    return { grants, raws: grants.map((g, i) => ({ source_id: g.source_id, payload: { card: cards[i], summary: g.summary } })), next: null };
  },
};
