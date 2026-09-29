import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getFitCheck, getFitMatches } from "~/lib/db";
import { parseJson } from "~/lib/format";

export const prerender = false;

// JSON export of one result: the confirmed form, the summary and every match with its rules, gaps and memo.
export const GET: APIRoute = async ({ params }) => {
  const privateHeaders = { "content-type": "application/json", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };
  const id = params.id ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const check = await getFitCheck(env.DB, id);
  if (!check || check.status !== "done") return new Response("Not found", { status: 404 });
  const matches = await getFitMatches(env.DB, id);
  const body = {
    id,
    created_at: check.created_at,
    form: parseJson(check.form, null),
    summary: parseJson(check.summary, null),
    matches: matches.map((m) => ({
      grant_id: m.grant_id,
      title: m.grant.title,
      source_url: m.grant.source_url,
      verdict: m.verdict,
      score: m.score,
      matched: parseJson(m.reasons, []),
      to_check: parseJson(m.missing, []),
      gaps: parseJson((m as { gaps?: string }).gaps ?? null, []),
      memo: parseJson((m as { memo?: string | null }).memo ?? null, null),
    })),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { ...privateHeaders, "content-disposition": `attachment; filename="grantledger-${id.slice(0, 8)}.json"` } });
};
