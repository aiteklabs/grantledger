import { fmtDate, parseJson } from "./format";
import { SCREEN_LIMIT, matchGrants, type MatchResult } from "./match";
import { ProfileForm } from "./profile-form";
import { screenProfile } from "./screen";
import { profileLimit, randomToken, type Account } from "./account";

// Company profiles of a Pro account ("radars"): each one is a screening the owner saved, re-screened every Monday;
// calls that pass the rules and were never emailed to that profile are sent when there are any.
export interface RadarRow {
  id: string;
  email: string;
  fit_check_id: string;
  form: string;
  company_name: string | null;
  stripe_session_id: string | null;
  paid_at: string;
  created_at: string;
  last_sent_at: string | null;
  active: number;
}

type Mail = Pick<Cloudflare.Env, "EMAIL" | "MAIL_FROM" | "SITE_URL">;

export async function listProfiles(db: D1Database, email: string): Promise<RadarRow[]> {
  return (await db.prepare("SELECT * FROM radars WHERE email = ? AND active = 1 ORDER BY created_at").bind(email).all<RadarRow>()).results;
}

// Saves a finished screening as one of the account's profiles. Returns the profile id, "full" at the limit, or null
// when the screening has no stored form. Saving the same screening twice returns the existing profile.
export async function saveProfile(db: D1Database, account: Account, fitCheckId: string): Promise<string | "full" | null> {
  const email = account.email;
  const existing = await db.prepare("SELECT id FROM radars WHERE email = ? AND fit_check_id = ? AND active = 1").bind(email, fitCheckId).first<{ id: string }>();
  if (existing) return existing.id;
  const count = (await db.prepare("SELECT COUNT(*) AS n FROM radars WHERE email = ? AND active = 1").bind(email).first<{ n: number }>())?.n ?? 0;
  if (count >= profileLimit(account)) return "full";
  const row = await db.prepare("SELECT form FROM fit_checks WHERE id = ? AND status = 'done'").bind(fitCheckId).first<{ form: string | null }>();
  const parsed = ProfileForm.safeParse(parseJson<unknown>(row?.form ?? null, null));
  if (!parsed.success) return null;
  const id = randomToken(18);
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO radars (id, email, fit_check_id, form, company_name, paid_at, created_at, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, email, fitCheckId, JSON.stringify(parsed.data), parsed.data.company_name || null, now, now, now)
    .run();
  // Two saves at once can both pass the count above; the later one steps back.
  const after = (await db.prepare("SELECT COUNT(*) AS n FROM radars WHERE email = ? AND active = 1").bind(email).first<{ n: number }>())?.n ?? 0;
  if (after > profileLimit(account)) {
    await db.prepare("DELETE FROM radars WHERE id = ?").bind(id).run();
    return "full";
  }
  return id;
}

export async function removeProfile(db: D1Database, email: string, id: string): Promise<void> {
  await db.prepare("UPDATE radars SET active = 0 WHERE id = ? AND email = ?").bind(id, email).run();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// Calls per email. Relevant calls beyond it stay due for the next one.
const EMAIL_MAX = 15;
const ELIGIBILITY_RULES = ["country", "region", "beneficiary", "sector", "size", "age", "consortium"];

// The one rule worth a line in the email: what links a fit to the profile, what is left to verify otherwise.
function why(m: MatchResult): string {
  if (m.verdict === "fit") return m.rules.find((r) => r.state === "match" && (["theme", "keywords", "applicant"].includes(r.rule) || r.text.startsWith("Targets your sector")))?.text ?? "";
  if (m.verdict === "not_yet") return `To verify: ${m.rules.find((r) => r.state === "unknown" && ELIGIBILITY_RULES.includes(r.rule))?.text ?? "read the call"}`;
  return "";
}

type Line = { text: string; html: string };

function grantLine(env: Mail, m: MatchResult): Line {
  const g = m.grant;
  const url = `${env.SITE_URL}/grants/${g.id}`;
  const deadline = g.closes_at ? `deadline ${fmtDate(g.closes_at)}` : "no deadline";
  const who = [g.funder_name, g.country].filter(Boolean).join(", ");
  const reason = why(m);
  return {
    text: `- ${g.title}\n  ${who} · ${deadline}${reason ? `\n  ${reason}` : ""}\n  ${url}`,
    html: `<li style="margin:0 0 14px"><a href="${url}" style="color:#171511;font-weight:600">${esc(g.title)}</a><br><span style="color:#6b675f;font-size:14px">${esc(who)} · ${deadline}${reason ? `<br>${esc(reason)}` : ""}</span></li>`,
  };
}

function wrap(env: Mail, radar: RadarRow, title: string, intro: string, groups: { heading: string; lines: Line[] }[], outro: string): Line {
  const unsub = `${env.SITE_URL}/radar/unsubscribe?id=${radar.id}`;
  const fit = `${env.SITE_URL}/fit/${radar.fit_check_id}`;
  const text = [title, "", intro, ...groups.flatMap((g) => ["", g.heading, ...g.lines.map((l) => l.text)]), "", outro, "", `Full screening: ${fit}`, `Your profiles: ${env.SITE_URL}/me`, `Stop emails for this profile: ${unsub}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Georgia,serif;color:#171511">
<div style="max-width:640px;margin:0 auto;padding:32px 20px">
<p style="font-family:monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#b4451f;margin:0 0 8px">grantledger radar</p>
<h1 style="font-size:26px;margin:0 0 16px">${esc(title)}</h1>
<p style="font-size:16px;line-height:1.5">${esc(intro)}</p>
${groups.map((g) => `<h2 style="font-size:18px;margin:24px 0 10px">${esc(g.heading)}</h2><ul style="padding-left:18px;font-size:16px;line-height:1.4">${g.lines.map((l) => l.html).join("")}</ul>`).join("")}
<p style="font-size:15px;line-height:1.5;color:#3d3a33">${esc(outro)}</p>
<p style="font-size:13px;color:#6b675f;margin-top:32px"><a href="${fit}" style="color:#6b675f">Full screening</a> · <a href="${env.SITE_URL}/me" style="color:#6b675f">Your profiles</a> · <a href="${unsub}" style="color:#6b675f">Stop emails for this profile</a></p>
</div></body></html>`;
  return { text, html };
}

// What the Radar emailed for one profile, newest first.
export async function sentCalls(db: D1Database, radarId: string, limit = EMAIL_MAX) {
  return (
    await db
      .prepare("SELECT s.grant_id, s.verdict, s.sent_at, g.title, g.closes_at, g.source_url FROM radar_sent s JOIN grants g ON g.id = s.grant_id WHERE s.radar_id = ? ORDER BY s.sent_at DESC, g.closes_at LIMIT ?")
      .bind(radarId, limit)
      .all<{ grant_id: string; verdict: string; sent_at: string; title: string; closes_at: string | null; source_url: string }>()
  ).results;
}

// Weekly: for every active profile, screen it, email the calls that pass and were never sent to it, log them, and
// store the screening so the profile's page and the assistants read this week's ledger.
export async function sendDueRadars(db: D1Database, env: Mail, limit = 500): Promise<{ radars: number; sent: number; errors: string[] }> {
  const rows = (await db.prepare("SELECT * FROM radars WHERE active = 1 ORDER BY last_sent_at ASC LIMIT ?").bind(limit).all<RadarRow>()).results;
  let sent = 0;
  const errors: string[] = [];
  for (const radar of rows) {
    try {
      const parsed = ProfileForm.safeParse(parseJson<unknown>(radar.form, null));
      if (!parsed.success) throw new Error("stored form no longer valid");
      const since = radar.last_sent_at ?? radar.paid_at;
      // Every screened call, plus every call first seen since the profile was saved, so a new one is never hidden
      // behind older, better-ranked ones or cut by the pool cap.
      const matched = await matchGrants(db, parsed.data, 5000, radar.created_at);
      const before = new Map((await db.prepare("SELECT grant_id, verdict FROM radar_sent WHERE radar_id = ?").bind(radar.id).all<{ grant_id: string; verdict: string }>()).results.map((r) => [r.grant_id, r.verdict]));
      // Calls already in the ledger when the profile was saved were on its screening page. Among the later ones:
      // a fit, or an on-topic call with points to verify and no failed condition, stays due until it is sent, also
      // when it went out earlier as off-topic (its enrichment landed since). An off-topic call is sent only the week
      // it appears, so a backlog of them never pads every email.
      const fresh = matched.results
        .filter((m) => {
          if (m.grant.first_seen_at <= radar.created_at) return false;
          const prev = before.get(m.grant.id);
          if (m.verdict === "fit" || (m.verdict === "not_yet" && m.rules.every((r) => r.state !== "mismatch"))) return !prev || prev === "eligible";
          return m.verdict === "eligible" && !prev && m.grant.first_seen_at > since;
        })
        .slice(0, EMAIL_MAX);
      const now = new Date().toISOString();
      if (fresh.length) {
        const name = radar.company_name || "your company";
        const of = (v: MatchResult["verdict"]) => fresh.filter((m) => m.verdict === v);
        const groups = [
          { heading: "Fits", lines: of("fit").map((m) => grantLine(env, m)) },
          { heading: "On topic, one or two points to verify", lines: of("not_yet").map((m) => grantLine(env, m)) },
          { heading: "Eligible, off-topic", lines: of("eligible").map((m) => grantLine(env, m)) },
        ].filter((g) => g.lines.length);
        const body = wrap(
          env,
          radar,
          `${fresh.length} new call${fresh.length === 1 ? "" : "s"} for ${name}`,
          `${of("fit").length} fit your keywords or sector, ${of("not_yet").length} on topic with points to verify, ${of("eligible").length} eligible but off-topic.`,
          groups,
          "Verdicts follow the rules on your screening page; the official call text always wins. Check the deadline on the funder's page before you commit.",
        );
        await env.EMAIL.send({ to: radar.email, from: { email: env.MAIL_FROM, name: "grantledger Radar" }, subject: `${fresh.length} new funding call${fresh.length === 1 ? "" : "s"} for ${name}`, text: body.text, html: body.html });
        sent++;
      }
      await db.batch([
        ...fresh.map((m) =>
          db.prepare("INSERT INTO radar_sent (radar_id, grant_id, verdict, sent_at) VALUES (?, ?, ?, ?) ON CONFLICT(radar_id, grant_id) DO UPDATE SET verdict = excluded.verdict, sent_at = excluded.sent_at").bind(radar.id, m.grant.id, m.verdict, now),
        ),
        db.prepare("UPDATE radars SET last_sent_at = ? WHERE id = ?").bind(now, radar.id),
      ]);
      await screenProfile(db, {
        id: radar.fit_check_id,
        profile: parsed.data,
        existing: true,
        email: null,
        ip_hash: null,
        user_agent: "",
        started: Date.now(),
        matched: { results: matched.results.slice(0, SCREEN_LIMIT), summary: { ...matched.summary, shown: Math.min(matched.results.length, SCREEN_LIMIT) } },
      });
    } catch (err) {
      errors.push(`${radar.id}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
    }
  }
  return { radars: rows.length, sent, errors };
}
