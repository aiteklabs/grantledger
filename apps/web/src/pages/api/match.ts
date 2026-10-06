import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hashIp, isAdmin } from "~/lib/auth";
import { currentAccount } from "~/lib/account";
import { verifyTurnstile } from "~/lib/turnstile";
import { parseProfileForm } from "~/lib/profile-form";
import { screenProfile } from "~/lib/screen";

export const prerender = false;

// Deterministic screening from the confirmed form, Pro accounts only. No model call. Stores form and matches for the
// private history.
export const POST: APIRoute = async ({ request, redirect }) => {
  const account = await currentAccount(request, env);
  if (!account && !(await isAdmin(request, env))) return redirect("/pro?from=find", 303);
  const form = await request.formData();
  if (!(await verifyTurnstile(env, form, request.headers.get("cf-connecting-ip")))) return redirect("/find?error=captcha", 303);
  let profile;
  try {
    profile = parseProfileForm(form);
  } catch (err) {
    return redirect(`/find?error=form&detail=${encodeURIComponent(err instanceof Error ? err.message.slice(0, 200) : "invalid")}`, 303);
  }
  const draft = String(form.get("draft") ?? "");
  const email = account?.email ?? null;
  const id = /^[0-9a-f-]{36}$/.test(draft) ? draft : crypto.randomUUID();
  const started = Date.now();
  const existing = /^[0-9a-f-]{36}$/.test(draft) ? await env.DB.prepare("SELECT id, contact_email FROM fit_checks WHERE id = ?").bind(id).first<{ id: string; contact_email: string | null }>() : null;
  if (existing?.contact_email && account && existing.contact_email !== account.email) return new Response("Forbidden", { status: 403 });
  await screenProfile(env.DB, {
    id,
    profile,
    existing: !!existing,
    email,
    ip_hash: await hashIp(request.headers.get("cf-connecting-ip")),
    user_agent: request.headers.get("user-agent") ?? "",
    started,
  });
  const locale = String(form.get("locale") ?? "en");
  return redirect(locale === "en" ? `/fit/${id}` : `/${locale}/fit/${id}`, 303);
};
