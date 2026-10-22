import { createRemoteJWKSet, jwtVerify } from "jose";

// Admin area. Preferred: Cloudflare Access (Zero Trust) in front of /admin, verified through the Cf-Access-Jwt-Assertion
// header when ACCESS_TEAM_DOMAIN and ACCESS_AUD are set. Fallback: HTTP basic auth with ADMIN_TOKEN as password.
export interface AuthEnv {
  ADMIN_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function isAdmin(request: Request, env: AuthEnv): Promise<boolean> {
  // CLI and scripts: bearer token, works on any path.
  const auth = request.headers.get("authorization") ?? "";
  if (env.ADMIN_TOKEN && auth.startsWith("Bearer ") && timingSafeEqual(auth.slice(7), env.ADMIN_TOKEN)) return true;
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    // Access injects the header on protected paths; on other paths the browser still sends the CF_Authorization cookie.
    const token = request.headers.get("cf-access-jwt-assertion") ?? request.headers.get("cookie")?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] ?? null;
    if (!token) return false;
    try {
      let jwks = jwksCache.get(env.ACCESS_TEAM_DOMAIN);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
        jwksCache.set(env.ACCESS_TEAM_DOMAIN, jwks);
      }
      await jwtVerify(token, jwks, { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
      return true;
    } catch {
      return false;
    }
  }
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    return timingSafeEqual(decoded.slice(decoded.indexOf(":") + 1), env.ADMIN_TOKEN);
  } catch {
    return false;
  }
}

export function unauthorized(env: AuthEnv): Response {
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) return new Response("Forbidden: sign in through Cloudflare Access", { status: 403 });
  return new Response("Authentication required", { status: 401, headers: { "www-authenticate": 'Basic realm="grantledger admin", charset="UTF-8"' } });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
