import { defineMiddleware } from "astro:middleware";
import { defaultLocale, locales } from "~/i18n";

// Old hostname redirects permanently. A locale prefix (/fr/...) is stripped and remembered in locals, so one set
// of pages serves every language.
// Endpoints other origins post to by design: the OAuth token and registration endpoints (assistants exchange
// codes server to server) and the MCP endpoint. Every other unsafe form post must come from this site.
const CROSS_ORIGIN_OK = /^\/(api\/oauth\/|mcp(\/|$))/;
const FORM_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];

function forbiddenCrossOrigin(request: Request, url: URL): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method) || CROSS_ORIGIN_OK.test(url.pathname)) return false;
  const sameOrigin = request.headers.get("origin") === url.origin;
  const type = request.headers.get("content-type")?.toLowerCase();
  return type ? FORM_TYPES.some((t) => type.includes(t)) && !sameOrigin : !sameOrigin;
}

export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
  if (forbiddenCrossOrigin(context.request, url)) return new Response(`Cross-site ${context.request.method} form submissions are forbidden`, { status: 403 });
  // Every other hostname (old subdomains, www) redirects permanently to the canonical domain.
  if (url.hostname !== "grantledger.eu" && url.hostname !== "localhost" && !url.hostname.endsWith(".workers.dev")) {
    url.hostname = "grantledger.eu";
    return Response.redirect(url.toString(), 301);
  }
  // A rewrite runs the middleware again on the new request, so the locale travels in a request header.
  const fromHeader = context.request.headers.get("x-grantledger-locale");
  if (fromHeader && locales.includes(fromHeader)) {
    context.locals.locale = fromHeader;
    return next();
  }
  const m = url.pathname.match(/^\/([a-z]{2})(\/.*)?$/);
  if (m && m[1] !== defaultLocale && locales.includes(m[1]!)) {
    const headers = new Headers(context.request.headers);
    headers.set("x-grantledger-locale", m[1]!);
    return context.rewrite(new Request(new URL((m[2] ?? "/") + url.search, url.origin), { method: context.request.method, headers, body: context.request.body, redirect: "manual" }));
  }
  context.locals.locale = defaultLocale;
  return next();
});
