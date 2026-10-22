import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAdmin } from "~/lib/auth";
import { currentAccount } from "~/lib/account";
import { parseJson } from "~/lib/format";
import { ProfileForm } from "~/lib/profile-form";
import { screenProfile } from "~/lib/screen";

export const prerender = false;

// Re-runs a finished fit check against today's ledger with its stored form. Pro accounts and admins only.
// Same id, matches replaced.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Bad request", { status: 400 });
  const admin = await isAdmin(request, env);
  const locale = String(form.get("locale") ?? "en");
  const back = form.get("back") === "admin" && admin ? `/admin/fit/${id}` : locale === "en" ? `/fit/${id}` : `/${locale}/fit/${id}`;
  const account = admin ? null : await currentAccount(request, env);
  if (!admin && !account) return redirect(`/login?next=${encodeURIComponent(back)}`, 303);
  const row = await env.DB.prepare("SELECT form, contact_email FROM fit_checks WHERE id = ? AND status = 'done'").bind(id).first<{ form: string | null; contact_email: string | null }>();
  const parsed = ProfileForm.safeParse(parseJson<unknown>(row?.form ?? null, null));
  if (!parsed.success) return new Response("Not found", { status: 404 });
  // A link gives read access; re-running is for the account that made the screening.
  if (!admin && row?.contact_email && row.contact_email !== account?.email) return new Response("Forbidden", { status: 403 });
  await screenProfile(env.DB, {
    id,
    profile: parsed.data,
    existing: true,
    email: null,
    ip_hash: null,
    user_agent: "",
    started: Date.now(),
  });
  // Saved profiles follow the form they were saved from.
  await env.DB.prepare("UPDATE radars SET form = ?, company_name = ? WHERE fit_check_id = ? AND active = 1").bind(JSON.stringify(parsed.data), parsed.data.company_name || null, id).run();
  return redirect(back, 303);
};
