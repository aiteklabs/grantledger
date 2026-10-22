import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { randomToken, safeNext, sendMagicLink } from "~/lib/account";
import { verifyTurnstile } from "~/lib/turnstile";

export const prerender = false;

// POST /api/login (email, next?, from?): emails a sign-in link and code when a paid account exists. The answer is the
// same either way. From the OAuth authorize page (from=oauth), the answer goes back to that page instead of /login.
// The gl_login cookie holds the challenge of the new code for 30 minutes, so the page only asks for the code
// (/api/code). Without an account it holds a random value that matches nothing, so the cookie reveals nothing either.
export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? ""), "");
  const back = form.get("from") === "oauth" && next ? next : next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const to = (q: string) => `${back}${back.includes("?") ? "&" : "?"}${q}`;
  if (!(await verifyTurnstile(env, form, request.headers.get("cf-connecting-ip")))) return redirect(to("error=captcha"), 303);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect(to("error=email"), 303);
  const challenge = await sendMagicLink(env, email, { next: next || undefined });
  cookies.set("gl_login", challenge ?? randomToken(), { path: "/", maxAge: 1800, httpOnly: true, secure: true, sameSite: "lax" });
  return redirect(to("sent=1"), 303);
};
