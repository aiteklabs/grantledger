import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAdmin, unauthorized } from "~/lib/auth";
import { enrichBatch } from "~/lib/enrich";
import { geminiConfigured } from "~/lib/gemini";

export const prerender = false;

// POST /api/enrich?source=eu_ft&limit=20&shard=0&shards=4. Admin only (Access cookie or bearer ADMIN_TOKEN). Runs offline
// enrichment for a small batch; shard/shards let parallel callers split the queue without picking the same records.
export const POST: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, env))) return unauthorized(env);
  if (!geminiConfigured(env)) return new Response(JSON.stringify({ error: "model credentials missing" }), { status: 503 });
  const body = request.headers.get("content-type")?.includes("form") ? await request.formData() : null;
  const param = (name: string) => String(body?.get(name) ?? url.searchParams.get(name) ?? "");
  const limit = Math.min(50, Math.max(1, Number(param("limit") || "20") || 20));
  const source = param("source") || undefined;
  const shards = Math.max(1, Number(param("shards") || "1") || 1);
  const shard = Math.min(shards - 1, Math.max(0, Number(param("shard") || "0") || 0));
  const result = await enrichBatch(env, { source, limit, shard, shards });
  return new Response(JSON.stringify(result, null, 2), { headers: { "content-type": "application/json" } });
};
