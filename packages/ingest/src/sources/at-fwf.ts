import type { Grant } from "@grantledger/schema";
import { fetchHtml, fetchJson, mapLimit, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Austria, FWF (Austrian Science Fund): the funding portfolio page fills itself from the site's Solr search endpoint
// (/en/search.json, type:programs). One document per programme with submission window, status and volume; the
// programme page adds target group, requirements and amounts for the summary.
const SITE = "https://www.fwf.ac.at";
const LICENSE = "FWF public funding programme information";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/json", "accept-language": "en,de;q=0.8" };
const PER_PAGE = 20;

interface SolrDoc {
  uid: number;
  title: string;
  url: string;
  programKeywords_textS?: string;
  programVolume_stringS?: string;
  programSubmissionStatus_stringS?: string;
  programSubmissionStatusLong_stringS?: string;
  programCareerLevels_stringS?: string;
  programStartTimestamp_intS?: number;
  programEndTimestamp_intS?: number;
  category?: string[];
  indexed?: string;
}

interface SolrPage { documents: SolrDoc[]; currentPage: number; lastPage: number }

function listUrl(page: number): string {
  const q = new URLSearchParams({ "tx_solr[q]": "*", "tx_solr[filter][]": "type:programs", "tx_solr[sort]": "rootlineSorting asc", "tx_solr[perPage]": String(PER_PAGE), "tx_solr[page]": String(page) });
  return `${SITE}/en/search.json?${q}`;
}

// Programme text sits between the teaser paragraph and the side column; the side column repeats the submission
// window and lists contacts and documents, which the summary does not need.
async function programmeText(url: string): Promise<string> {
  try {
    const html = await fetchHtml(url, UA);
    const from = html.indexOf('<p class="teaser">');
    const to = html.indexOf('<div class="side-column', from);
    if (from === -1 || to === -1) return "";
    return stripHtml(html.slice(from, to)).slice(0, 4000);
  } catch {
    return "";
  }
}

// "€35 million", "€2.5 million", "€3 to 9 million for 60 months", "€175.000", "€100,000".
function volume(v: string): { min: number | null; max: number | null } {
  const m = v.match(/€\s*([\d.,]+)(?:\s*(?:to|-|–)\s*([\d.,]+))?\s*(million)?/i);
  if (!m) return { min: null, max: null };
  const parse = (s: string) => (m[3] ? Number(s.replace(",", ".")) * 1e6 : Number(s.replace(/[.,]/g, "")));
  const a = parse(m[1] as string);
  const b = m[2] ? parse(m[2]) : NaN;
  if (!Number.isFinite(a)) return { min: null, max: null };
  return Number.isFinite(b) ? { min: a, max: b } : { min: null, max: a };
}

function normalize(d: SolrDoc, text: string): Grant {
  const opens = d.programStartTimestamp_intS ? new Date(d.programStartTimestamp_intS * 1000).toISOString() : null;
  const closes = d.programEndTimestamp_intS ? new Date(d.programEndTimestamp_intS * 1000).toISOString() : null;
  const submissions = d.programSubmissionStatusLong_stringS || d.programSubmissionStatus_stringS || "";
  // "Rolling" has no dates; "Currently no submissions" keeps the last window's dates; "Program-specific" says nothing.
  const status: Grant["status"] = /rolling/i.test(submissions) ? "open" : /no submissions/i.test(submissions) ? (opens && opens > new Date().toISOString() ? "forthcoming" : "closed") : /program-specific/i.test(submissions) ? "unknown" : statusFromDates(opens, closes);
  const { min, max } = volume(d.programVolume_stringS ?? "");
  const summary = [
    d.programKeywords_textS ?? "",
    `Submissions: ${submissions}`,
    d.programVolume_stringS ? `Funding volume: ${d.programVolume_stringS}` : "",
    d.programCareerLevels_stringS ? `Career stage: ${d.programCareerLevels_stringS}` : "",
    text,
  ].filter(Boolean).join("\n\n");
  return {
    id: `at_fwf:${d.uid}`,
    source: "at_fwf",
    source_id: String(d.uid),
    source_url: d.url,
    source_license: LICENSE,
    title: d.title,
    title_lang: "en",
    summary,
    funder_name: "FWF",
    funder_level: "national",
    country: "AT",
    regions: [],
    funding_types: /award/i.test(d.title) ? ["grant", "prize"] : ["grant"],
    beneficiary_types: ["research_org", "individual"],
    sectors: [],
    amount_min: min,
    amount_max: max,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: d.indexed ?? null,
  };
}

export const atFwf: Source = {
  id: "at_fwf",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetchJson<SolrPage>(listUrl(page), { headers: UA });
    const docs = res.documents.filter((d) => d.uid && d.url);
    const texts = await mapLimit(docs, 4, (d) => programmeText(d.url));
    const grants = docs.map((d, i) => normalize(d, texts[i] ?? ""));
    return { grants, raws: docs.map((d) => ({ source_id: String(d.uid), payload: d })), next: res.currentPage < res.lastPage ? String(page + 1) : null };
  },
};
