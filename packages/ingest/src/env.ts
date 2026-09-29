import type { IngestParams } from "./workflow";

export interface Env {
  DB: D1Database;
  RAW: R2Bucket;
  INGEST: Workflow<IngestParams>;
  PAGES_PER_INSTANCE?: string;
  WEB_URL?: string;
  // Secret. Required for manual POST /run.
  ADMIN_TOKEN?: string;
}
