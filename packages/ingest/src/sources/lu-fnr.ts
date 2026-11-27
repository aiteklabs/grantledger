import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Luxembourg, Fonds National de la Recherche (FNR): the funding instruments of the national research fund. The
// theme endpoint /wp-json/fnr/funding feeds the "Funding instruments" overview and returns every instrument with
// the publisher's own status (Open or Closed), up to two deadlines, the call launch time, the career stage and the
// funding categories. An instrument is a recurring programme: "Closed" means between two calls. The programme page
// (English) adds the description and is read for open instruments only. Cloudflare sits in front of the site;
// robots.txt allows everything for general crawlers.
const API = "https://www.fnr.lu/wp-json/fnr/funding";
const LICENSE = "FNR public funding instrument information (fnr.lu)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

interface Instrument {
  id: number;
  permalink: string;
  title: string;
  categories?: { name: string }[];
  career_stage?: { label?: string } | null;
  status?: string;
  deadline?: string | null;
  deadline_2?: string | null;
  free_text_for_homepage?: string;
  free_text_for_homepage_2?: string;
  start_date?: string | null;
}

// "25-11-2026 14:00" (Luxembourg time) -> the wall-clock time with a Z suffix.
function fnrDate(value: string | null | undefined): string | null {
  const m = value?.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "23"}:${m[5] ?? "59"}:00.000Z` : null;
}

// The programme page: the subtitle under the heading and the article body, without the related news and pages.
async function detail(url: string): Promise<string> {
  const html = await fetchHtml(url, UA);
  const subtitle = stripHtml(html.match(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
  const from = html.indexOf('<div class="article-content">');
  if (from === -1) return subtitle;
  const related = html.slice(from).search(/<div class="pt-\[3rem\] pb-\[3rem\]"><h3|<div class="w-1\/3 /);
  const text = stripHtml(html.slice(from, related === -1 ? html.length : from + related).replace(/<\/t[dh]>/g, " $&")).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  return [subtitle, text].filter(Boolean).join("\n\n");
}

function normalize(x: Instrument, text: string): Grant {
  const slug = x.permalink.replace(/\/+$/, "").split("/").pop() || String(x.id);
  const d1 = fnrDate(x.deadline);
  const d2 = fnrDate(x.deadline_2);
  const closes = d1 && d2 ? (d1 > d2 ? d1 : d2) : (d1 ?? d2);
  const launch = fnrDate(x.start_date);
  const opens = launch && (!closes || launch <= closes) ? launch : null;
  const state = (x.status ?? "").trim();
  const status: Grant["status"] = /^open/i.test(state) ? "open" : /^closed/i.test(state) ? "closed" : /soon|upcoming|planned/i.test(state) ? "forthcoming" : statusFromDates(opens, closes);
  const categories = (x.categories ?? []).map((c) => decodeEntities(c.name)).join(", ");
  const note = (s: string | undefined) => (s?.trim() ? ` ${decodeEntities(s.trim())}` : "");
  const summary = [
    [
      state && `Status: ${state}`,
      x.career_stage?.label && `Career stage: ${x.career_stage.label}`,
      categories && `Funding type: ${categories}`,
      x.deadline ? `Deadline: ${x.deadline} CET${note(x.free_text_for_homepage)}` : note(x.free_text_for_homepage) && `Deadline:${note(x.free_text_for_homepage)}`,
      x.deadline_2 ? `Second deadline: ${x.deadline_2} CET${note(x.free_text_for_homepage_2)}` : note(x.free_text_for_homepage_2) && `Note:${note(x.free_text_for_homepage_2)}`,
    ].filter(Boolean).join("\n"),
    text,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `lu_fnr:${slug}`,
    source: "lu_fnr",
    source_id: slug,
    source_url: x.permalink,
    source_license: LICENSE,
    title: decodeEntities(x.title).trim(),
    title_lang: "en",
    summary: summary || null,
    funder_name: "Luxembourg National Research Fund (FNR)",
    funder_level: "national",
    country: "LU",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: ["research_org"],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const luFnr: Source = {
  id: "lu_fnr",
  license: LICENSE,
  start() {
    return "start";
  },
  async fetchPage(): Promise<Page> {
    // fetchHtml instead of fetchJson: on the local runner it falls back to curl when Cloudflare rejects fetch().
    const { fundingInstruments } = JSON.parse(await fetchHtml(API, { ...UA, accept: "application/json" })) as { fundingInstruments?: Instrument[] };
    const rows = (fundingInstruments ?? []).filter((x) => x.permalink?.startsWith("https://") && x.title).sort((a, b) => a.id - b.id);
    if (rows.length === 0) throw new Error("FNR returned no funding instruments (bot challenge or changed endpoint?)");
    const texts = await mapLimit(rows, 2, (x) => (/^open/i.test(x.status ?? "") ? detail(x.permalink).catch(() => "") : Promise.resolve("")));
    const grants = rows.map((x, i) => normalize(x, texts[i] ?? ""));
    return { grants, raws: rows.map((x, i) => ({ source_id: grants[i]!.source_id, payload: { ...x, text: texts[i] ?? "" } })), next: null };
  },
};
