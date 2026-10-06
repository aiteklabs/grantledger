import type { GrantView } from "./db";
import { fmtDate, parseJson } from "./format";
import { matchGrants } from "./match";
import { ProfileForm } from "./profile-form";
import { profileLimit, randomToken, type Account } from "./account";

// Company profiles of a Pro account ("radars"): each one is a screening the owner saved, re-screened every Monday;
// calls first seen since the last email are sent when any pass the rules.
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

function grantLine(env: Mail, g: GrantView): { text: string; html: string } {
  const url = `${env.SITE_URL}/grants/${g.id}`;
  const deadline = g.closes_at ? `deadline ${fmtDate(g.closes_at)}` : "no deadline";
  const who = [g.funder_name, g.country].filter(Boolean).join(", ");
  return {
    text: `- ${g.title}\n  ${who} · ${deadline}\n  ${url}`,
    html: `<li style="margin:0 0 14px"><a href="${url}" style="color:#171511;font-weight:600">${esc(g.title)}</a><br><span style="color:#6b675f;font-size:14px">${esc(who)} · ${deadline}</span></li>`,
  };
}

function wrap(env: Mail, radar: RadarRow, title: string, intro: string, lines: { text: string; html: string }[], outro: string): { text: string; html: string } {
  const unsub = `${env.SITE_URL}/radar/unsubscribe?id=${radar.id}`;
  const fit = `${env.SITE_URL}/fit/${radar.fit_check_id}`;
  const text = [title, "", intro, "", ...lines.map((l) => l.text), "", outro, "", `Full screening: ${fit}`, `Your profiles: ${env.SITE_URL}/me`, `Stop emails for this profile: ${unsub}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Georgia,serif;color:#171511">
<div style="max-width:640px;margin:0 auto;padding:32px 20px">
<p style="font-family:monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#b4451f;margin:0 0 8px">grantledger radar</p>
<h1 style="font-size:26px;margin:0 0 16px">${esc(title)}</h1>
<p style="font-size:16px;line-height:1.5">${esc(intro)}</p>
<ul style="padding-left:18px;font-size:16px;line-height:1.4">${lines.map((l) => l.html).join("")}</ul>
<p style="font-size:15px;line-height:1.5;color:#3d3a33">${esc(outro)}</p>
<p style="font-size:13px;color:#6b675f;margin-top:32px"><a href="${fit}" style="color:#6b675f">Full screening</a> · <a href="${env.SITE_URL}/me" style="color:#6b675f">Your profiles</a> · <a href="${unsub}" style="color:#6b675f">Stop emails for this profile</a></p>
</div></body></html>`;
  return { text, html };
}

// Weekly: for every active profile, screen it, keep the fits first seen after the last email, send when any.
export async function sendDueRadars(db: D1Database, env: Mail, limit = 500): Promise<{ radars: number; sent: number; errors: string[] }> {
  const rows = (await db.prepare("SELECT * FROM radars WHERE active = 1 ORDER BY last_sent_at ASC LIMIT ?").bind(limit).all<RadarRow>()).results;
  let sent = 0;
  const errors: string[] = [];
  for (const radar of rows) {
    try {
      const parsed = ProfileForm.safeParse(parseJson<unknown>(radar.form, null));
      if (!parsed.success) throw new Error("stored form no longer valid");
      const since = radar.last_sent_at ?? radar.paid_at;
      // Every screened call, so a new one is never hidden behind older, better-ranked ones.
      const { results } = await matchGrants(db, parsed.data, 5000);
      const fresh = results.filter((m) => (m.verdict === "fit" || m.verdict === "eligible") && m.grant.first_seen_at > since).slice(0, 15);
      const now = new Date().toISOString();
      if (fresh.length) {
        const name = radar.company_name || "your company";
        const fits = fresh.filter((m) => m.verdict === "fit").length;
        const body = wrap(
          env,
          radar,
          `${fresh.length} new call${fresh.length === 1 ? "" : "s"} for ${name}`,
          `${fits} fit${fits === 1 ? "s" : ""} your keywords or sector, ${fresh.length - fits} eligible but off-topic. All published since ${fmtDate(since)}.`,
          fresh.map((m) => grantLine(env, m.grant)),
          "Verdicts follow the rules on your screening page; the official call text always wins. Check the deadline on the funder's page before you commit.",
        );
        await env.EMAIL.send({ to: radar.email, from: { email: env.MAIL_FROM, name: "grantledger Radar" }, subject: `${fresh.length} new funding call${fresh.length === 1 ? "" : "s"} for ${name}`, text: body.text, html: body.html });
        sent++;
      }
      await db.prepare("UPDATE radars SET last_sent_at = ? WHERE id = ?").bind(now, radar.id).run();
    } catch (err) {
      errors.push(`${radar.id}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
    }
  }
  return { radars: rows.length, sent, errors };
}
