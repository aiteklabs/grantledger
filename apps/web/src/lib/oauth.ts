import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { randomToken } from "./account";

// OAuth 2.1 authorization server for the MCP endpoint, the flow ChatGPT, Claude, Cursor and Codex run when a
// connector needs a login: RFC 8414 metadata, RFC 7591 dynamic client registration, authorization code with PKCE
// (S256, public clients only), refresh token rotation, RFC 8707 resource check. Stateless except single use:
// - client_id is a signed blob carrying the registered redirect URIs
// - authorization codes, access tokens and refresh tokens are HS256 JWTs signed with ADMIN_TOKEN
// - single use of codes and refresh tokens rides the oauth_uses table
// Access tokens carry audience "grantledger-mcp", so a session cookie cannot pass as one and the reverse.

export const SCOPE = "grants:read";
export const AUDIENCE = "grantledger-mcp";
const CODE_TTL_S = 120;
const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_S = 30 * 24 * 60 * 60;
const CONSENT_TTL_MS = 10 * 60 * 1000;

type Env = { ADMIN_TOKEN?: string; SITE_URL: string; DB: D1Database };

const enc = new TextEncoder();
const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const secret = (env: Env) => enc.encode(env.ADMIN_TOKEN ?? "");

async function hmac(env: Env, input: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret(env), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(input)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// A signed blob: JSON payload, base64url, dot, HMAC over a purpose-prefixed body. Used for client ids and the
// consent form, so neither needs a table.
async function seal(env: Env, purpose: string, payload: unknown): Promise<string> {
  const body = b64(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(env, `${purpose}:${body}`)}`;
}

async function open<T>(env: Env, purpose: string, blob: string): Promise<T | null> {
  const [body, mac] = blob.split(".");
  if (!body || !mac || !timingSafeEqual(mac, await hmac(env, `${purpose}:${body}`))) return null;
  try {
    return JSON.parse(new TextDecoder().decode(unb64(body))) as T;
  } catch {
    return null;
  }
}

// Metadata ------------------------------------------------------------------------------------------------------

export function authorizationServerMetadata(env: Env) {
  const base = env.SITE_URL;
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    service_documentation: `${base}/assistant`,
  };
}

export function protectedResourceMetadata(env: Env) {
  return { resource: `${env.SITE_URL}/mcp`, authorization_servers: [env.SITE_URL], scopes_supported: [SCOPE], bearer_methods_supported: ["header"], resource_documentation: `${env.SITE_URL}/assistant` };
}

// RFC 8707: when the client names a resource, it must be our MCP endpoint (trailing slash and host case aside).
export function acceptableResource(env: Env, resource: string | null | undefined): boolean {
  if (!resource) return true;
  try {
    const asked = new URL(resource);
    const ours = new URL(`${env.SITE_URL}/mcp`);
    const path = asked.pathname.replace(/\/+$/, "");
    return asked.protocol === ours.protocol && asked.host.toLowerCase() === ours.host.toLowerCase() && (path === "" || path === ours.pathname);
  } catch {
    return false;
  }
}

// Clients ------------------------------------------------------------------------------------------------------

export interface ClientRecord {
  ru: string[];
  n?: string;
}

export const encodeClientId = (env: Env, record: ClientRecord) => seal(env, "client", record);

export async function decodeClientId(env: Env, clientId: string): Promise<ClientRecord | null> {
  const record = await open<ClientRecord>(env, "client", clientId);
  return record && Array.isArray(record.ru) && record.ru.every((u) => typeof u === "string") ? record : null;
}

// https, or loopback for native and development clients.
export function acceptableRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

// Authorize ----------------------------------------------------------------------------------------------------

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  requestedScope: string;
  client: ClientRecord;
}

// The query of an authorize request, or the sentence to show when it is not acceptable.
export async function readAuthorizeParams(env: Env, sp: URLSearchParams): Promise<AuthorizeParams | string> {
  const clientId = sp.get("client_id") ?? "";
  const client = await decodeClientId(env, clientId);
  if (!client) return "Unknown client_id.";
  const redirectUri = sp.get("redirect_uri") ?? "";
  if (!client.ru.includes(redirectUri)) return "redirect_uri is not registered for this client.";
  if (sp.get("response_type") !== "code") return "Only response_type=code is supported.";
  if (sp.get("code_challenge_method") !== "S256") return "PKCE with S256 is required.";
  const codeChallenge = sp.get("code_challenge") ?? "";
  if (codeChallenge.length < 40) return "Missing code_challenge.";
  if (!acceptableResource(env, sp.get("resource"))) return "The requested resource is not served by this authorization server.";
  return { clientId, redirectUri, state: sp.get("state") ?? "", codeChallenge, requestedScope: sp.get("scope") ?? "", client };
}

// The consent form carries the request and the account it was shown to, signed, so a forged POST cannot mint a
// code for someone else.
export interface Decision {
  cid: string;
  ru: string;
  cc: string;
  st: string;
  rs: string;
  sub: string;
  exp: number;
}

export const sealDecision = (env: Env, p: AuthorizeParams, email: string) => seal(env, "decision", { cid: p.clientId, ru: p.redirectUri, cc: p.codeChallenge, st: p.state, rs: p.requestedScope, sub: email, exp: Date.now() + CONSENT_TTL_MS } satisfies Decision);

export async function openDecision(env: Env, blob: string): Promise<Decision | null> {
  const d = await open<Decision>(env, "decision", blob);
  return d && typeof d.sub === "string" && d.exp > Date.now() ? d : null;
}

// Tokens -------------------------------------------------------------------------------------------------------

async function sign(env: Env, claims: JWTPayload & { type: string }, sub: string, ttlS: number, aud?: string): Promise<string> {
  let jwt = new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(`${ttlS}s`);
  if (aud) jwt = jwt.setAudience(aud);
  return jwt.sign(secret(env));
}

async function verify(env: Env, token: string, aud?: string): Promise<JWTPayload | null> {
  try {
    return (await jwtVerify(token, secret(env), aud ? { audience: aud } : {})).payload;
  } catch {
    return null;
  }
}

// The consent instant (gat, milliseconds) travels from the code into every token of the chain: "disconnect every
// assistant" compares it with the revocation instant, so a refresh racing the disconnect cannot mint a survivor.
export const issueCode = (env: Env, d: Decision) => sign(env, { type: "code", cid: d.cid, ru: d.ru, cc: d.cc, rs: d.rs, gat: Date.now(), jti: randomToken(12) }, d.sub, CODE_TTL_S);

// A token pair. The family id travels through every refresh rotation of one consent, so a replayed refresh token
// can kill the whole chain (RFC 9700 section 4.14.2).
export async function issueTokenPair(env: Env, email: string, requestedScope: string, grantedAt: number, family = randomToken(8)) {
  return {
    access_token: await sign(env, { type: "access", scope: SCOPE, gat: grantedAt }, email, ACCESS_TTL_S, AUDIENCE),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: await sign(env, { type: "refresh", rs: requestedScope, fam: family, gat: grantedAt, jti: randomToken(12) }, email, REFRESH_TTL_S),
    // ChatGPT compares this with what it asked for and warns on a partial grant; enforcement reads the JWT.
    scope: requestedScope || SCOPE,
  };
}

// Codes and refresh tokens work once: the first INSERT of a jti wins. Expired rows go on the way.
async function claimOnce(env: Env, jti: string, ttlS: number): Promise<boolean> {
  const now = new Date().toISOString();
  await env.DB.prepare("DELETE FROM oauth_uses WHERE expires_at < ?").bind(now).run();
  const row = await env.DB.prepare("INSERT OR IGNORE INTO oauth_uses (jti, expires_at) VALUES (?, ?) RETURNING jti").bind(jti, new Date(Date.now() + ttlS * 1000).toISOString()).first();
  return !!row;
}

const isRevoked = (revokedAt: string | null | undefined, grantedAt: unknown) => !!revokedAt && (typeof grantedAt === "number" ? grantedAt : 0) <= Date.parse(revokedAt);
const sha256b64 = async (s: string) => b64(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export type TokenResult = { ok: true; body: unknown } | { ok: false; error: string; description?: string };
const bad = (error: string, description?: string): TokenResult => ({ ok: false, error, description });

// The token endpoint: authorization_code (PKCE, single use) and refresh_token (rotation, single use). A revoked
// account ("disconnect all assistants" or lost Pro) stops here.
export async function exchange(env: Env, form: FormData, revokedAt: (email: string) => Promise<string | null | undefined>): Promise<TokenResult> {
  const f = (k: string) => String(form.get(k) ?? "");
  if (!acceptableResource(env, f("resource") || null)) return bad("invalid_target", "The requested resource is not served by this authorization server");
  const grant = f("grant_type");
  if (grant === "authorization_code") {
    const p = await verify(env, f("code"));
    if (!p || p.type !== "code" || !p.sub || !p.jti || typeof p.gat !== "number") return bad("invalid_grant", "Authorization code is invalid or expired");
    if (f("client_id") && p.cid !== f("client_id")) return bad("invalid_grant", "client_id mismatch");
    if (f("redirect_uri") && p.ru !== f("redirect_uri")) return bad("invalid_grant", "redirect_uri mismatch");
    const verifier = f("code_verifier");
    if (!verifier || !timingSafeEqual(await sha256b64(verifier), String(p.cc ?? ""))) return bad("invalid_grant", "PKCE verification failed");
    if (!(await claimOnce(env, `code:${p.jti}`, CODE_TTL_S * 2))) return bad("invalid_grant", "Authorization code already used");
    const revoked = await revokedAt(p.sub);
    if (revoked === undefined) return bad("invalid_grant", "This account is not Pro");
    if (isRevoked(revoked, p.gat)) return bad("invalid_grant", "Access was disconnected; connect again from your assistant");
    return { ok: true, body: await issueTokenPair(env, p.sub, String(p.rs ?? ""), p.gat) };
  }
  if (grant === "refresh_token") {
    const p = await verify(env, f("refresh_token"));
    if (!p || p.type !== "refresh" || !p.sub || !p.jti || typeof p.fam !== "string" || typeof p.gat !== "number") return bad("invalid_grant", "Refresh token is invalid or expired");
    if (!(await claimOnce(env, `refresh:${p.jti}`, REFRESH_TTL_S))) {
      // A second use means the token leaked: the chain that grew from this consent ends here, for everyone.
      await claimOnce(env, `family:${p.fam}`, REFRESH_TTL_S);
      return bad("invalid_grant", "Refresh token already used; access for this connection is revoked, connect again from your assistant");
    }
    const dead = await env.DB.prepare("SELECT jti FROM oauth_uses WHERE jti = ?").bind(`family:${p.fam}`).first();
    if (dead) return bad("invalid_grant", "This connection was revoked after a replayed refresh token; connect again from your assistant");
    const revoked = await revokedAt(p.sub);
    if (revoked === undefined) return bad("invalid_grant", "This account is no longer Pro");
    if (isRevoked(revoked, p.gat)) return bad("invalid_grant", "Access was disconnected; connect again from your assistant");
    return { ok: true, body: await issueTokenPair(env, p.sub, String(p.rs ?? ""), p.gat, p.fam) };
  }
  return bad("unsupported_grant_type");
}

// The email behind an MCP access token, with the account's revocation instant applied. Null when it is not one.
export async function emailFromAccessToken(env: Env, token: string, revokedAt: (email: string) => Promise<string | null | undefined>): Promise<string | null> {
  const p = await verify(env, token, AUDIENCE);
  if (!p || p.type !== "access" || !p.sub) return null;
  const revoked = await revokedAt(p.sub);
  if (revoked === undefined || isRevoked(revoked, p.gat)) return null;
  return p.sub;
}
