import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { safeNext, sendMagicLink } from "~/lib/account";
import { verifyTurnstile } from "~/lib/turnstile";

export const prerender = false;

// POST /api/login (email, next?, from?): emails a sign-in link when a paid account exists. The answer is the same
// either way. From the OAuth authorize page (from=oauth), the answer goes back to that page instead of /login.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? ""), "");
  const back = form.get("from") === "oauth" && next ? next : "/login?";
  const to = (q: string) => `${back}${back.endsWith("?") ? "" : "&"}${q}`;
  if (!(await verifyTurnstile(env, form, request.headers.get("cf-connecting-ip")))) return redirect(to("error=captcha"), 303);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect(to("error=email"), 303);
  await sendMagicLink(env, email, { next: next || undefined });
  return redirect(to("sent=1"), 303);
};
