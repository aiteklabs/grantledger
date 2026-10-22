import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getStats } from "~/lib/db";
import { geminiConfigured } from "~/lib/gemini";

export const prerender = false;

// JSON for machines. A browser (Accept: text/html) gets the same numbers on the readable /status page.
export const GET: APIRoute = async ({ request, redirect }) => {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html") && !accept.includes("application/json")) return redirect("/status", 302);
  const stats = await getStats(env.DB);
  return new Response(JSON.stringify({ ok: true, model_configured: geminiConfigured(env), model: env.GEMINI_MODEL, ...stats }, null, 2), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
  });
};
