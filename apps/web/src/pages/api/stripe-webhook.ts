import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getAccount, recordPayment, sendMagicLink } from "~/lib/account";
import { saveProfile } from "~/lib/radar";
import { verifyStripeSignature, type CheckoutSessionEvent } from "~/lib/stripe";

export const prerender = false;

// POST /api/stripe-webhook: checkout.session.completed and checkout.session.async_payment_succeeded (SEPA and other
// delayed methods) for the Solo and Team payment links (plan in the session metadata, copied from the link). Records
// the account, saves the screening the buyer came from (client_reference_id) as their first profile, emails a sign-in
// link. Signature checked; a replayed event only resends the link when no link was ever sent.
export const POST: APIRoute = async ({ request }) => {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response("webhook not configured", { status: 503 });
  const body = await request.text();
  if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) return new Response("bad signature", { status: 400 });
  const event = JSON.parse(body) as CheckoutSessionEvent;
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return new Response("ignored", { status: 200 });
  const s = event.data.object;
  const email = (s.customer_details?.email ?? s.customer_email ?? "").toLowerCase();
  // A completed session with a delayed payment method comes back as async_payment_succeeded once the money is in.
  if (s.payment_status !== "paid") return new Response("pending", { status: 200 });
  if (!email) {
    console.warn("pro webhook skipped, no email", s.id);
    return new Response("skipped", { status: 200 });
  }
  const fresh = await recordPayment(env.DB, {
    email,
    plan: s.metadata?.plan === "team" ? "team" : "solo",
    sessionId: s.id,
    customerId: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
    businessName: s.customer_details?.business_name ?? s.customer_details?.name ?? null,
    taxId: s.customer_details?.tax_ids?.[0]?.value ?? null,
  });
  const fit = s.client_reference_id ?? "";
  const account = await getAccount(env.DB, email);
  if (!fresh) {
    // Replay after a failure further down: finish the parts that never happened.
    const sent = await env.DB.prepare("SELECT 1 FROM logins WHERE email = ? LIMIT 1").bind(email).first();
    if (account && /^[0-9a-f-]{36}$/.test(fit)) await saveProfile(env.DB, account, fit);
    if (!sent) await sendMagicLink(env, email, { welcome: true, next: "/me" });
    return new Response(sent ? "already recorded" : "link resent", { status: 200 });
  }
  if (account && /^[0-9a-f-]{36}$/.test(fit)) await saveProfile(env.DB, account, fit);
  await sendMagicLink(env, email, { welcome: true, next: "/me" });
  return new Response("created", { status: 200 });
};
