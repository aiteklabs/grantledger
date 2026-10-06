import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAdmin, unauthorized } from "~/lib/auth";
import { sendDueRadars } from "~/lib/radar";

export const prerender = false;

// POST /api/radar-send: the weekly Radar run. Admin only; the ingest Worker's Monday cron calls it.
export const POST: APIRoute = async ({ request }) => {
  if (!(await isAdmin(request, env))) return unauthorized(env);
  const result = await sendDueRadars(env.DB, env);
  return new Response(JSON.stringify(result, null, 2), { headers: { "content-type": "application/json" } });
};
