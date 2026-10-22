import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { consumeLoginCode, safeNext, sessionCookie } from "~/lib/account";

export const prerender = false;

// POST /api/code (code, next?, back): the six-digit code from the sign-in email, for the address in the gl_login
// cookie that /api/login or /pro/thanks set. Success signs in and goes on like the link does (the gl_next cookie of an
// assistant connection first); a wrong code goes back to the page it was typed on, with wrong=1.
export const POST: APIRoute = async ({ request, cookies }) => {
  const form = await request.formData();
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const email = await consumeLoginCode(env.DB, cookies.get("gl_login")?.value ?? "", code);
  if (!email) {
    const back = new URL(safeNext(String(form.get("back") ?? ""), "/login?sent=1"), "https://grantledger.eu");
    back.searchParams.set("wrong", "1");
    return new Response(null, { status: 303, headers: { location: back.pathname + back.search } });
  }
  const resume = cookies.get("gl_next")?.value;
  const headers = new Headers({ location: safeNext(resume || String(form.get("next") ?? "")), "set-cookie": await sessionCookie(env, email) });
  headers.append("set-cookie", "gl_login=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  if (resume) headers.append("set-cookie", "gl_next=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  return new Response(null, { status: 303, headers });
};
