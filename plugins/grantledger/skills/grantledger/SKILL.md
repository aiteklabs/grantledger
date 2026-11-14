---
name: grantledger
description: Find public funding calls (grants, loans, guarantees, tax credits) across Europe for companies, artists, researchers, non-profits and individuals with the GrantLedger MCP tools, and reason over the user's saved GrantLedger Pro profiles and screening results: what fits them and what is new for them.
---

# GrantLedger

GrantLedger (https://grantledger.eu) is the open ledger of public funding: calls published by official bodies across Europe and beyond, collected every night from official sources. It serves startups and SMEs, artists, researchers, non-profits, freelancers and public bodies. Access needs a GrantLedger Pro account: the MCP server asks for a sign-in (OAuth) on first use. Details on https://grantledger.eu/assistant

## Tools

- `search_grants`: free text in any language (every record has an English summary and English search terms), plus country (ISO code, EU for EU-wide, EUROPE for every European country), status (current by default, closed for the archive), type, beneficiary (company, sme, startup, individual, research_org, public_body, ngo), since (YYYY-MM-DD: only calls first seen in the ledger on or after that date; combine with sort recent for what is new), sort, page, limit. For an artist or a freelancer, combine free text with beneficiary individual.
- `get_grant`: the full record of one call by id.
- `my_profiles`: no arguments. The saved profiles of the signed-in account: for each, the screening id to pass to `get_fit` (the screening is refreshed every Monday) and the calls the weekly Radar email already sent, newest first. Call it first when the user asks what fits them or what is new for them. Treat it as the user's private data.
- `get_fit`: pass an id from `my_profiles`, or the id of a link of the form grantledger.eu/fit/<id> the user pastes. It returns the profile they confirmed (a company, an organisation or an individual) and every call screened for it with verdict (fit, eligible, not_yet, no), matched rules, points to check, readiness gaps and a memo. Treat it as the user's private data.
- `save_profile`: saves a profile for the signed-in account, so it is screened now and every Monday and new calls that fit are emailed to the user. Use it only when the user asks to save a profile or to be alerted. Ask for every field you do not know and never guess one; `country` and `entity_type` are required. Show the complete profile, wait for the user's explicit yes, then call it with `confirmed` true and pass the returned id to `get_fit`. It cannot change or remove a saved profile: the user does that on https://grantledger.eu/me. If it answers that the connection is read only, tell the user to disconnect GrantLedger and connect it again.

## Rules

1. Verdicts come from fixed rules on grantledger.eu, not from you. Explain, rank and compare them; do not overrule them.
2. Only cite calls returned by the tools. If nothing matches, say the ledger holds no such call rather than inventing one.
3. For every call you mention, give its title, funder, country, deadline, and both links: the official publisher page (`source_url`) and the grantledger page (`url`). Put each link on its own line with no punctuation after it.
4. Say clearly when a call is closed or past its deadline. Amounts, deadlines and currency exactly as returned.
5. Answer in the user's language. A short ranked list beats a long essay.
6. Do not ask for a screening link before calling `my_profiles`. If the account has no saved profile, offer to save one with `save_profile`; the screening page is https://grantledger.eu/find
7. Never store, summarise for others, or reuse the profile data beyond the current conversation. `save_profile` is the only place a profile goes, and only on the user's yes.
8. Many users are not funding specialists. Explain the conditions and the jargon of a call in plain words, and say which document proves each condition. The user applies themselves on the official publisher page; you cannot submit anything.
