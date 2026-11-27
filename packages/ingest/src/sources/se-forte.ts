import type { Grant } from "@grantledger/schema";
import { mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Sweden, Forte (Swedish Research Council for Health, Working Life and Welfare): calls ("utlysningar").
// The calls page is a Sitevision web app ("opencalls"). Its filter requests go to the app route
// /appresource/<page id>/<portlet id>/filter?startPagination=<n>&status=<status>, which answers JSON: 10 articles
// per page with url, title, preamble, status, the printed dates and real UTC timestamps. The two ids are read from
// the calls page at the start of each crawl (they change when the page is rebuilt). Statuses are read in turn:
// Öppen and Kommande with the call page (quick facts, purpose, eligibility), Stängd from the list alone; the decided
// calls (Beslutad, Projektstart) are not read.
const SITE = "https://forte.se";
const LIST_URL = `${SITE}/sok-finansiering/utlysningar`;
const LICENSE = "Forte public call information (forte.se)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", "accept-language": "sv-SE,sv;q=0.9,en;q=0.8" };
const STATUSES = ["Öppen", "Kommande", "Stängd"] as const;
const PAGE_SIZE = 10;
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

interface Cursor { route: string; status: number; page: number }

interface Article {
  url: string;
  title: string;
  preamble?: string;
  status?: string;
  opens?: string;
  closes?: string;
  decision?: string;
  projectstart?: string;
  openTs?: number;
  closeTs?: number;
}

interface Detail { facts: string; body: string; documents: Grant["documents"]; updated: string | null }

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(url, { headers: { ...UA, ...headers }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

// The app route of the calls list, from the ids in the calls page.
async function findRoute(): Promise<string> {
  const html = await (await get(LIST_URL)).text();
  const portlet = html.match(/AppRegistry\.registerInitialState\('([\d.a-f]+)',\{"articles":/)?.[1];
  const page = html.match(/\/webapp-resource\/(4\.[0-9a-f]+)\//)?.[1];
  if (!portlet || !page) throw new Error("Forte calls page no longer carries the opencalls app ids (layout change?)");
  return `/appresource/${page}/${portlet}/filter`;
}

function parseDetail(html: string): Detail {
  const start = html.indexOf('<div id="Mittenspalt">');
  const ends = ['<div id="Kontakt">', '<div id="Oversattningsinfo">', '<div id="Publiceringsdatum">', "</main>"].map((k) => html.indexOf(k, start)).filter((i) => i !== -1);
  const main = start === -1 ? "" : html.slice(start, ends.length ? Math.min(...ends) : undefined).replace(/<span class="env-assistive-text">[\s\S]*?<\/span>/g, "");
  const text = stripHtml(main).replace(/[\u00a0\r]/g, " ").replace(/[ \t]*\n\s*/g, "\n").replace(/\n(?:Visa mer|Visa mindre|Visa alla frågor och svar)(?=\n|$)/g, "").trim();
  // "Snabbfakta" (what, who, how much) opens the column; the long sections follow from "Om bidraget".
  const split = text.indexOf("\nOm bidraget\n");
  const documents: Grant["documents"] = [];
  for (const m of main.matchAll(/<a[^>]+href="((?:https:\/\/forte\.se)?\/download\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = (m[1] as string).startsWith("/") ? `${SITE}${m[1]}` : (m[1] as string);
    const title = stripHtml(m[2] as string).replace(/\s+/g, " ");
    if (title && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  const updated = html.match(/Senast uppdaterad:<\/span>\s*(\d{1,2}) ([a-zåäö]+) (\d{4})/);
  const month = updated ? MONTHS.indexOf(updated[2] as string) + 1 : 0;
  return {
    facts: split === -1 ? text : text.slice(0, split).replace(/^Snabbfakta\n/, ""),
    body: split === -1 ? "" : text.slice(split + 1),
    documents,
    updated: updated && month ? `${updated[3]}-${String(month).padStart(2, "0")}-${(updated[1] as string).padStart(2, "0")}T00:00:00.000Z` : null,
  };
}

// The timestamps are exact for a printed day ("2 december 2026, kl 14.00") but point at the middle of the month when
// only a month is announced ("mars 2027"); those stay in the text and out of the date fields.
function instant(printed: string | undefined, ts: number | undefined): string | null {
  return ts && /^\s*\d{1,2}\s/.test(printed ?? "") ? new Date(ts).toISOString() : null;
}

// "inget maxbelopp ... riktmärke är 6,5 miljoner kronor", "högst 5 miljoner kronor": the largest amount in kronor
// in the "how much" quick fact.
function maxAmount(facts: string): number | null {
  const part = facts.match(/Hur mycket[^\n]*\n([^\n]*)/)?.[1] ?? "";
  const values = [...part.matchAll(/(\d+(?:,\d+)?)\s+miljon(?:er)?\s+kronor/g)].map((m) => Math.round(Number((m[1] as string).replace(",", ".")) * 1_000_000));
  for (const m of part.matchAll(/(\d{1,3}(?:[ \u00a0]\d{3})+)\s+kronor/g)) values.push(Number((m[1] as string).replace(/[ \u00a0]/g, "")));
  return values.length ? Math.max(...values) : null;
}

function normalize(a: Article, d: Detail | null): Grant {
  const slug = a.url.replace(/\/+$/, "").split("/").pop() as string;
  const opens = instant(a.opens, a.openTs);
  const closes = instant(a.closes, a.closeTs);
  // "Omkring 120 miljoner kronor avsätts ...", "Total budget för utlysningen är cirka 300 miljoner kronor."
  const budget = `${a.preamble ?? ""}\n${d?.facts ?? ""}\n${d?.body ?? ""}`.match(/(?:(\d+(?:,\d+)?)\s+miljon(?:er)?\s+kronor\s+(?:avsätts|avsatt)|budget för utlysningen är (?:cirka |omkring )?(\d+(?:,\d+)?)\s+miljon)/);
  const summary = [
    a.preamble?.trim(),
    a.status && `Status: ${a.status}`,
    a.opens && `Öppnar: ${a.opens.trim()}`,
    a.closes && `Stänger: ${a.closes.trim()}`,
    a.decision && `Beslut: ${a.decision.trim()}`,
    a.projectstart && `Projektstart: ${a.projectstart.trim()}`,
    d?.facts,
    d?.body,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `se_forte:${slug}`,
    source: "se_forte",
    source_id: slug,
    source_url: `${SITE}${a.url}`,
    source_license: LICENSE,
    title: a.title.trim(),
    title_lang: "sv",
    summary: summary || null,
    funder_name: "Forte",
    funder_level: "national",
    country: "SE",
    regions: [],
    funding_types: ["grant"],
    // Forte funds research: the main applicant is a researcher, the grant is administered by a research organisation.
    beneficiary_types: ["research_org"],
    sectors: [],
    amount_min: null,
    amount_max: d ? maxAmount(d.facts) : null,
    budget_total: budget ? Math.round(Number((budget[1] ?? budget[2] as string).replace(",", ".")) * 1_000_000) : null,
    currency: "SEK",
    status: a.status === "Öppen" ? "open" : a.status === "Kommande" ? "forthcoming" : "closed",
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: d?.updated ?? null,
  };
}

export const seForte: Source = {
  id: "se_forte",
  license: LICENSE,
  start() {
    return "start";
  },
  async fetchPage(cursor): Promise<Page> {
    const c: Cursor = cursor === "start" ? { route: await findRoute(), status: 0, page: 1 } : (JSON.parse(cursor) as Cursor);
    const status = STATUSES[c.status] as string;
    const url = `${SITE}${c.route}?startPagination=${c.page}&status=${encodeURIComponent(status)}`;
    const res = await get(url, { accept: "application/json", "x-requested-with": "XMLHttpRequest" });
    const data = (await res.json().catch(() => null)) as { articles?: Article[]; totalNrArticles?: number; articleStatuses?: { open?: number; coming?: number } } | null;
    if (!data || !Array.isArray(data.articles)) throw new Error(`Forte calls route did not answer JSON (${url})`);
    const articles = data.articles.filter((a) => a.url && a.title && a.status === status);
    const details = status === "Stängd" ? articles.map(() => null) : await mapLimit(articles, 2, async (a) => parseDetail(await (await get(`${SITE}${a.url}`)).text()));
    const grants = articles.map((a, i) => normalize(a, details[i] ?? null));
    // Closed calls: the first page only (the newest), older ones are long past.
    const more = status !== "Stängd" && articles.length > 0 && c.page * PAGE_SIZE < (data.totalNrArticles ?? 0);
    const next: Cursor | null = more ? { ...c, page: c.page + 1 } : c.status + 1 < STATUSES.length ? { route: c.route, status: c.status + 1, page: 1 } : null;
    return {
      grants,
      raws: articles.map((a, i) => ({ source_id: grants[i]!.source_id, payload: { article: a, detail: details[i] ?? null } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
