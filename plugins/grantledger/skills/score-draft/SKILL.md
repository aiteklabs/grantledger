---
name: score-draft
description: Score the user's own application draft against the published evaluation criteria of one funding call from GrantLedger, and list the gaps to fix before submission. Use when the user shares a draft, a proposal or an answer to a form question and asks whether it is good enough, what is missing, or how it would be evaluated.
---

# Score an application draft

The user wrote a draft for a funding call and wants to know how it stands before they submit. You read the call's own criteria and score the draft against them. The draft stays in this conversation: no GrantLedger tool takes the text of a draft.

## Steps

1. Identify the call. If the user did not name it, call `my_profiles`, then `get_fit`, and ask which call the draft is for. Then call `get_grant` with its id.
2. Check the verdict. If the screening says `no` or `not_yet` for this call, say so first with the rule it relies on. Verdicts come from fixed rules on grantledger.eu; do not overrule them. Score the draft only if the user still wants it.
3. Find the evaluation criteria. They are on the official publisher page (`source_url`) or in the files listed under `documents`: the call text, the guide for applicants, the evaluation grid. Open them with your web or file tools. If you cannot open them, ask the user to paste or upload the call text. The GrantLedger record holds a summary, not the criteria.
4. List the criteria exactly as published, with their weights, thresholds and page or word limits when the call states them. Quote the source of each one.
5. Score the draft per criterion, on the call's own scale when it has one, otherwise 0 to 5. For each: what the draft already shows, what an evaluator would miss, and the one change that gains the most points.
6. End with the three changes to make first, in order of points gained, and say what you could not check.

## Rules

1. Never invent a criterion, a weight or a threshold. If the criteria cannot be read, say so and stop instead of scoring against generic ones.
2. Your score is an estimate from one reading of the published criteria. It is not a GrantLedger verdict and not the funder's evaluation; say this once, next to the total.
3. Judge only what is written in the draft. A claim without evidence (a number, a source, a letter, a reference) counts as a gap.
4. Check the formal rules too: language, length, mandatory sections, annexes, deadline. A strong draft that breaks one is rejected before it is read.
5. Use the profile from `get_fit` to spot statements in the draft that contradict what the user confirmed (size, age, country, sector). Point them out; do not correct them silently.
6. Answer in the user's language. Keep the draft and the profile inside this conversation.
7. The user submits themselves on the official publisher page. You cannot submit anything.
