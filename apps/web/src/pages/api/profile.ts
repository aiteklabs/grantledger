import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { currentAccount } from "~/lib/account";
import { removeProfile, saveProfile } from "~/lib/radar";

export const prerender = false;

// POST /api/profile (action=save&fit=... | action=remove&id=...): manage the signed-in account's company profiles.
export const POST: APIRoute = async ({ request, redirect }) => {
  const account = await currentAccount(request, env);
  const form = await request.formData();
  const fit = String(form.get("fit") ?? "");
  if (!account) return redirect(`/login?next=${encodeURIComponent(fit ? `/fit/${fit}` : "/me")}`, 303);
  const action = String(form.get("action") ?? "");
  if (action === "save" && /^[0-9a-f-]{36}$/.test(fit)) {
    const r = await saveProfile(env.DB, account, fit);
    return redirect(r === "full" ? `/me?error=full` : r ? "/me?saved=1" : `/fit/${fit}?error=profile`, 303);
  }
  if (action === "remove") {
    const id = String(form.get("id") ?? "");
    if (/^[0-9a-f]{36}$/.test(id)) await removeProfile(env.DB, account.email, id);
    return redirect("/me", 303);
  }
  return new Response("Bad request", { status: 400 });
};
