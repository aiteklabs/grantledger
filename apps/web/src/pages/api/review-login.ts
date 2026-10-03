import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { safeNext, sessionCookie } from "~/lib/account";
import { rateLimited } from "~/lib/api";

export const prerender = false;

// POST /api/review-login (code, next): the reviewer door for the plugin directories. A single long code
// (REVIEW_TOKEN secret) signs in the review account (REVIEW_EMAIL var) without email, so a reviewer can run the
// OAuth flow in one go. Off when either variable is unset.
export const POST: APIRoute = async ({ request, redirect }) => {
  const limited = await rateLimited(request, env);
  if (limited) return limited;
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? ""), "/assistant");
  const code = String(form.get("code") ?? "").trim();
  if (!env.REVIEW_TOKEN || !env.REVIEW_EMAIL || code.length !== env.REVIEW_TOKEN.length || !timingSafeEqual(code, env.REVIEW_TOKEN)) {
    return redirect(`${next}${next.includes("?") ? "&" : "?"}error=code`, 303);
  }
  return new Response(null, { status: 303, headers: { location: next, "set-cookie": await sessionCookie(env, env.REVIEW_EMAIL) } });
};

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
