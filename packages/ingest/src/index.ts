import { SourceId, type Grant } from "@grantledger/schema";
import { upsertGrants } from "./db";
import { sources, type RawRecord } from "./sources";
import type { Env } from "./env";
import { IngestWorkflow, type IngestParams } from "./workflow";

export { IngestWorkflow };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

export default {
  // 03:00 UTC: crawl every source (incremental where the source supports it, full recrawl otherwise).
  // 05:00 UTC: enrich up to 150 newly crawled open calls through the site's endpoint, under its monthly budget.
  // Monday 06:00 UTC: the weekly Radar emails for Pro profiles, through the site's endpoint.
  async scheduled(controller, env, ctx) {
    // Matched on the hour: the day is written MON in the config (a bare 1 means Sunday on Cloudflare) and the
    // runtime may hand it back in another spelling.
    if (controller.cron.startsWith("0 6 ")) {
      if (!env.WEB_URL || !env.ADMIN_TOKEN) return;
      ctx.waitUntil(
        (async () => {
          // The site handles a page of profiles per call and names the profile to continue from.
          let after = "";
          for (let i = 0; i < 200; i++) {
            const res = await fetch(`${env.WEB_URL}/api/radar-send?after=${after}`, { method: "POST", headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, "content-type": "application/json" } });
            if (!res.ok) {
              console.error(`radar-send answered ${res.status} after "${after}"`);
              break;
            }
            const out = (await res.json().catch(() => ({}))) as { next?: string | null };
            if (!out.next) break;
            after = out.next;
          }
        })(),
      );
      return;
    }
    if (controller.cron === "0 5 * * *") {
      if (!env.WEB_URL || !env.ADMIN_TOKEN) return;
      ctx.waitUntil(
        (async () => {
          for (let i = 0; i < 3; i++) {
            // A JSON content type marks this as a server call; the site rejects cross-site form posts without one.
            const res = await fetch(`${env.WEB_URL}/api/enrich?limit=50`, { method: "POST", headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, "content-type": "application/json" } });
            const out = (await res.json().catch(() => ({}))) as { done?: number };
            if (!res.ok || !out.done) break;
          }
        })(),
      );
      return;
    }
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const nightly = SourceId.options.filter((source) => sources[source].runner !== "local");
    // Only BDNS crawls incrementally; every other feed is recrawled in full, which lets the workflow close calls
    // the publisher no longer lists.
    ctx.waitUntil(Promise.all(nightly.map((source) => env.INGEST.create({ params: { source, since: source === "es_bdns" ? since : undefined } }))));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      const row = await env.DB.prepare("SELECT source, COUNT(*) AS n, MAX(last_seen_at) AS last_seen FROM grants GROUP BY source").all();
      return json({ ok: true, sources: row.results });
    }

    if (url.pathname === "/runs") {
      const runs = await env.DB.prepare("SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 50").all();
      return json(runs.results);
    }

    // Feeds whose latest run ended in an error. The GitHub runner reads this and crawls them from its own network.
    if (url.pathname === "/failing") {
      const rows = await env.DB.prepare("SELECT source FROM ingest_runs r WHERE error IS NOT NULL AND started_at = (SELECT MAX(started_at) FROM ingest_runs WHERE source = r.source) ORDER BY source").all<{ source: string }>();
      return json(rows.results.map((r) => r.source));
    }

    if (req.method === "POST" && url.pathname === "/run") {
      if (!env.ADMIN_TOKEN || req.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);
      const body = (await req.json().catch(() => ({}))) as Partial<IngestParams>;
      const parsed = SourceId.safeParse(body.source);
      if (!parsed.success) return json({ error: `source must be one of ${SourceId.options.join(", ")}` }, 400);
      const instance = await env.INGEST.create({
        params: { source: parsed.data, cursor: body.cursor, since: body.since, maxPages: body.maxPages ?? 0 },
      });
      return json({ instanceId: instance.id });
    }

    // Local runner: sources that reject Cloudflare egress are crawled on a trusted machine and pushed here page by page.
    if (req.method === "POST" && url.pathname === "/ingest") {
      if (!env.ADMIN_TOKEN || req.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);
      const body = (await req.json()) as { source: string; grants: Grant[]; raws: RawRecord[] };
      const parsed = SourceId.safeParse(body.source);
      if (!parsed.success) return json({ error: "unknown source" }, 400);
      const result = await upsertGrants(env.DB, env.RAW, body.grants ?? [], body.raws ?? []);
      // One run row per source and day for pushes from the local runner, so they show up next to Worker crawls.
      const now = new Date().toISOString();
      const runId = `local:${parsed.data}:${now.slice(0, 10)}`;
      await env.DB.prepare(
        `INSERT INTO ingest_runs (id, source, cursor, started_at, finished_at, pages, upserted, changed) VALUES (?, ?, 'local runner', ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET finished_at = excluded.finished_at, pages = pages + 1, upserted = upserted + excluded.upserted, changed = changed + excluded.changed`,
      )
        .bind(runId, parsed.data, now, now, result.upserted, result.changed)
        .run();
      return json(result);
    }

    if (url.pathname.startsWith("/status/")) {
      const instance = await env.INGEST.get(url.pathname.slice("/status/".length));
      return json(await instance.status());
    }

    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
