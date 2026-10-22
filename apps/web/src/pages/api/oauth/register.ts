import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { JSON_HEADERS } from "~/lib/api";
import { SCOPE, acceptableRedirectUri, encodeClientId } from "~/lib/oauth";

export const prerender = false;

const CORS = { ...JSON_HEADERS, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };

// RFC 7591 dynamic client registration. Stateless: the client_id is the signed record of the redirect URIs.
// Public clients only (no secret), which is what MCP clients are.
export const POST: APIRoute = async ({ request }) => {
  let body: { redirect_uris?: unknown; client_name?: unknown; scope?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_client_metadata" }), { status: 400, headers: CORS });
  }
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string").slice(0, 5) : [];
  if (redirectUris.length === 0 || !redirectUris.every(acceptableRedirectUri)) return new Response(JSON.stringify({ error: "invalid_redirect_uri" }), { status: 400, headers: CORS });
  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 60) : undefined;
  const client_id = await encodeClientId(env, { ru: redirectUris, n: clientName });
  const out = {
    client_id,
    redirect_uris: redirectUris,
    ...(clientName ? { client_name: clientName } : {}),
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    // Echoed back: ChatGPT reads it to decide whether every requested permission was granted.
    scope: typeof body.scope === "string" && body.scope.trim() ? body.scope.trim().slice(0, 200) : SCOPE,
  };
  return new Response(JSON.stringify(out), { status: 201, headers: CORS });
};

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });
