import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAdmin, unauthorized } from "~/lib/auth";
import { setLimitUsd } from "~/lib/spend";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  if (!(await isAdmin(request, env))) return unauthorized(env);
  const form = await request.formData();
  const usd = Number(form.get("model_monthly_limit_usd"));
  if (!Number.isFinite(usd) || usd < 0 || usd > 10000) return new Response("Bad limit", { status: 400 });
  await setLimitUsd(env.DB, usd);
  return redirect("/admin", 303);
};
