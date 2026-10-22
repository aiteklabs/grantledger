import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// POST /api/pro (plan, email, fit?): sends the visitor to the Stripe payment link of the plan with the email prefilled
// and, when they come from a screening, its id as the reference so it becomes their first profile.
// Nothing is stored before payment.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const fit = String(form.get("fit") ?? "");
  const plan = String(form.get("plan") ?? "solo");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect(`/pro?error=email${fit ? `&fit=${fit}` : ""}`, 303);
  const u = new URL(plan === "team" ? env.STRIPE_TEAM_LINK : env.STRIPE_SOLO_LINK);
  u.searchParams.set("prefilled_email", email);
  if (/^[0-9a-f-]{36}$/.test(fit)) u.searchParams.set("client_reference_id", fit);
  return redirect(u.toString(), 303);
};
