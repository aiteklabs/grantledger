import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GRANTS_PER_SITEMAP, OPEN_GRANTS_WHERE, urlEntries, urlset, xmlResponse } from "~/lib/sitemap";

export const prerender = false;

// Open and forthcoming calls only. Closed calls remain crawlable through listing pages.
export const GET: APIRoute = async ({ params }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) return new Response("Not found", { status: 404 });
  // lastmod is the publisher's update date or the day the call entered the ledger, never the last crawl.
  const rows = await env.DB.prepare(`SELECT id, COALESCE(source_updated_at, first_seen_at) AS modified FROM grants WHERE ${OPEN_GRANTS_WHERE} ORDER BY id LIMIT ? OFFSET ?`).bind(GRANTS_PER_SITEMAP, (n - 1) * GRANTS_PER_SITEMAP).all<{ id: string; modified: string }>();
  if (rows.results.length === 0) return new Response("Not found", { status: 404 });
  const entries = rows.results.map((r) => urlEntries(env.SITE_URL, `/grants/${encodeURI(r.id)}`, r.modified.slice(0, 10)));
  return xmlResponse(urlset(entries.join("")));
};
