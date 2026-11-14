import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { POSTS, postPath } from "~/lib/blog";
import { urlEntries, urlEntry, urlset, xmlResponse } from "~/lib/sitemap";
import { getStats } from "~/lib/db";

export const prerender = false;

export const GET: APIRoute = async () => {
  const stats = await getStats(env.DB);
  const pages = ["/", "/grants", "/countries", "/methodology", "/coverage", "/about", "/pro", "/ai-notice", "/privacy", "/legal-notice", "/status", ...stats.countries.map((c) => `/countries/${c.country.toLowerCase()}`)];
  // Pages written in English only: one URL each, as in the canonical rule of the layout.
  const english = ["/assistant", "/terms", "/blog", ...POSTS.map(postPath), "/compare/granter-ai"];
  const lastmod = Object.fromEntries(POSTS.map((p) => [postPath(p), p.checked]));
  return xmlResponse(urlset(pages.map((p) => urlEntries(env.SITE_URL, p)).join("") + english.map((p) => urlEntry(env.SITE_URL, p, lastmod[p])).join("")));
};
