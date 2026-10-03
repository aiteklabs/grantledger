import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { currentAccount, disconnectAssistants, rotateApiKey } from "~/lib/account";

export const prerender = false;

// POST /api/key (action): "rotate" makes a new personal key, "disconnect" kills every OAuth token issued so far.
// Both take effect at once in every assistant.
export const POST: APIRoute = async ({ request, redirect }) => {
  const account = await currentAccount(request, env);
  if (!account) return redirect("/login?next=/assistant", 303);
  const form = await request.formData();
  if (form.get("action") === "disconnect") {
    await disconnectAssistants(env.DB, account.email);
    return redirect("/assistant?disconnected=1", 303);
  }
  await rotateApiKey(env.DB, account.email);
  return redirect("/assistant?rotated=1", 303);
};
