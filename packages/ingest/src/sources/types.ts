import type { Grant, SourceId } from "@grantledger/schema";

export interface RawRecord {
  // Archived at r2://raw/{source}/{source_id}/{content_hash}.json when the normalized record changes.
  source_id: string;
  payload: unknown;
}

export interface Page {
  grants: Grant[];
  raws: RawRecord[];
  // Opaque cursor for the next page, null when done.
  next: string | null;
}

export interface Source {
  id: SourceId;
  license: string;
  // Starting cursor for a full crawl, or an incremental one when `since` (ISO date) is given.
  start(since?: string): string;
  fetchPage(cursor: string): Promise<Page>;
  // "local": the publisher refuses requests from Cloudflare, so the nightly Worker cron skips this source and the
  // GitHub Actions runner pushes it through POST /ingest instead.
  runner?: "worker" | "local";
}
