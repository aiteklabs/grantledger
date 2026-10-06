import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fitJson } from "~/lib/api";

export const prerender = false;

// JSON export of one result: the confirmed form, the summary and every match with its rules, gaps and memo.
export const GET: APIRoute = async ({ params }) => {
  const privateHeaders = { "content-type": "application/json", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };
  const id = params.id ?? "";
  const body = await fitJson(env.DB, id);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(body, null, 2), { headers: { ...privateHeaders, "content-disposition": `attachment; filename="grantledger-${id.slice(0, 8)}.json"` } });
};
