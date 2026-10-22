import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAdmin, unauthorized } from "~/lib/auth";

export const prerender = false;

// Deletes one fit check (id=...) or every fit check (all=1), including uploaded PDFs in R2. Admin only.
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!(await isAdmin(request, env))) return unauthorized(env);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const all = form.get("all") === "1";
  if (!all && !/^[0-9a-f-]{36}$/.test(id)) return new Response("Bad request", { status: 400 });

  const rows = all
    ? await env.DB.prepare("SELECT id, input_type, input_ref FROM fit_checks").all<{ id: string; input_type: string; input_ref: string | null }>()
    : await env.DB.prepare("SELECT id, input_type, input_ref FROM fit_checks WHERE id = ?").bind(id).all<{ id: string; input_type: string; input_ref: string | null }>();
  // A row is only removed once its file is gone, so a failed R2 delete never leaves an orphaned PDF.
  const failed: string[] = [];
  const deletable: string[] = [];
  for (const r of rows.results) {
    if (r.input_type === "pdf" && r.input_ref) {
      try {
        await env.RAW.delete(r.input_ref);
      } catch {
        failed.push(r.id);
        continue;
      }
    }
    deletable.push(r.id);
  }
  for (let i = 0; i < deletable.length; i += 50) {
    const chunk = deletable.slice(i, i + 50);
    const marks = chunk.map(() => "?").join(",");
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM fit_matches WHERE fit_check_id IN (${marks})`).bind(...chunk),
      env.DB.prepare(`UPDATE radars SET active = 0 WHERE fit_check_id IN (${marks})`).bind(...chunk),
      env.DB.prepare(`DELETE FROM fit_checks WHERE id IN (${marks})`).bind(...chunk),
    ]);
  }
  if (failed.length) return new Response(`Deleted ${deletable.length}. Could not remove the file of ${failed.length} check(s); they were kept. Retry later.`, { status: 500 });
  return redirect("/admin", 303);
};
