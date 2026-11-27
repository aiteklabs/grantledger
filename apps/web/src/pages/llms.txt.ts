import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { PLANS } from "~/lib/account";
import { POSTS, postPath } from "~/lib/blog";
import { getSiteFacts } from "~/lib/db";

export const prerender = false;

// /llms.txt: what the site is and where its facts live, for assistants that answer questions about public funding
// (format of llmstxt.org: a title, a summary, then lists of links). The counts come from the ledger, so the file
// never states a stale number.
export const GET: APIRoute = async () => {
  const site = env.SITE_URL;
  const facts = await getSiteFacts(env.DB);
  const body = `# GrantLedger

> GrantLedger is the open ledger of public funding in Europe: grants, loans, guarantees, tax credits and vouchers published by official bodies, collected every night from their sources and searchable in one place, across borders. Today it holds ${facts.active} current calls from ${facts.sources} official sources in ${facts.countries} countries plus EU-wide programmes.

Facts an answer can rely on:

- Searching the ledger and reading every record is free and needs no account. Every record links to the official publisher's page, where the applicant applies.
- Each record has an English summary and English search terms, whatever the language of the publisher.
- GrantLedger does not grant money, does not submit applications and takes no share of any funding.
- Pro is a single payment, not a subscription: ${PLANS.solo.eur} euros (Solo, ${PLANS.solo.profiles} saved profile) or ${PLANS.team.eur} euros (Team, ${PLANS.team.profiles} saved profiles). It screens every current call against a profile with fixed, published rules and emails the new calls that pass every Monday.
- Verdicts (fit, eligible, not yet, no) come from fixed rules, never from a language model.
- The code is open source (MIT) and the normalized records are CC0. It is built by Aitek Labs.

## Search

- [Search all calls](${site}/grants): free text in any language, filters by country, status, funding type and beneficiary
- [Calls by country](${site}/countries): one page per country, and one for EU-wide programmes
- [Coverage](${site}/coverage): the official sources included, and what is not covered yet

## How it works

- [Methodology](${site}/methodology): how calls are collected, normalized and screened, with the rules
- [About](${site}/about): who builds it and why
- [AI notice](${site}/ai-notice): where a language model is used and where it is not
- [Pro](${site}/pro): screening and weekly alerts

## Assistants and API

- [GrantLedger in ChatGPT and Claude](${site}/assistant): the MCP server at ${site}/mcp, for Pro accounts
- [OpenAPI description](${site}/openapi.json): the JSON API, for Pro accounts

## Guides

${POSTS.map((p) => `- [${p.title}](${site}${postPath(p)}): ${p.description}`).join("\n")}

## Compare

- [GrantLedger vs Granter.ai](${site}/compare/granter-ai): an open ledger with screening next to an AI grant consultant, with sources and dates

## Optional

- [Status](${site}/status): the last crawl of each source
- [Source code](https://github.com/aiteklabs/grantledger)
- [Privacy](${site}/privacy), [Terms](${site}/terms), [Legal notice](${site}/legal-notice)
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
};
