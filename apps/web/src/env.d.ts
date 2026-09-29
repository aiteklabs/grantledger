/// <reference types="astro/client" />

// Bindings and vars from wrangler.jsonc plus secrets. Merged into the global Env used by `cloudflare:workers`.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    RAW: R2Bucket;
    AI: Ai;
    EMAIL: SendEmail;
    AI_GATEWAY_ID: string;
    GEMINI_MODEL: string;
    SITE_URL: string;
    // Cloudflare Access (Zero Trust) for /admin: team domain like https://aiteklabs.cloudflareaccess.com and the app AUD tag.
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET?: string;
    ADMIN_TOKEN?: string;
    GEMINI_API_KEY?: string;
    // Pro: Stripe Payment Links for the two lifetime plans, the webhook signing secret, and the sender address.
    STRIPE_SOLO_LINK: string;
    STRIPE_TEAM_LINK: string;
    STRIPE_WEBHOOK_SECRET?: string;
    MAIL_FROM: string;
  }
}

declare namespace App {
  interface Locals {
    cfContext: ExecutionContext;
    locale: string;
  }
}
