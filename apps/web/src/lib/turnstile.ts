// Cloudflare Turnstile verification for public forms. Fails closed when the secret is set and the token is missing or invalid.
export interface TurnstileEnv {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
}

export async function verifyTurnstile(env: TurnstileEnv, form: FormData, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true; // not configured (local dev)
  const token = String(form.get("cf-turnstile-response") ?? "");
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
