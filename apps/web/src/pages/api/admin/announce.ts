import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAdmin, unauthorized } from "~/lib/auth";

export const prerender = false;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
// Escapes a paragraph, turns its addresses into links and its line breaks into <br>.
const para = (s: string) => esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,;:)]/g, (u) => `<a href="${u}" style="color:#171511">${u}</a>`).replace(/\n/g, "<br>");

// POST /api/admin/announce: one service message to the paid accounts, written on the admin page. Admin only.
// The form sends a subject, a plain-text body (blank line between paragraphs) and either "test" (one address,
// nothing else is sent) or "all". "all" skips the addresses on the site's own domain, which are accounts made by
// hand, and the reviewer account of the assistant directories.
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!(await isAdmin(request, env))) return unauthorized(env);
  const form = await request.formData();
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const mode = String(form.get("mode") ?? "");
  const test = String(form.get("test") ?? "").trim().toLowerCase();
  if (!subject || !body) return new Response("Subject and body are required", { status: 400 });

  let to: string[];
  if (mode === "test") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(test)) return new Response("Bad test address", { status: 400 });
    to = [test];
  } else if (mode === "all") {
    const own = `@${new URL(env.SITE_URL).hostname}`;
    const rows = (await env.DB.prepare("SELECT email FROM accounts WHERE paid_at IS NOT NULL ORDER BY email").all<{ email: string }>()).results;
    to = rows.map((r) => r.email).filter((e) => !e.endsWith(own) && e !== env.REVIEW_EMAIL?.toLowerCase());
  } else return new Response("Bad mode", { status: 400 });

  const footer = `You receive this message because you have a grantledger Pro account. Your profiles: ${env.SITE_URL}/me`;
  const text = `${subject}\n\n${body}\n\n${footer}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Georgia,serif;color:#171511"><div style="max-width:600px;margin:0 auto;padding:32px 20px">
<p style="font-family:monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#b4451f;margin:0 0 8px">grantledger</p>
<h1 style="font-size:24px;margin:0 0 16px">${esc(subject)}</h1>
${body.split(/\n{2,}/).map((p) => `<p style="font-size:16px;line-height:1.5">${para(p)}</p>`).join("\n")}
<p style="font-size:13px;color:#6b675f;margin-top:32px">${para(footer)}</p></div></body></html>`;

  let sent = 0;
  let failed = 0;
  for (const email of to) {
    try {
      await env.EMAIL.send({ to: email, from: { email: env.MAIL_FROM, name: "grantledger" }, subject, text, html });
      sent++;
    } catch (err) {
      failed++;
      console.error("announce failed for one account", err instanceof Error ? err.message : err);
    }
  }
  return redirect(`/admin?announced=${sent}&failed=${failed}&mode=${mode}#announce`, 303);
};
