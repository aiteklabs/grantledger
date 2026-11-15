import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { authorizationServerMetadata } from "~/lib/oauth";
import { JSON_HEADERS } from "~/lib/api";

export const prerender = false;

// RFC 8414: where MCP clients register, send the user, and exchange codes.
export const GET: APIRoute = () => new Response(JSON.stringify(authorizationServerMetadata(env)), { headers: { ...JSON_HEADERS, "cache-control": "public, max-age=3600" } });
