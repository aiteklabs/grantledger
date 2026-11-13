import { findAlternatives, matchGrants } from "./match";
import { negativeMemo, readinessGaps } from "./readiness";
import type { ProfileForm } from "./profile-form";

// One deterministic screening of a confirmed profile against the current ledger, stored under a fit check id.
// Used by the form submission (new or draft check) and by the re-run button (existing check, same form).
export interface ScreenOpts {
  id: string;
  profile: ProfileForm;
  existing: boolean;
  email: string | null;
  ip_hash: string | null;
  user_agent: string;
  started: number;
  // A screening the caller already ran (the weekly Radar), stored as is instead of screening again.
  matched?: Awaited<ReturnType<typeof matchGrants>>;
}

export async function screenProfile(db: D1Database, opts: ScreenOpts): Promise<void> {
  const { id, profile } = opts;
  const { results, summary } = opts.matched ?? (await matchGrants(db, profile));
  const now = new Date().toISOString();
  // Gaps for fits and eligible calls; a memo (why not, cost, alternatives) for the rest. Alternatives cost one query each, so cap them.
  const extras = await Promise.all(
    results.map(async (m, i) => {
      if (m.verdict === "fit" || m.verdict === "eligible") return { gaps: readinessGaps(m.grant, profile, m.rules), memo: null as null };
      const alt = i < 25 ? await findAlternatives(db, m.grant, results) : {};
      return { gaps: [], memo: negativeMemo(m.grant, m.rules, alt, profile) };
    }),
  );
  const statements = [
    opts.existing
      ? db.prepare("UPDATE fit_checks SET form = ?, summary = ?, contact_email = COALESCE(?, contact_email), status = 'done', mode = 'sql', finished_at = ? WHERE id = ?").bind(JSON.stringify(profile), JSON.stringify(summary), opts.email, now, id)
      : db.prepare("INSERT INTO fit_checks (id, created_at, input_type, form, summary, contact_email, status, mode, duration_ms, ip_hash, user_agent, finished_at) VALUES (?, ?, 'form', ?, ?, ?, 'done', 'sql', ?, ?, ?, ?)").bind(
          id, now, JSON.stringify(profile), JSON.stringify(summary), opts.email, Date.now() - opts.started, opts.ip_hash, opts.user_agent.slice(0, 300), now,
        ),
    // Saved profiles follow the form they were saved from, whether it was re-run or edited and screened again.
    db.prepare("UPDATE radars SET form = ?, company_name = ? WHERE fit_check_id = ? AND active = 1").bind(JSON.stringify(profile), profile.company_name || null, id),
    db.prepare("DELETE FROM fit_matches WHERE fit_check_id = ?").bind(id),
    ...results.map((m, i) =>
      db.prepare("INSERT INTO fit_matches (fit_check_id, grant_id, rank, verdict, score, reasons, missing, gaps, memo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
        id, m.grant.id, i + 1, m.verdict, m.score,
        JSON.stringify(m.rules.filter((r) => r.state === "match").map((r) => r.text)),
        JSON.stringify(m.rules.filter((r) => r.state !== "match").map((r) => (r.state === "mismatch" ? `No: ${r.text}` : `Check: ${r.text}`))),
        JSON.stringify(extras[i]!.gaps),
        extras[i]!.memo ? JSON.stringify(extras[i]!.memo) : null,
      ),
    ),
  ];
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
}
