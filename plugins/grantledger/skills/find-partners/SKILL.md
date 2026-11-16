---
name: find-partners
description: Help the user join a consortium for an EU funding call that needs partners. Show where consortia in preparation look for partners for that exact call, explain how to publish a partner offer on the EU Funding & Tenders Portal and on Ideal-ist, and draft that offer from their GrantLedger profile. Use when the user asks how to find partners or a consortium, how to join one, or how to publish a partner search or a partner offer.
---

# Find consortium partners

Many EU calls cannot be applied to alone. A small organisation rarely builds a consortium; it joins one in preparation, by offering what it does well. `get_grant` returns, for a current EU call that is not single-applicant, a `partner_search` object: the consortium rule, where partners are sought, how to publish an offer, and the fields of the offer. You turn it into two things: a short list of places to look today, and an offer ready to publish.

## Steps

1. Find the call. If the user did not name one, call `my_profiles`, then `get_fit`, and propose the calls whose gaps include partners. Then call `get_grant` with its id.
2. If the record has no `partner_search`, say why: the call takes a single applicant, it is closed, or it is not a call of the EU Funding & Tenders Portal. Stop there.
3. Give `rule` in one sentence, then the places in `find`, each with its link on its own line and one line on what the user sees there. Tell the user to open the list of the call first: it shows who is looking right now.
4. Offer to draft the partner offer. Read the profile from `get_fit` (`form`). Fill the fields of `offer.fields`: the expertise in at most 1000 characters, written for this call and its topic, and at most 10 keywords. State what the organisation brings, the role it wants (partner, not coordinator, unless the user says otherwise), and one proof (a product, a pilot, a customer, an earlier project).
5. Ask for every field the profile does not hold: contact person, telephone, e-mail, earlier EU projects, website. Leave a clear placeholder where the user has not answered.
6. Give the steps of `publish` for each platform, numbered, exactly as returned. Say which one to do first: the EU portal, because Ideal-ist republishes partner searches from it.
7. Offer a short first message to send to an organisation the user picked from the list: who they are, what they bring to this call, one question about the consortium. Five sentences at most.

## Rules

1. You publish nothing and contact nobody. The user publishes the offer and writes to the organisations themselves, with their own accounts.
2. Name an organisation as looking for partners only if the user pasted its listing or its name. The lists change every day and you cannot read them: say so, and send the user to the link.
3. Never invent a fact about the user's organisation, a partner, or an earlier project. A placeholder is better than a guess.
4. Ideal-ist covers Horizon Europe Cluster 4 calls only. Mention it only when `partner_search` lists it.
5. An offer is not an application. Joining a consortium is the coordinator's decision; say so once.
6. Answer in the user's language, but write the offer in English: consortia read English.
