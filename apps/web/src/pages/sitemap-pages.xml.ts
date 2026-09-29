import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { urlEntries, urlset, xmlResponse } from "~/lib/sitemap";
import { getStats } from "~/lib/db";

export const prerender = false;

export const GET: APIRoute = async () => {
  const stats = await getStats(env.DB);
  const pages = ["/", "/grants", "/countries", "/methodology", "/coverage", "/about", "/pro", "/ai-notice", "/privacy", "/legal-notice", "/status", ...stats.countries.map((c) => `/countries/${c.country.toLowerCase()}`)];
  return xmlResponse(urlset(pages.map((p) => urlEntries(env.SITE_URL, p)).join("")));
};
