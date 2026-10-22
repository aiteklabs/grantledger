import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { SourceId } from "@grantledger/schema";
import { upsertGrants } from "./db";
import { sources } from "./sources";
import type { Env } from "./env";

export interface IngestParams {
  source: SourceId;
  cursor?: string;
  since?: string;
  // Stop after this many pages (0 = no limit). Used for smoke tests.
  maxPages?: number;
  runId?: string;
  // Set on the instance spawned after a failed crawl, so a failure is retried once and not forever.
  retry?: boolean;
}

const RETRY_DELAY = "1 hour";

// One instance crawls up to PAGES_PER_INSTANCE pages, then spawns a continuation instance.
// This keeps every instance under the Workflows step limit and lets a 650k-record crawl resume.
export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
    const { source: sourceId, since, maxPages = 0 } = event.payload;
    const source = sources[sourceId];
    const perInstance = Number(this.env.PAGES_PER_INSTANCE ?? "50");
    const runId = event.payload.runId ?? event.instanceId;
    let cursor: string | null = event.payload.cursor ?? source.start(since);

    await step.do("start run", async () => {
      await this.env.DB.prepare(
        "INSERT INTO ingest_runs (id, source, cursor, started_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET cursor = excluded.cursor",
      )
        .bind(runId, sourceId, cursor, new Date().toISOString())
        .run();
    });

    let pages = 0;
    try {
    while (cursor && pages < perInstance && (maxPages === 0 || pages < maxPages)) {
      const current = cursor;
      const result: { next: string | null; upserted: number; changed: number } = await step.do(
        `page ${pages} ${current.slice(0, 40)}`,
        { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "10 minutes" },
        async () => {
          const page = await source.fetchPage(current);
          const res = await upsertGrants(this.env.DB, this.env.RAW, page.grants, page.raws);
          await this.env.DB.prepare("UPDATE ingest_runs SET cursor = ?, pages = pages + 1, upserted = upserted + ?, changed = changed + ? WHERE id = ?")
            .bind(page.next, res.upserted, res.changed, runId)
            .run();
          return { next: page.next, ...res };
        },
      );
      cursor = result.next;
      pages++;
    }
    } catch (err) {
      // Record the failure on the run row, then let the instance fail so it shows as errored in Workflows too.
      const message = err instanceof Error ? err.message : String(err);
      await step.do("record error", async () => {
        await this.env.DB.prepare("UPDATE ingest_runs SET error = ?, finished_at = ? WHERE id = ?").bind(message.slice(0, 500), new Date().toISOString(), runId).run();
      });
      // A publisher that is down or rate limiting at 03:00 is usually fine an hour later: crawl once more from the
      // start, as a new run. Only one retry, so a hard block does not spawn instances every hour.
      if (!event.payload.retry) {
        await step.sleep("wait before retry", RETRY_DELAY);
        await step.do("spawn retry", async () => {
          await this.env.INGEST.create({ params: { source: sourceId, since, maxPages, retry: true } });
        });
      }
      throw err;
    }

    if (cursor && (maxPages === 0 || pages < maxPages)) {
      await step.do("spawn continuation", async () => {
        await this.env.INGEST.create({ params: { source: sourceId, cursor: cursor as string, since, runId, maxPages: maxPages ? maxPages - pages : 0 } });
      });
      return { status: "continued", cursor };
    }

    await step.do("finish run", async () => {
      await this.env.DB.prepare("UPDATE ingest_runs SET finished_at = ?, cursor = NULL WHERE id = ?").bind(new Date().toISOString(), runId).run();
    });

    // After a complete full crawl, open calls the publisher no longer lists are closed. The record and its history
    // stay; only the status moves. Skipped for incremental crawls and when the run saw too few records to be trusted.
    if (!since && maxPages === 0) {
      await step.do("reconcile missing calls", async () => {
        const run = await this.env.DB.prepare("SELECT started_at, upserted FROM ingest_runs WHERE id = ?").bind(runId).first<{ started_at: string; upserted: number }>();
        const total = await this.env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE source = ? AND status IN ('open', 'forthcoming')").bind(sourceId).first<{ n: number }>();
        if (!run || !total || run.upserted < total.n * 0.8) return;
        await this.env.DB.prepare("UPDATE grants SET status = 'closed' WHERE source = ? AND status IN ('open', 'forthcoming') AND last_seen_at < ?").bind(sourceId, run.started_at).run();
      });
    }
    return { status: "done", pages };
  }
}
