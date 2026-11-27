import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { protectedResourceMetadata } from "~/lib/oauth";
import { JSON_HEADERS } from "~/lib/api";

export const prerender = false;

// Path-suffixed variant some clients probe (RFC 9728 section 3).
export const GET: APIRoute = () => new Response(JSON.stringify(protectedResourceMetadata(env)), { headers: { ...JSON_HEADERS, "cache-control": "public, max-age=3600" } });
