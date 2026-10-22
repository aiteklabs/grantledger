// Stripe webhook signature check (Stripe-Signature: t=...,v1=...), HMAC-SHA256 over "{t}.{body}" with the endpoint
// secret. No SDK: this is the only Stripe call the site makes.
const TOLERANCE_S = 300;

export async function verifyStripeSignature(body: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

export interface CheckoutSessionEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      payment_status: string;
      client_reference_id: string | null;
      metadata?: Record<string, string> | null;
      customer: string | { id: string } | null;
      customer_email?: string | null;
      customer_details?: { email?: string | null; name?: string | null; business_name?: string | null; tax_ids?: { type: string; value: string }[] | null } | null;
    };
  };
}
