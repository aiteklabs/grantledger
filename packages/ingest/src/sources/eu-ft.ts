import type { Grant } from "@grantledger/schema";
import { fetchJson, num, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// EU Funding & Tenders Portal SEARCH API. Public key "SEDIA", multipart POST, JSON parts.
// Do not send a "sort" part: it silently replaces the query and returns FAQ pages.
// type 1 = topics (grants), type 2 = calls published by EuropeAid / prospect (grants or procurement).
const ENDPOINT = "https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***";
const PAGE_SIZE = 100;
const LICENSE = "European Commission reuse policy, Decision 2011/833/EU";

// status codes seen in the API
const STATUS: Record<string, Grant["status"]> = {
  "31094501": "forthcoming",
  "31094502": "open",
  "31094503": "closed",
  "310945031": "closed",
  "99999998": "closed",
};

interface EuResult {
  reference: string;
  url: string;
  summary?: string;
  language?: string;
  metadata: Record<string, string[] | undefined>;
}
interface EuResponse {
  totalResults: number;
  pageNumber: number;
  pageSize: number;
  results: EuResult[];
}

// Type of action tells who can apply when it is specific: EIC Accelerator is for single companies, MSCA and ERC are
// for researchers. The standard RIA/IA/CSA actions are left empty: the topic description says who the call targets
// (a training programme names universities, an accelerator names its operators), and enrichment reads that text.
function beneficiariesFromActions(actions: string[]): Grant["beneficiary_types"] {
  const text = actions.join(" ").toLowerCase();
  if (!text) return [];
  if (text.includes("eic accelerator")) return ["sme", "startup"];
  if (text.includes("msca") || text.includes("erc ")) return ["research_org"];
  return [];
}

// Action codes ("HORIZON-RIA", "DIGITAL-CSA", "HORIZON-EIC-ACC") from the actions JSON, for the consortium rule below.
function actionCodes(m: EuResult["metadata"]): string[] {
  try {
    const arr = JSON.parse(m.actions?.[0] ?? "[]") as { types?: { typeOfAction?: string }[] }[];
    return arr.flatMap((a) => a.types ?? []).map((t) => (t.typeOfAction ?? "").split(" ")[0]!).filter(Boolean);
  } catch {
    return [];
  }
}

// Standard consortium rule per type of action. Horizon Europe RIA and IA need at least three independent legal
// entities from three different member or associated states; EIC Accelerator, EIC equity, ERC and MSCA postdoctoral
// fellowships take a single applicant. Other actions (CSA, DIGITAL grants) vary by call and stay unset.
function consortiumFromActions(codes: string[]): Grant["consortium"] {
  if (codes.some((c) => /^HORIZON-(JU-)?(RIA|IA)$/.test(c))) return "required";
  if (codes.some((c) => /^HORIZON-(EIC-ACC|EIC-EQU|ERC|TMA-MSCA-PF)/.test(c))) return "single";
  return undefined;
}

// The same rule as a sentence for the enrichment model, since the topic page only points to the call document.
function consortiumRule(consortium: Grant["consortium"]): string {
  if (consortium === "required") return "Consortium: standard Horizon Europe rule for this type of action, at least three independent legal entities from three different member or associated states, unless the call document says otherwise.";
  if (consortium === "single") return "Consortium: not required, a single applicant applies.";
  return "";
}

// Some documents carry their keyword list as one JSON-encoded string.
function parseList(v: string): string[] {
  try {
    const arr = JSON.parse(v) as unknown;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function first(m: EuResult["metadata"], key: string): string | null {
  return m[key]?.[0] ?? null;
}

function normalize(r: EuResult): Grant {
  const m = r.metadata;
  const type = first(m, "type");
  const identifier = first(m, "identifier") ?? r.reference;
  const opens = toIso(first(m, "startDate"));
  const deadlines = (m.deadlineDate ?? []).map(toIso).filter((d): d is string => !!d).sort();
  const closes = deadlines.at(-1) ?? null;
  const isEuropeAidGrant = /\/ACT\//.test(identifier);
  const fundingTypes: Grant["funding_types"] = type === "1" || isEuropeAidGrant ? ["grant"] : ["procurement"];
  const documents = (m.publicationDocuments ?? [])
    .map((d) => { try { return JSON.parse(d) as { title?: string; url?: string }; } catch { return null; } })
    .filter((d): d is { title?: string; url?: string } => !!d?.url)
    .map((d) => ({ title: d.title ?? "document", url: d.url as string }));
  const actions = m.typesOfAction ?? [];
  const codes = actionCodes(m);
  const consortium = consortiumFromActions(codes);
  // The topic description (expected outcome, scope, who it targets) comes first: the conditions block is boilerplate
  // that points to the call document.
  const description = [
    actions.length ? `Type of action: ${actions.join(", ")}${codes.length ? ` (${codes.join(", ")})` : ""}` : "",
    consortiumRule(consortium),
    first(m, "descriptionByte"),
    first(m, "destinationDetails"),
    first(m, "topicConditions"),
  ].filter(Boolean).join("\n\n");
  return {
    id: `eu_ft:${identifier}`,
    source: "eu_ft",
    source_id: identifier,
    source_url: r.url,
    source_license: LICENSE,
    title: stripHtml(first(m, "title") || r.summary || identifier) || identifier,
    title_lang: r.language ?? "en",
    summary: description ? stripHtml(description).slice(0, 20000) : null,
    funder_name: "European Commission",
    funder_level: "supranational",
    country: "EU",
    regions: m.geographicalZones ?? [],
    funding_types: fundingTypes,
    beneficiary_types: beneficiariesFromActions(actions),
    consortium,
    // Publisher keywords plus the topic tags ("EdTech", "Startups", "General Purpose AI models"), which name the theme.
    sectors: [...new Set([...(m.keywords ?? []).flatMap((k) => (k.startsWith("[") ? parseList(k) : [k])), ...(m.tags ?? [])])].filter((k) => k !== identifier),
    amount_min: null,
    amount_max: null,
    budget_total: num(first(m, "budget")),
    currency: first(m, "currency")?.slice(0, 3) ?? null,
    status: STATUS[first(m, "status") ?? ""] ?? statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents,
    source_updated_at: toIso(first(m, "updateDate")),
  };
}

// The API refuses to page past 10,000 results, so the crawl is split into one window per start year (each well below
// that), plus one window for the few calls without a start date. Only records with an identifier are real calls;
// the index also contains ~49k FAQ and support pages without one.
interface Cursor { win: number; page: number }

function windows(): { from?: string; to?: string; noStart?: boolean }[] {
  const out: { from?: string; to?: string; noStart?: boolean }[] = [];
  // Fixed range on purpose: Date is not reliable at module scope in Workers, and 2030 leaves room for forthcoming calls.
  for (let y = 2000; y <= 2030; y++) out.push({ from: `${y}-01-01`, to: `${y + 1}-01-01` });
  out.push({ noStart: true });
  return out;
}

const WINDOWS = windows();

export const euFt: Source = {
  id: "eu_ft",
  license: LICENSE,
  start() {
    return JSON.stringify({ win: 0, page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const w = WINDOWS[c.win];
    if (!w) return { grants: [], raws: [], next: null };
    // The index holds every topic twice: a current SEDIA document and a legacy SEDIA_PRD_CENTRICITY copy with
    // stale fields. Only the SEDIA document is read, so one topic maps to exactly one record.
    const must: unknown[] = [{ terms: { type: ["1", "2"] } }, { exists: { field: "identifier" } }, { term: { DATASOURCE: "SEDIA" } }];
    if (!w.noStart) must.push({ range: { startDate: { gte: `${w.from}T00:00:00.000Z`, lt: `${w.to}T00:00:00.000Z` } } });
    const query = w.noStart ? { bool: { must, must_not: [{ exists: { field: "startDate" } }] } } : { bool: { must } };
    const form = new FormData();
    form.set("query", new Blob([JSON.stringify(query)], { type: "application/json" }));
    form.set("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));
    const data = await fetchJson<EuResponse>(`${ENDPOINT}&pageSize=${PAGE_SIZE}&pageNumber=${c.page}`, { method: "POST", body: form });
    // The index also holds FAQ and support pages; keep only topics and calls.
    const results = data.results.filter((r) => ["1", "2"].includes(r.metadata.type?.[0] ?? "") && !/\/support\//.test(r.url));
    const grants = results.map(normalize);
    const raws = results.map((r, i) => ({ source_id: grants[i]!.source_id, payload: r }));
    const seen = c.page * PAGE_SIZE;
    const more = seen < Math.min(data.totalResults, 10_000) && data.results.length > 0;
    const next: Cursor | null = more ? { win: c.win, page: c.page + 1 } : c.win + 1 < WINDOWS.length ? { win: c.win + 1, page: 1 } : null;
    return { grants, raws, next: next ? JSON.stringify(next) : null };
  },
};
