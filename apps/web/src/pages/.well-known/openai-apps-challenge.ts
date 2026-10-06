import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// OpenAI plugin directory: domain verification. The portal hands out a token; it must come back as plain text
// from this path. Set OPENAI_APPS_CHALLENGE in wrangler.jsonc and deploy.
export const GET: APIRoute = () => (env.OPENAI_APPS_CHALLENGE ? new Response(env.OPENAI_APPS_CHALLENGE, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }) : new Response("Not found", { status: 404 }));
