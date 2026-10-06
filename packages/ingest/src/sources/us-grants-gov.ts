import type { Grant } from "@grantledger/schema";
import { fetchJson, mapLimit, mdyToIso, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Grants.gov: search2 lists opportunities, fetchOpportunity gives amounts and eligibility.
// Detail is fetched only for forecasted/posted records to keep the crawl cheap.
const SEARCH = "https://api.grants.gov/v1/api/search2";
const DETAIL = "https://api.grants.gov/v1/api/fetchOpportunity";
const PAGE_SIZE = 100;
const LICENSE = "US Government work, public domain";

interface Hit {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;
  openDate: string;
  closeDate: string;
  oppStatus: "forecasted" | "posted" | "closed" | "archived";
  docType: string;
  cfdaList: string[];
}
interface SearchResponse {
  data: { hitCount: number; startRecord: number; oppHits: Hit[] };
}
interface Detail {
  data: {
    synopsis?: Record<string, unknown>;
    forecast?: Record<string, unknown>;
    synopsisDocumentURLs?: { fileName?: string; url?: string }[];
  };
}

const STATUS: Record<Hit["oppStatus"], Grant["status"]> = {
  forecasted: "forthcoming",
  posted: "open",
  closed: "closed",
  archived: "closed",
};

function normalize(h: Hit, detail: Detail | null): Grant {
  const syn = detail?.data.synopsis ?? detail?.data.forecast ?? {};
  const opens = mdyToIso(h.openDate);
  const closes = mdyToIso(h.closeDate);
  const applicants = ((syn.applicantTypes as { description?: string }[] | undefined) ?? []).map((a) => a.description ?? "");
  const beneficiaryTypes = new Set<Grant["beneficiary_types"][number]>();
  for (const a of applicants) {
    const s = a.toLowerCase();
    if (s.includes("small business")) beneficiaryTypes.add("sme");
    else if (s.includes("for profit") || s.includes("for-profit")) beneficiaryTypes.add("company");
    else if (s.includes("individual")) beneficiaryTypes.add("individual");
    else if (s.includes("nonprofit")) beneficiaryTypes.add("ngo");
    else if (s.includes("higher education") || s.includes("research")) beneficiaryTypes.add("research_org");
    else if (s.includes("government") || s.includes("state") || s.includes("county") || s.includes("city")) beneficiaryTypes.add("public_body");
    else beneficiaryTypes.add("other");
  }
  const instruments = ((syn.fundingInstruments as { description?: string }[] | undefined) ?? []).map((f) => (f.description ?? "").toLowerCase());
  const fundingTypes: Grant["funding_types"] = instruments.length
    ? [...new Set(instruments.map((i): Grant["funding_types"][number] => (i.includes("grant") ? "grant" : i.includes("procurement") ? "procurement" : "other")))]
    : ["grant"];
  const description = (syn.synopsisDesc ?? syn.forecastDesc ?? null) as string | null;
  return {
    id: `us_grants_gov:${h.id}`,
    source: "us_grants_gov",
    source_id: h.id,
    source_url: `https://www.grants.gov/search-results-detail/${h.id}`,
    source_license: LICENSE,
    title: stripHtml(h.title),
    title_lang: "en",
    summary: description ? stripHtml(description).slice(0, 20000) : null,
    funder_name: h.agency,
    funder_level: "national",
    country: "US",
    regions: [],
    funding_types: fundingTypes,
    beneficiary_types: [...beneficiaryTypes],
    sectors: h.cfdaList ?? [],
    amount_min: num(syn.awardFloor),
    amount_max: num(syn.awardCeiling),
    budget_total: num(syn.estimatedFunding),
    currency: "USD",
    status: STATUS[h.oppStatus] ?? statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: (detail?.data.synopsisDocumentURLs ?? [])
      .filter((d): d is { fileName?: string; url: string } => !!d.url)
      .map((d) => ({ title: d.fileName ?? "document", url: d.url })),
    source_updated_at: null,
  };
}

export const usGrantsGov: Source = {
  id: "us_grants_gov",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const startRecordNum = Number(cursor);
    const body = JSON.stringify({ rows: PAGE_SIZE, startRecordNum, oppStatuses: "forecasted|posted|closed|archived", sortBy: "openDate|desc" });
    const res = await fetchJson<SearchResponse>(SEARCH, { method: "POST", headers: { "content-type": "application/json" }, body });
    const hits = res.data.oppHits ?? [];
    const details = await mapLimit(hits, 8, async (h) =>
      h.oppStatus === "forecasted" || h.oppStatus === "posted"
        ? fetchJson<Detail>(DETAIL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunityId: Number(h.id) }) }).catch(() => null)
        : null,
    );
    const grants = hits.map((h, i) => normalize(h, details[i] ?? null));
    const raws = hits.map((h, i) => ({ source_id: h.id, payload: { hit: h, detail: details[i] ?? null } }));
    const nextStart = startRecordNum + hits.length;
    return { grants, raws, next: hits.length > 0 && nextStart < res.data.hitCount ? String(nextStart) : null };
  },
};
