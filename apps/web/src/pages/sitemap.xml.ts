import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GRANTS_PER_SITEMAP, OPEN_GRANTS_WHERE, sitemapIndex, xmlResponse } from "~/lib/sitemap";
import { SITEMAP_TTL_S, cachedJson } from "~/lib/db";

export const prerender = false;

// Sitemap index: one file for the fixed pages, then open calls in chunks so each file stays small.
export const GET: APIRoute = async () => {
  const n = await cachedJson("https://grantledger.cache/sitemap-count", SITEMAP_TTL_S, async () => {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM grants WHERE ${OPEN_GRANTS_WHERE}`).first<{ n: number }>();
    return row?.n ?? 0;
  });
  const chunks = Math.max(1, Math.ceil(n / GRANTS_PER_SITEMAP));
  const files = ["sitemap-pages.xml", ...Array.from({ length: chunks }, (_, i) => `sitemap-grants-${i + 1}.xml`)];
  return xmlResponse(sitemapIndex(env.SITE_URL, files));
};
