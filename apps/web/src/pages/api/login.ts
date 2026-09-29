import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { safeNext, sendMagicLink } from "~/lib/account";
import { verifyTurnstile } from "~/lib/turnstile";

export const prerender = false;

// POST /api/login (email): emails a sign-in link when a paid account exists. The answer is the same either way.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  if (!(await verifyTurnstile(env, form, request.headers.get("cf-connecting-ip")))) return redirect("/login?error=captcha", 303);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect("/login?error=email", 303);
  const next = safeNext(String(form.get("next") ?? ""), "");
  await sendMagicLink(env, email, { next: next || undefined });
  return redirect("/login?sent=1", 303);
};
