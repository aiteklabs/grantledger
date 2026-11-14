---
name: plan-application
description: Turn the readiness gaps of a GrantLedger screening into a dated work plan for one funding call, counted back from its deadline. Use when the user asks what to prepare, how long an application takes, whether they can still make a deadline, or which documents and partners they need first.
---

# Plan an application

A GrantLedger screening lists, for every call that fits, the readiness gaps: what is missing, what to check, and a rough number of hours for each. You turn that list into a plan the user can follow, counted back from the deadline.

## Steps

1. Call `my_profiles`, then `get_fit` for the profile, and find the call in `matches`. If the user did not name a call, ask which one. Call `get_grant` for its dates and documents.
2. Read `gaps` for that call. Each gap has a bucket (documents, evidence, compliance, partners, narrative), a text, hours and a state (`missing`, `check`, `ok`). Leave out the gaps with state `ok`. Only calls with verdict `fit` or `eligible` carry gaps: for `not_yet` or `no`, give the reason and the alternatives from `memo` instead of a plan.
3. Order the work: first what depends on other people (partners, letters, registrations, certificates), because their delay is not in the user's hands; then evidence; then the narrative; then the final checks.
4. Count back from `closes_at`. Give each task a date to start and a date to finish, and keep the last three working days free for the submission itself.
5. Say whether the deadline is realistic: add the hours of the open gaps and compare with the days left. If it is not, say so plainly and look for a later cut-off of the same programme with `search_grants`.
6. End with the one task to start today.

## Rules

1. The hours are rough estimates of a first-time applicant's own time, set by fixed rules on grantledger.eu. Present them as estimates; do not present them as measured.
2. Use only the gaps returned by `get_fit`. If the official page (`source_url`) lists a document the gaps do not mention, add it and say it comes from the call text.
3. If `closes_at` is empty, say the call has no published deadline and plan by duration instead of by date.
4. Say clearly when the call is closed or the deadline has passed, and do not plan for it.
5. Answer in the user's language. A table with task, hours, start and finish beats a long text.
6. The user applies themselves on the official publisher page. You cannot submit anything.
