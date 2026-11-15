import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { JSON_HEADERS } from "~/lib/api";
import { revokedAt } from "~/lib/account";
import { exchange } from "~/lib/oauth";

export const prerender = false;

const CORS = { ...JSON_HEADERS, "cache-control": "no-store", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };

// RFC 6749 token endpoint: authorization_code with PKCE, refresh_token with rotation. Form or JSON body.
export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      form = new FormData();
      for (const [k, v] of Object.entries((await request.json()) as Record<string, unknown>)) if (typeof v === "string") form.set(k, v);
    } else {
      form = await request.formData();
    }
  } catch {
    return new Response(JSON.stringify({ error: "invalid_request" }), { status: 400, headers: CORS });
  }
  const r = await exchange(env, form, (email) => revokedAt(env.DB, email));
  if (!r.ok) return new Response(JSON.stringify({ error: r.error, ...(r.description ? { error_description: r.description } : {}) }), { status: 400, headers: CORS });
  return new Response(JSON.stringify(r.body), { headers: CORS });
};

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });
