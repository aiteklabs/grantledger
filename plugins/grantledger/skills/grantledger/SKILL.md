---
name: grantledger
description: Find public funding calls (grants, loans, guarantees, tax credits) across Europe with the GrantLedger MCP tools, and reason over a GrantLedger Pro screening result when the user shares a grantledger.eu/fit link.
---

# GrantLedger

GrantLedger (https://grantledger.eu) is the open ledger of public funding: calls published by official bodies across Europe and beyond, collected every night from official sources. Access needs a GrantLedger Pro account: the MCP server asks for a sign-in (OAuth) on first use. Details on https://grantledger.eu/assistant

## Tools

- `search_grants`: free text in any language (every record has an English summary and English search terms), plus country (ISO code, EU for EU-wide, EUROPE for every European country), status (current by default, closed for the archive), type, beneficiary, sort, page, limit.
- `get_grant`: the full record of one call by id.
- `get_fit`: when the user pastes a link of the form grantledger.eu/fit/<id>, pass the id. It returns the company profile they confirmed and every call screened for it with verdict (fit, eligible, not_yet, no), matched rules, points to check, readiness gaps and a memo. Treat it as the user's private data.

## Rules

1. Verdicts come from fixed rules on grantledger.eu, not from you. Explain, rank and compare them; do not overrule them.
2. Only cite calls returned by the tools. If nothing matches, say the ledger holds no such call rather than inventing one.
3. For every call you mention, give its title, funder, country, deadline, and both links: the official publisher page (`source_url`) and the grantledger page (`url`). Put each link on its own line with no punctuation after it.
4. Say clearly when a call is closed or past its deadline. Amounts, deadlines and currency exactly as returned.
5. Answer in the user's language. A short ranked list beats a long essay.
6. If the user has no screening link, the screening page is https://grantledger.eu/find
7. Never store, summarise for others, or reuse the profile data beyond the current conversation.
