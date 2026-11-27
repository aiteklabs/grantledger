import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAdmin, unauthorized } from "~/lib/auth";
import { sendDueRadars } from "~/lib/radar";

export const prerender = false;

// POST /api/radar-send?after=<id>: one page of the weekly Radar run. Admin only; the ingest Worker's Monday cron
// calls it and follows "next" until it is null.
export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, env))) return unauthorized(env);
  const result = await sendDueRadars(env.DB, env, url.searchParams.get("after") ?? "");
  if (result.errors.length) console.error("radar errors", result.errors);
  return new Response(JSON.stringify(result, null, 2), { headers: { "content-type": "application/json" } });
};
