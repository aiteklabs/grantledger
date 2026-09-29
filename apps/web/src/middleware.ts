import { defineMiddleware } from "astro:middleware";
import { defaultLocale, locales } from "~/i18n";

// Old hostname redirects permanently. A locale prefix (/fr/...) is stripped and remembered in locals, so one set
// of pages serves every language.
export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
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
