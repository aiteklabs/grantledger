// Pro accounts: email is the identity, a magic link is the password, a signed cookie is the session.
// The cookie is HMAC-signed with ADMIN_TOKEN, so no extra secret is needed.
export type Plan = "solo" | "team";
export interface Account {
  email: string;
  created_at: string;
  paid_at: string | null;
  stripe_session_id: string | null;
  stripe_customer_id: string | null;
  business_name: string | null;
  tax_id: string | null;
  last_login_at: string | null;
  plan: Plan;
  // Personal key for the assistants (MCP and JSON API). Null until the account page is first opened.
  api_key: string | null;
  // "Disconnect all assistants": OAuth tokens issued at or before this instant are dead.
  mcp_revoked_at: string | null;
}

// Solo: one company profile. Team: three. Both lifetime.
export const PLANS: Record<Plan, { profiles: number; eur: number; name: string }> = {
  solo: { profiles: 1, eur: 9, name: "Solo" },
  team: { profiles: 3, eur: 19, name: "Team" },
};
export const profileLimit = (a: Account) => PLANS[a.plan]?.profiles ?? 1;

const COOKIE = "gl_session";
const SESSION_DAYS = 90;
const LINK_MINUTES = 30;

type Env = Pick<Cloudflare.Env, "DB" | "ADMIN_TOKEN" | "EMAIL" | "MAIL_FROM" | "SITE_URL">;

const enc = new TextEncoder();
const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export function randomToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sessionCookie(env: Env, email: string): Promise<string> {
  const payload = b64(enc.encode(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86_400_000 })));
  const sig = await sign(env.ADMIN_TOKEN ?? "", payload);
  return `${COOKIE}=${payload}.${sig}; Path=/; Max-Age=${SESSION_DAYS * 86_400}; HttpOnly; Secure; SameSite=Lax`;
}

// A post-login destination must be a path on this site: starts with one slash, no other origin, no control
// characters, no backslash. The query keeps every character a client may put there (an OAuth request carries
// colons, plus signs and encoded URLs).
export function safeNext(next: string | null | undefined, fallback = "/me"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\s\\\u0000-\u001f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://grantledger.eu");
    return u.origin === "https://grantledger.eu" && u.pathname + u.search + u.hash === next ? next : fallback;
  } catch {
    return fallback;
  }
}

export const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

// The signed-in, paid account, or null.
export async function currentAccount(request: Request, env: Env): Promise<Account | null> {
  if (!env.ADMIN_TOKEN) return null;
  const raw = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || (await sign(env.ADMIN_TOKEN, payload)) !== sig) return null;
  try {
    const { e, x } = JSON.parse(new TextDecoder().decode(unb64(payload))) as { e: string; x: number };
    if (!e || x < Date.now()) return null;
    return (await env.DB.prepare("SELECT * FROM accounts WHERE email = ? AND paid_at IS NOT NULL").bind(e).first<Account>()) ?? null;
  } catch {
    return null;
  }
}

// The paid account holding this key, or null. Keys look like gl_<48 hex>.
export async function accountByKey(db: D1Database, key: string): Promise<Account | null> {
  if (!/^gl_[0-9a-f]{48}$/.test(key)) return null;
  return (await db.prepare("SELECT * FROM accounts WHERE api_key = ? AND paid_at IS NOT NULL").bind(key).first<Account>()) ?? null;
}

// A new key for the account; the old one stops working at once. With onlyIfMissing, the first visit creates the
// key exactly once even when two requests race, and both get the stored one.
export async function rotateApiKey(db: D1Database, email: string, onlyIfMissing = false): Promise<string> {
  const key = `gl_${randomToken()}`;
  await db.prepare(`UPDATE accounts SET api_key = ? WHERE email = ?${onlyIfMissing ? " AND api_key IS NULL" : ""}`).bind(key, email).run();
  if (!onlyIfMissing) return key;
  const row = await db.prepare("SELECT api_key FROM accounts WHERE email = ?").bind(email).first<{ api_key: string | null }>();
  return row?.api_key ?? key;
}

// For the OAuth layer: undefined when no paid account, else the revocation instant or null.
export async function revokedAt(db: D1Database, email: string): Promise<string | null | undefined> {
  const row = await db.prepare("SELECT mcp_revoked_at FROM accounts WHERE email = ? AND paid_at IS NOT NULL").bind(email).first<{ mcp_revoked_at: string | null }>();
  return row ? row.mcp_revoked_at : undefined;
}

export async function disconnectAssistants(db: D1Database, email: string): Promise<void> {
  await db.prepare("UPDATE accounts SET mcp_revoked_at = ? WHERE email = ?").bind(new Date().toISOString(), email).run();
}

export async function getAccount(db: D1Database, email: string): Promise<Account | null> {
  return (await db.prepare("SELECT * FROM accounts WHERE email = ?").bind(email.toLowerCase()).first<Account>()) ?? null;
}

// Stripe webhook: record the payment. Idempotent on the Checkout session id. Paying for Team after Solo upgrades;
// paying for Solo after Team changes nothing.
export async function recordPayment(db: D1Database, p: { email: string; plan: Plan; sessionId: string; customerId: string | null; businessName: string | null; taxId: string | null }): Promise<boolean> {
  const dup = await db.prepare("SELECT email FROM accounts WHERE stripe_session_id = ?").bind(p.sessionId).first();
  if (dup) return false;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO accounts (email, created_at, paid_at, stripe_session_id, stripe_customer_id, business_name, tax_id, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET paid_at = COALESCE(accounts.paid_at, excluded.paid_at), stripe_session_id = excluded.stripe_session_id,
       stripe_customer_id = COALESCE(excluded.stripe_customer_id, accounts.stripe_customer_id), business_name = COALESCE(excluded.business_name, accounts.business_name),
       tax_id = COALESCE(excluded.tax_id, accounts.tax_id), plan = CASE WHEN excluded.plan = 'team' THEN 'team' ELSE accounts.plan END`,
    )
    .bind(p.email.toLowerCase(), now, now, p.sessionId, p.customerId, p.businessName, p.taxId, p.plan)
    .run();
  return true;
}

// Emails a single-use sign-in link. Silent when no paid account exists, so the form cannot be used to probe emails.
export async function sendMagicLink(env: Env, email: string, opts: { welcome?: boolean; next?: string } = {}): Promise<void> {
  const account = await getAccount(env.DB, email);
  if (!account?.paid_at) return;
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO logins (token, email, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(token, account.email, new Date(now).toISOString(), new Date(now + LINK_MINUTES * 60_000).toISOString()).run();
  const link = `${env.SITE_URL}/auth?token=${token}${opts.next ? `&next=${encodeURIComponent(opts.next)}` : ""}`;
  const plan = PLANS[account.plan];
  const title = opts.welcome ? `Your grantledger ${plan.name} is ready` : "Sign in to grantledger";
  const intro = opts.welcome
    ? `Thank you. One payment, no subscription: ${plan.profiles === 1 ? "one company profile" : `${plan.profiles} company profiles`}, AI prefill, screening against every current call, and a weekly email of new matching calls. Open the link below to sign in.`
    : "Open the link below to sign in. It works once and expires in 30 minutes.";
  const text = `${title}\n\n${intro}\n\n${link}\n\nIf you did not ask for this, ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Georgia,serif;color:#171511"><div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-family:monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#b4451f;margin:0 0 8px">grantledger</p>
<h1 style="font-size:24px;margin:0 0 16px">${title}</h1><p style="font-size:16px;line-height:1.5">${intro}</p>
<p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#171511;color:#f4efe6;padding:12px 20px;text-decoration:none;font-weight:600">Sign in</a></p>
<p style="font-size:13px;color:#6b675f">If the button does not work, open this address: ${link}<br>If you did not ask for this, ignore this email.</p></div></body></html>`;
  await env.EMAIL.send({ to: account.email, from: { email: env.MAIL_FROM, name: "grantledger" }, subject: title, text, html });
}

// Exchanges a magic-link token for the email it was sent to. Single use, 30 minutes.
export async function consumeMagicLink(db: D1Database, token: string): Promise<string | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const now = new Date().toISOString();
  // The UPDATE is the check: two concurrent exchanges of one token cannot both win.
  const row = await db.prepare("UPDATE logins SET used_at = ? WHERE token = ? AND used_at IS NULL AND expires_at > ? RETURNING email").bind(now, token, now).first<{ email: string }>();
  if (!row) return null;
  await db.prepare("UPDATE accounts SET last_login_at = ? WHERE email = ?").bind(now, row.email).run();
  return row.email;
}
