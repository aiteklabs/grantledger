import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { searchGrants } from "~/lib/db";
import { JSON_HEADERS, callerFromKey, grantJson, keyRequired, parseSearch, preflight, rateLimited } from "~/lib/api";

export const prerender = false;

// GET /api/grants.json: the public ledger as JSON, same filters as /grants (q, country, status, type, beneficiary,
// source, sort, page, per). Pro key required (bearer or ?key=); 60 requests per minute per client.
export const GET: APIRoute = async ({ request, url }) => {
  const limited = await rateLimited(request, env);
  if (limited) return limited;
  if (!(await callerFromKey(request, env))) return keyRequired(env);
  const params = parseSearch(Object.fromEntries(url.searchParams));
  const result = await searchGrants(env.DB, params);
  const body = {
    total: result.total,
    page: result.page,
    per: result.pageSize,
    pages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    items: result.items.map((g) => grantJson(g, env.SITE_URL)),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { ...JSON_HEADERS, "cache-control": "private, max-age=300" } });
};

export const OPTIONS: APIRoute = () => preflight();
