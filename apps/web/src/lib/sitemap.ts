import { localePath, locales } from "~/i18n";

export const GRANTS_PER_SITEMAP = 5000;
export const OPEN_GRANTS_WHERE = "status IN ('open','forthcoming') AND (closes_at IS NULL OR closes_at >= date('now'))";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function alternates(base: string, path: string): string {
  const links = locales.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(base + localePath(l, path))}"/>`);
  links.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${esc(base + path)}"/>`);
  return links.join("");
}

// One <url> per language for the same page, each carrying the full set of alternates.
export function urlEntries(base: string, path: string, lastmod?: string): string {
  const mod = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
  return locales.map((l) => `<url><loc>${esc(base + localePath(l, path))}</loc>${mod}${alternates(base, path)}</url>`).join("");
}

export function urlset(entries: string): string {
  return `${XML_HEAD}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries}</urlset>`;
}

export function sitemapIndex(base: string, files: string[]): string {
  return `${XML_HEAD}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files.map((f) => `<sitemap><loc>${esc(`${base}/${f}`)}</loc></sitemap>`).join("")}</sitemapindex>`;
}

export function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/xml", "cache-control": "public, max-age=3600" } });
}
