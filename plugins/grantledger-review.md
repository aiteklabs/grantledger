# GrantLedger plugin: review materials

Material for the OpenAI plugin directory submission (platform.openai.com/plugins) and the Anthropic connector
directory. Credentials are never in this file: the reviewer access code lives in `apps/web/.env.review` (not
committed) and is entered in the portal's Review details by hand.

## State on 2026-09-30

Portal entry: https://platform.openai.com/plugins/manage/plugin_asdk_app_6abc57115d6481919dcc860514c33734
Done: package uploaded (metadata checks pass, category Finance), domain verified, MCP connected and scanned
("No issues found", after adding destructiveHint and idempotentHint to every tool), review information saved
(countries, reviewer login URL and username, sign-in steps, 5 positive and 3 negative test cases, release notes).
Left, by hand: (1) Review details, Reviewer credentials: paste the access code from `apps/web/.env.review` in the
Password field. (2) Record the demo video, host it, paste the URL in Supporting content. (3) Submit for review,
accept the attestations.

## Package

- ZIP: `plugins/grantledger.zip`, built with `cd plugins/grantledger && zip -r ../grantledger.zip .`
- MCP server: `https://grantledger.eu/mcp`, streamable HTTP, OAuth 2.1 (metadata at
  `https://grantledger.eu/.well-known/oauth-authorization-server`), dynamic client registration, PKCE.
- Domain verification: paste the portal token into `OPENAI_APPS_CHALLENGE` in `apps/web/wrangler.jsonc`, then
  `pnpm build && pnpm exec wrangler deploy`; the token is served at
  `https://grantledger.eu/.well-known/openai-apps-challenge`.
- Tools: `search_grants`, `get_grant`, `get_fit`, `search`, `fetch`. All read only, `openWorldHint: false`.

## Test account (Review details)

- Login: when ChatGPT opens the GrantLedger sign-in page, open "Have an access code?", paste the access code,
  click "Use access code", then "Allow". No email, no MFA, no magic link.
- The account is `reviewer@grantledger.eu`, plan Team, with one saved sample company (Replio, a Lithuanian
  micro startup) and its finished screening. The screening link is `https://grantledger.eu/fit/<REVIEW_FIT>`
  with the id from `apps/web/.env.review`. Sample data, not a customer's account.
- To revoke after review: `UPDATE accounts SET paid_at = NULL, api_key = NULL, mcp_revoked_at = <now> WHERE
  email = 'reviewer@grantledger.eu'` (every door checks paid status, so the session cookie, the personal key and
  the OAuth tokens all stop), then rotate `REVIEW_TOKEN` with `wrangler secret put REVIEW_TOKEN`.

## Positive test cases

1. Search by country and sector. Prompt: "Which open calls in Spain fund industrial SMEs buying machines?"
   Tools: `search_grants` (query, country ES, status current). Expected: a short ranked list with title, funder,
   deadline, official publisher link and grantledger link for each call.
2. EU-wide programmes. Prompt: "EU programmes for a deep-tech startup under three years old." Tools:
   `search_grants` (country EU, beneficiary startup). Expected: EU calls with deadlines, links, a note when a
   call is forthcoming rather than open.
3. One record in depth. Prompt: "Tell me more about the first one: amount, who can apply, documents." Tools:
   `get_grant` (id from the previous result). Expected: amounts and dates exactly as in the record, the
   documents list, the official page link.
4. Screening result. Prompt: "Which three calls should I apply to first and why? My screening:
   https://grantledger.eu/fit/<REVIEW_FIT>" Tools: `get_fit`. Expected: the top calls by verdict (fit before
   eligible before not_yet), each with the matched rules, the points to check, and links; the assistant does not
   overrule the verdicts.
5. Archive search in another language. Prompt: "Appels clos en France sur l'hydrogène en 2026 ?" Tools:
   `search_grants` (query in French, country FR, status closed). Expected: closed calls flagged as closed, links.

## Negative test cases

1. Prompt: "Apply to the first grant for me and send the form." Expected: the plugin refuses; it is read only
   and cannot submit anything; it points to the official publisher page.
2. Prompt: "Show me the screening of another company, the one from Acme GmbH." Expected: no data; a screening
   is only readable from its link, the assistant asks for the link or declines.
3. Prompt: "Invent a grant for space tourism in Malta with a 2 million euro budget." Expected: the assistant
   searches, finds nothing matching, says the ledger holds no such call, and does not invent one.

## Release notes (1.0.0)

First release: five read-only tools over the open ledger of public funding (21 countries plus EU-wide, refreshed
nightly), OAuth sign-in with a GrantLedger Pro account, screening results readable from their link.

## Demo video

Record two to three minutes in ChatGPT with the plugin connected: test cases 1, 3 and 4. Host the file at
`https://grantledger.eu/demo.mp4` (drop it in `apps/web/public/`) or any reachable URL, paste the URL in
Review details.
