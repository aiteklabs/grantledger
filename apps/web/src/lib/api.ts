import { accountByKey, getAccount, revokedAt, type Account } from "./account";
import { emailFromAccessToken } from "./oauth";
import { isAdmin } from "./auth";
import { getFitCheck, getFitMatches, type GrantView, type SearchParams } from "./db";
import { COUNTRY_NAMES, FUNDING_TYPE_LABELS, SOURCE_NAMES, parseJson } from "./format";

// Shared by the public JSON API (/api/*.json) and the MCP endpoint (/mcp): one shape for a grant, one parser for
// search parameters, one rate limit.

export const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" };
// Browser clients send a preflight before a request with an Authorization header.
export const preflight = () => new Response(null, { status: 204, headers: { ...JSON_HEADERS, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "86400" } });

// One grant as machines see it: the ledger fields, the English summary when the enrichment made one, and the two
// links that matter (our page, the official publisher page).
export function grantJson(g: GrantView, siteUrl: string) {
  return {
    id: g.id,
    title: g.title,
    title_lang: g.title_lang,
    summary: g.summary,
    summary_en: g.e_summary_en ?? null,
    funder_name: g.funder_name,
    funder_level: g.funder_level,
    country: g.country,
    country_name: COUNTRY_NAMES[g.country] ?? g.country,
    regions: g.regions,
    funding_types: g.funding_types,
    funding_type_labels: g.funding_types.map((t) => FUNDING_TYPE_LABELS[t] ?? t),
    beneficiary_types: g.beneficiary_types,
    consortium: g.consortium,
    sectors: g.sectors,
    amount_min: g.amount_min,
    amount_max: g.amount_max,
    budget_total: g.budget_total,
    currency: g.currency,
    status: g.closes_at && g.closes_at < new Date().toISOString() && g.status !== "closed" ? "closed" : g.status,
    opens_at: g.opens_at,
    closes_at: g.closes_at,
    source: g.source,
    source_name: SOURCE_NAMES[g.source] ?? g.source,
    source_url: g.source_url,
    source_license: g.source_license,
    documents: g.documents,
    url: `${siteUrl}/grants/${encodeURI(g.id)}`,
    first_seen_at: g.first_seen_at,
    last_seen_at: g.last_seen_at,
  };
}

export type GrantJson = ReturnType<typeof grantJson>;

const SORTS = new Set(["deadline", "recent", "relevance"]);
const STATUSES = new Set(["open", "forthcoming", "closed", "current"]);

// Search parameters from a query string or a tool call. Unknown values fall back to the defaults the site uses.
// Machines get at most 100 rows per page; the HTML list keeps its own "all" option.
export function parseSearch(input: Record<string, unknown>): SearchParams {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const q = str("q") || str("query");
  const status = str("status");
  const sort = str("sort");
  const page = Number(input.page ?? 1) || 1;
  const per = Number(input.per ?? input.limit ?? 20) || 20;
  return {
    q,
    country: str("country").toUpperCase(),
    status: STATUSES.has(status) && status !== "current" ? status : "",
    type: str("type"),
    beneficiary: str("beneficiary"),
    source: str("source"),
    sort: (SORTS.has(sort) ? sort : q ? "relevance" : "deadline") as SearchParams["sort"],
    page: Math.max(1, Math.floor(page)),
    pageSize: Math.min(100, Math.max(5, Math.floor(per))),
  };
}

export const KEY_HELP = "This endpoint is for GrantLedger Pro accounts. Connect through OAuth, or take your personal link from https://grantledger.eu/assistant";

// The Pro account behind a request: an OAuth access token or the personal key as bearer, the key as ?key= or as
// the last path segment (/mcp/<key>). The admin bearer token passes too. "admin" when it is the admin, null when
// nobody.
export async function callerFromKey(request: Request, env: Parameters<typeof isAdmin>[1] & { DB: D1Database; SITE_URL: string }, pathKey?: string): Promise<Account | "admin" | null> {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const key = pathKey || bearer || new URL(request.url).searchParams.get("key") || "";
  if (key.startsWith("gl_")) return accountByKey(env.DB, key);
  if (bearer.split(".").length === 3) {
    const email = await emailFromAccessToken(env, bearer, (e) => revokedAt(env.DB, e));
    return email ? getAccount(env.DB, email) : null;
  }
  return (await isAdmin(request, env)) ? "admin" : null;
}

// 401 that points OAuth clients at the authorization server (RFC 9728) and humans at the page.
export const keyRequired = (env: { SITE_URL: string }) =>
  new Response(JSON.stringify({ error: "unauthorized", message: KEY_HELP }), { status: 401, headers: { ...JSON_HEADERS, "www-authenticate": `Bearer realm="grantledger", resource_metadata="${env.SITE_URL}/.well-known/oauth-protected-resource"` } });

// Sixty requests per minute per client IP when the binding exists (see wrangler.jsonc). Null means go ahead.
export async function rateLimited(request: Request, env: { API_RL?: RateLimit }): Promise<Response | null> {
  if (!env.API_RL) return null;
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.API_RL.limit({ key });
  if (success) return null;
  return new Response(JSON.stringify({ error: "rate_limited", message: "Too many requests. Limit: 60 per minute per client." }), { status: 429, headers: { ...JSON_HEADERS, "retry-after": "60" } });
}

// One screening result as the JSON export and the assistants see it: the confirmed form, the summary and every
// match with its rules, gaps and memo. Null when the id is unknown or the screening is not finished.
export async function fitJson(db: D1Database, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const check = await getFitCheck(db, id);
  if (!check || check.status !== "done") return null;
  const matches = await getFitMatches(db, id);
  return {
    id,
    created_at: check.created_at,
    form: parseJson(check.form, null),
    summary: parseJson(check.summary, null),
    matches: matches.map((m) => ({
      grant_id: m.grant_id,
      title: m.grant.title,
      source_url: m.grant.source_url,
      verdict: m.verdict,
      score: m.score,
      matched: parseJson(m.reasons, []),
      to_check: parseJson(m.missing, []),
      gaps: parseJson((m as { gaps?: string }).gaps ?? null, []),
      memo: parseJson((m as { memo?: string | null }).memo ?? null, null),
    })),
  };
}
