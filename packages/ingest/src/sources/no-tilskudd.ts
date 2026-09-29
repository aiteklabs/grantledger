import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Norway, Tilskudd.no (Lotteri- og stiftelsestilsynet): register of state grant schemes open to voluntary and
// non-profit organisations. The list comes from the site's GraphQL proxy, which only accepts the exact documents
// the front end ships (any other text answers "Operation not allowed"); the scheme pages are server-rendered
// Next.js pages whose __NEXT_DATA__ carries the full published version (owner ministry, amount, deadlines, texts).
const SITE = "https://www.tilskudd.no";
const HOST = "https://tilskudd.lottstift.no";
const GRAPHQL = `${HOST}/api/proxy/graphql`;
const LICENSE = "Tilskudd.no public register of state grant schemes (Lotteri- og stiftelsestilsynet)";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7" };
// The register holds about 165 schemes; one request lists them all, then PAGE_SIZE scheme pages are read per page.
const MAX_SCHEMES = 1000;
const PAGE_SIZE = 20;

// Verbatim copy of the front end's GrantSearch document, fragments included: the proxy allowlists it by content,
// so the whitespace matters (each part is wrapped the way graphql-codegen did it).
const gql = (body: string) => `\n    ${body}\n    `;
const SEARCH_QUERY = gql(`query GrantSearch($filters: [GrantFilterInput!]!, $sortKey: GrantSortKey, $sortOrder: SortOrder, $query: String!, $first: Int, $after: Int) {
  grantSchemeSearch(
    searchQuery: $query
    filters: $filters
    after: $after
    first: $first
    sortKey: $sortKey
    order: $sortOrder
  ) {
    pageInfo {
      ...PageInfo
    }
    edges {
      ...GrantEdge
    }
  }
}`) + [
  gql(`fragment PageInfo on PageInfo {
  startCursor
  endCursor
  hasNextPage
  hasPreviousPage
  totalEdgeCount
}`),
  gql(`fragment GrantEdge on GrantEdge {
  score
  cursor
  highlights {
    ...Highlight
  }
  node {
    ...GrantSchemeSearchItem
  }
}`),
  gql(`fragment Highlight on Highlight {
  field
  texts
}`),
  gql(`fragment GrantSchemeSearchItem on GrantSchemeVersion {
  __typename
  administratorGrantLink
  applicationSchemaLink
  rulesLink
  id
  title
  description
  administrator {
    ...Administrator
  }
  deadlineType
  currentDeadline
  grantTypes {
    value
    uuid
  }
}`),
  gql(`fragment Administrator on Administrator {
  orgId
  name
  shortName
  link
}`),
].join("\n");
const SEARCH_FILTERS = [
  { key: "ADMINISTRATOR", value: [] },
  { key: "GRANT_TYPE", value: [] },
  { key: "REQUIRES_NON_PROFIT", value: [] },
  { key: "SUBJECT", value: [] },
];

interface Org { orgId?: string; name?: string; shortName?: string | null; link?: string | null }
interface SearchItem {
  id: number;
  title: string;
  description?: string | null;
  administrator?: Org | null;
  deadlineType?: string | null;
  currentDeadline?: string | null;
  grantTypes?: { value?: string }[] | null;
  administratorGrantLink?: string | null;
  applicationSchemaLink?: string | null;
  rulesLink?: string | null;
}
interface SearchResponse {
  data?: { grantSchemeSearch?: { pageInfo?: { totalEdgeCount?: number }; edges?: { cursor: string; node: SearchItem }[] } };
  errors?: { message?: string }[];
}
// pageProps.grant.grantScheme.year.publishedVersion on the scheme page.
interface PublishedVersion extends SearchItem {
  year?: number;
  updated?: string | null;
  owner?: Org | null;
  objectives?: string | null;
  amount?: number | null;
  amountType?: string | null;
  deadlines?: string[] | null;
  requiresNonProfit?: boolean | null;
  relevantApplicant?: string | null;
  relevantApplicants?: { value?: string }[] | null;
  usableGrantArea?: string | null;
  howToApply?: string | null;
}
interface SchemePage { props?: { pageProps?: { grant?: { grantScheme?: { completed?: boolean; year?: { updated?: string | null; publishedVersion?: PublishedVersion | null } | null } | null } | null } } }

// The scheme id is the numeric id zero-padded to four digits, as the site's createDtId does.
function dtId(id: number): string {
  return `DT-${String(id).padStart(4, "0")}`;
}

// Long texts are stored as Draft.js raw content ({"blocks":[{"text":...}]}); older records hold plain text.
function draftText(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { blocks?: { text?: string }[] };
    if (parsed && Array.isArray(parsed.blocks)) return parsed.blocks.map((b) => (b.text ?? "").trim()).filter(Boolean).join("\n");
  } catch {
    // Not JSON: plain text as published.
  }
  return stripHtml(value);
}

function dayEnd(date: string): string {
  return `${date}T23:59:59.000Z`;
}

async function fetchScheme(id: number): Promise<{ version: PublishedVersion | null; completed: boolean; updated: string | null }> {
  const html = await fetchHtml(`${HOST}/ordning/${dtId(id)}`, UA);
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const scheme = json ? (JSON.parse(json) as SchemePage).props?.pageProps?.grant?.grantScheme : null;
  return { version: scheme?.year?.publishedVersion ?? null, completed: scheme?.completed ?? false, updated: scheme?.year?.updated ?? null };
}

function normalize(item: SearchItem, detail: Awaited<ReturnType<typeof fetchScheme>>): Grant {
  const v: PublishedVersion = detail.version ?? item;
  const today = new Date().toISOString().slice(0, 10);
  const deadlines = [...new Set([...(v.deadlines ?? []), ...(v.currentDeadline ? [v.currentDeadline] : [])])].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  // Next deadline still ahead, else the last one published (already past, so the status says closed).
  const deadline = deadlines.find((d) => d >= today) ?? deadlines[deadlines.length - 1] ?? null;
  const closes = deadline ? dayEnd(deadline) : null;
  const rolling = v.deadlineType === "NO_DEADLINE";
  const currentYear = Number(today.slice(0, 4));
  const stale = v.year !== undefined && v.year < currentYear;
  const status: Grant["status"] = detail.completed ? "closed" : closes ? statusFromDates(null, closes) : rolling && !stale ? "open" : "unknown";
  // relevantApplicants is a fixed vocabulary (Ideelle og frivillige organisasjoner, Kommuner, Fylkeskommuner,
  // Kommunale foretak, Statsforvaltningen, Private foretak, Finansielle foretak, Personlig næringsdrivende).
  const applicants = (v.relevantApplicants ?? []).map((a) => a.value ?? "").filter(Boolean);
  const who = applicants.join(" ").toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>(["ngo"]);
  if (/kommun|fylke|statsforvaltning/.test(who)) bens.add("public_body");
  if (/foretak/.test(who)) bens.add("company");
  if (/næringsdrivende/.test(who)) bens.add("individual");
  const owner = v.owner?.name ?? "";
  const administrator = v.administrator?.name ?? "";
  const summary = [
    stripHtml(v.description ?? ""),
    draftText(v.objectives) && `Formål: ${draftText(v.objectives)}`,
    (applicants.length || draftText(v.relevantApplicant)) && `Hvem kan søke: ${[applicants.join(", "), draftText(v.relevantApplicant)].filter(Boolean).join("\n")}`,
    v.requiresNonProfit ? "Krever registrering i Frivillighetsregisteret." : "",
    draftText(v.usableGrantArea) && `Hva kan det søkes om: ${draftText(v.usableGrantArea)}`,
    (v.grantTypes ?? []).length ? `Tilskuddstype: ${(v.grantTypes ?? []).map((t) => t.value).filter(Boolean).join(", ")}` : "",
    rolling ? "Søknadsfrist: løpende" : deadlines.length ? `Søknadsfrist: ${deadlines.join(", ")}` : "",
    v.amountType === "AMOUNT" && v.amount ? `Beløp${v.year ? ` ${v.year}` : ""}: ${String(v.amount).replace(/\B(?=(\d{3})+$)/g, " ")} kroner` : "",
    administrator ? `Tilskuddsforvalter: ${administrator}` : "",
    owner ? `Departement: ${owner}` : "",
    v.administratorGrantLink ? `Mer informasjon: ${v.administratorGrantLink}` : "",
    v.applicationSchemaLink ? `Søknad: ${v.applicationSchemaLink}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    id: `no_tilskudd:${dtId(item.id)}`,
    source: "no_tilskudd",
    source_id: dtId(item.id),
    source_url: `${SITE}/ordning/${dtId(item.id)}`,
    source_license: LICENSE,
    title: stripHtml(v.title || item.title),
    title_lang: "no",
    summary: summary || null,
    funder_name: administrator || owner || "Lotteri- og stiftelsestilsynet",
    funder_level: "national",
    country: "NO",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: v.amountType === "AMOUNT" && v.amount ? v.amount : null,
    currency: "NOK",
    status,
    opens_at: null,
    closes_at: closes,
    documents: [],
    source_updated_at: v.updated ?? detail.updated ?? null,
  };
}

export const noTilskudd: Source = {
  id: "no_tilskudd",
  license: LICENSE,
  start() {
    // Offset into the full scheme list sorted by id; relevance order from the search is not stable between calls.
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const offset = Number(cursor);
    const res = await fetch(GRAPHQL, {
      method: "POST",
      headers: { ...UA, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        operationName: "GrantSearch",
        query: SEARCH_QUERY,
        variables: { filters: SEARCH_FILTERS, sortKey: "RELEVANCE", sortOrder: "DESC", query: "", first: MAX_SCHEMES, after: null },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Tilskudd.no search`);
    const data = (await res.json()) as SearchResponse;
    if (data.errors?.length) throw new Error(`Tilskudd.no search: ${data.errors[0]?.message ?? "GraphQL error"}`);
    const all = (data.data?.grantSchemeSearch?.edges ?? []).map((e) => e.node).sort((a, b) => a.id - b.id);
    if (all.length === 0) throw new Error("Tilskudd.no search returned no schemes");
    const items = all.slice(offset, offset + PAGE_SIZE);
    const details = await mapLimit(items, 4, (item) => fetchScheme(item.id));
    const grants = items.map((item, i) => normalize(item, details[i]!));
    const raws = items.map((item, i) => ({ source_id: dtId(item.id), payload: { search: item, scheme: details[i]!.version } }));
    return { grants, raws, next: offset + PAGE_SIZE < all.length ? String(offset + PAGE_SIZE) : null };
  },
};
