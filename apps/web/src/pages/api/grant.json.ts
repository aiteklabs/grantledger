import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getGrant } from "~/lib/db";
import { JSON_HEADERS, callerFromKey, grantJson, keyRequired, preflight, rateLimited } from "~/lib/api";

export const prerender = false;

// GET /api/grant.json?id=...: one record of the ledger as JSON. Ids may contain slashes, so they travel as a query.
export const GET: APIRoute = async ({ request, url }) => {
  const limited = await rateLimited(request, env);
  if (limited) return limited;
  if (!(await callerFromKey(request, env))) return keyRequired(env);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const g = id ? await getGrant(env.DB, id) : null;
  if (!g) return new Response(JSON.stringify({ error: "not_found", message: "No grant with this id." }), { status: 404, headers: JSON_HEADERS });
  return new Response(JSON.stringify(grantJson(g, env.SITE_URL), null, 2), { headers: { ...JSON_HEADERS, "cache-control": "private, max-age=300" } });
};

export const OPTIONS: APIRoute = () => preflight();
