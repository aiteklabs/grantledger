import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { protectedResourceMetadata } from "~/lib/oauth";
import { JSON_HEADERS } from "~/lib/api";

export const prerender = false;

// RFC 9728: the MCP endpoint names this server as its authorization server.
export const GET: APIRoute = () => new Response(JSON.stringify(protectedResourceMetadata(env)), { headers: { ...JSON_HEADERS, "cache-control": "public, max-age=3600" } });
