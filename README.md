# grantledger

The open ledger of public funding. Grants, loans, guarantees and tax credits published by public bodies across Europe and beyond, collected every night from official sources, normalised into one schema, searchable in eight languages, and screened against a company profile with rules you can read. Live at https://grantledger.eu.

Code MIT, normalised data CC0 (see `DATA_LICENSE.md`). Every record links to the official publisher page and keeps the publisher's license.

## What it does

- **Ledger**: about 22,000 current calls from 35 official feeds in 21 countries plus EU-wide programmes. Free to browse and search. Country landing pages, a coverage register with the state of every feed, a status page, sitemaps and hreflang for every locale.
- **Screening (Pro)**: a structured company profile (country, region, entity type, size, age, stage, NACE sectors, instruments, keywords) is matched against every current call with fixed rules. Each verdict lists the rule it relies on. Readiness gaps and negative memos per call. No model in the request path.
- **AI prefill (Pro)**: a website, PDF or paragraph is read by Gemini through Cloudflare AI Gateway to prefill the profile form. The user confirms every field before screening.
- **Radar (Pro)**: saved company profiles are screened again every Monday; an email lists the calls that appeared since the last one and pass the rules.
- **Assistants (Pro)**: an MCP server at `/mcp` (streamable HTTP) with `search_grants`, `get_grant` and `get_fit`, plus ChatGPT's `search` and `fetch`. Sign-in is OAuth 2.1 served by the site itself (`src/lib/oauth.ts`: RFC 8414 metadata, dynamic client registration, PKCE, refresh rotation, stateless signed tokens, single use through `oauth_uses`): the assistant opens `/oauth/authorize`, the user signs in with the magic link or pays for Pro and lands back, clicks Allow. A personal key (`/mcp/<key>`, bearer on the JSON API) covers tools without OAuth. A pasted `/fit/{id}` link lets the assistant reason over that screening. Sixty requests per minute per client. `plugins/grantledger` is the ChatGPT and Codex plugin package.
- **Enrichment**: every current call gets an English summary, English search terms and structured eligibility fields extracted offline by the model, once per content version, so English keywords reach calls published in any language.

Pro is one payment through Stripe: Solo (one company profile) or Team (three). Accounts sign in with a magic link; there is no password.

## Layout

| Path | What |
|---|---|
| `packages/schema` | Zod model of one opportunity (`Grant`) and the generated `grant.schema.json`. |
| `packages/ingest` | Cloudflare Worker: nightly crons, one Workflow per source, D1 storage, R2 raw archive, D1 migrations. |
| `apps/web` | Astro site on Workers: ledger, screening, Pro accounts, Radar emails, admin. |
| `.github/workflows/local-runner.yml` | GitHub Actions runner for publishers that refuse Cloudflare egress; pushes pages to the Worker's `POST /ingest`. |

## Sources

One adapter file per feed in `packages/ingest/src/sources/`, registered in `index.ts`. Each implements `Source` (`start`, `fetchPage` with an opaque cursor) and returns validated `Grant` records plus the raw payloads.

| Country | Feeds |
|---|---|
| EU-wide | Funding & Tenders Portal (SEARCH API) |
| Austria | FFG, aws, FWF |
| Belgium | VLAIO, 1890.be, Innoviris, BELSPO |
| Czechia | dotaceeu.cz |
| Denmark | Statens Tilskudspuljer, Danmarks Frie Forskningsfond, Innovationsfonden, Statens Kunstfond |
| Finland | EURA 2021 |
| France | aides-entreprises.fr |
| Germany | Förderberatung des Bundes, DFG |
| Greece | ESPA |
| Ireland | Enterprise Ireland, National Enterprise Hub, Research Ireland |
| Italy | incentivi.gov.it |
| Lithuania | ES investicijos, Inovacijų agentūra |
| Netherlands | RVO |
| Norway | Forskningsrådet, Innovasjon Norge, Tilskudd.no |
| Poland | FERS and FERC schedules (dane.gov.pl) |
| Portugal | Portugal 2030, FCT, Fundo Ambiental |
| Romania | MIPE announcements |
| Spain | BDNS |
| Sweden | Vinnova |
| United Kingdom | Find a grant, PRS Foundation, Sussex Community Foundation, Brighton & Hove City Council |
| United States | Grants.gov |

Access is an official API, open data export, RSS or JSON where one exists, server-rendered HTML otherwise. Publishers that answer Cloudflare egress with a bot challenge run from the GitHub Actions runner (`runner: "local"` on the adapter): Vinnova and VLAIO today. FFG (Austria) blocks every datacenter IP and is not refreshed. Förderdatenbank des Bundes (Radware bot manager, 30 second crawl delay), EuroAccess (terms forbid database storage) and Arts Council England (Cloudflare JavaScript challenge on every request) are not crawled.

The archive starts on 2026-09-29: a call first seen after its deadline, already closed, or without any dates never enters the ledger. Calls seen while current stay when they close, with every content change kept in `grant_versions` and the raw payloads in R2 under `raw/{source}/{id}/{content_hash}.json`.

## Schedule (UTC)

- 03:00 daily: the ingest Worker crawls every Worker-runnable source. Spain is incremental (last 3 days), the rest is a full recrawl. A failed crawl is retried once, an hour later.
- 03:30 daily: the GitHub Actions runner crawls the local-runner sources and pushes to `POST /ingest`.
- 05:00 daily: the Worker asks the site to enrich up to 150 new current calls, under the monthly model budget set in the admin.
- Monday 06:00: the Worker asks the site to send the Radar emails.

## Run locally

```sh
pnpm install
pnpm sample eu_ft                      # one page, validated, no database needed
cd packages/ingest
pnpm migrate:local
pnpm dev                               # http://localhost:8787
# On NixOS, workerd does not find the system CA bundle. Run instead:
# SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt SSL_CERT_DIR=/etc/ssl/certs pnpm dev
curl -X POST localhost:8787/run -H 'content-type: application/json' -d '{"source":"eu_ft","maxPages":2}'
curl localhost:8787/health
```

```sh
cd apps/web
pnpm dev                               # uses the remote D1 through wrangler bindings
```

## Deploy

Ingest Worker (`packages/ingest`):

```sh
cp wrangler.example.jsonc wrangler.jsonc   # in both packages; fill ids, domains and links
wrangler d1 create freegrant           # paste database_id into both wrangler.jsonc files
wrangler r2 bucket create freegrant-raw
wrangler secret put ADMIN_TOKEN        # also the GitHub Actions secrets ADMIN_TOKEN and INGEST_URL
pnpm migrate:remote
pnpm run release
```

Web Worker (`apps/web`), always build before deploying because the adapter entrypoint reads `dist`:

```sh
pnpm build && pnpm exec wrangler deploy
```

Vars in `apps/web/wrangler.jsonc`: `AI_GATEWAY_ID`, `GEMINI_MODEL`, `SITE_URL`, `ACCESS_TEAM_DOMAIN`, `STRIPE_SOLO_LINK`, `STRIPE_TEAM_LINK`, `MAIL_FROM`. Secrets (`wrangler secret put`): `ADMIN_TOKEN`, `ACCESS_AUD`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `STRIPE_WEBHOOK_SECRET`.

Services behind the site:

- **Model**: Workers AI binding against AI Gateway `AI_GATEWAY_ID` with the Google key stored in the gateway (BYOK), so no key lives in the project. `GEMINI_API_KEY` is a local-dev fallback only. Spend is accounted in `model_usage` and capped by `model_monthly_limit_usd` in the `settings` table.
- **Email**: Cloudflare Email Sending binding `EMAIL`; the sending domain must be enabled once with `wrangler email sending enable <domain>`.
- **Payments**: two Stripe Payment Links (plan in their metadata) and one webhook on `/api/stripe-webhook` for `checkout.session.completed`, verified with `STRIPE_WEBHOOK_SECRET`. No Stripe SDK.
- **Admin** (`/admin`): Cloudflare Access when `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set, else HTTP basic auth with `ADMIN_TOKEN`. The admin screens and prefills without a Pro account.
- **Anti-bot**: Cloudflare Turnstile on the public forms (screening, sign-in). Skipped when the secret is unset (local dev).

## Web app map

- `/`, `/grants`, `/grants/{id}`, `/countries`, `/countries/{code}`, `/coverage`, `/status`, `/methodology`, `/about`, `/privacy`, `/legal-notice`, `/ai-notice`: public, in `en`, `fr`, `de`, `es`, `it`, `pt`, `nl`, `pl` (prefix `/{locale}`; content pages stay English).
- `/pro`, `/login`, `/auth`, `/me`: Pro purchase, magic-link sign-in, saved profiles.
- `/find`, `/fit/{id}`: screening form and private result page (link only, not indexed).
- `/api/health` (JSON), `/api/match`, `/api/prefill`, `/api/rescreen`, `/api/profile`, `/api/login`, `/api/logout`, `/api/pro`, `/api/stripe-webhook`, `/api/radar-send`, `/api/enrich` (admin), `/sitemap.xml`.

The matcher lives in `apps/web/src/lib/match.ts`: an SQL candidate pool (current calls, the company's country or EU-wide, FTS bonus on keywords), then fixed rules per record (country, region, beneficiary, sector, instrument, size, age, consortium, deadline, relevance). Each rule yields match, mismatch or unknown with a sentence. Fit means no mismatch and no unknown eligibility rule.

## Stack

Cloudflare only: Workers, Workflows, D1 (SQLite with FTS5), R2, AI Gateway, Email Sending, Turnstile, Access. Astro for the site. Stripe for payments. Gemini 3.8 Flash for prefill and enrichment, behind one file (`apps/web/src/lib/gemini.ts`).
