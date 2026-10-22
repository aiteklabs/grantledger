import { GrantSchema, type Grant } from "@grantledger/schema";
import { sha256 } from "./util";
import type { RawRecord } from "./sources";

export interface UpsertResult { upserted: number; changed: number; invalid: number }

const COLUMNS = [
  "id", "source", "source_id", "source_url", "source_license", "title", "title_lang", "summary",
  "funder_name", "funder_level", "country", "regions", "funding_types", "beneficiary_types", "consortium", "sectors",
  "amount_min", "amount_max", "budget_total", "currency", "status", "opens_at", "closes_at", "documents",
  "source_updated_at", "content_hash", "first_seen_at", "last_seen_at", "raw_key",
] as const;

const UPDATE_COLUMNS = COLUMNS.filter((c) => c !== "id" && c !== "first_seen_at");

const UPSERT_SQL = `INSERT INTO grants (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})
ON CONFLICT(id) DO UPDATE SET ${UPDATE_COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ")}`;

function rowValues(g: Grant, hash: string, now: string, rawKey: string | null): unknown[] {
  return [
    g.id, g.source, g.source_id, g.source_url, g.source_license, g.title, g.title_lang, g.summary,
    g.funder_name, g.funder_level, g.country, JSON.stringify(g.regions), JSON.stringify(g.funding_types),
    JSON.stringify(g.beneficiary_types), g.consortium ?? null, JSON.stringify(g.sectors), g.amount_min, g.amount_max, g.budget_total,
    g.currency, g.status, g.opens_at, g.closes_at, JSON.stringify(g.documents), g.source_updated_at, hash, now, now, rawKey,
  ];
}

// Dates are the source of truth for status: a source can lag behind its own deadlines.
function statusFromDatesWins(g: Grant, now: string): Grant {
  // A deadline in 2099 or later is a publisher placeholder for "no deadline".
  if (g.closes_at && g.closes_at >= "2099") g = { ...g, closes_at: null };
  if (g.closes_at && g.closes_at < now && g.status !== "closed") return { ...g, status: "closed" };
  if (g.closes_at && g.closes_at >= now && g.status === "unknown") return { ...g, status: "open" };
  if (g.opens_at && g.opens_at > now && g.status === "open") return { ...g, status: "forthcoming" };
  if (g.opens_at && g.opens_at <= now && g.status === "forthcoming") return { ...g, status: "open" };
  return g;
}

// Raw payloads are archived once per content version, under the hash of the normalized record, so an
// older crawl is never overwritten by a newer one. Only records whose content changed are written.
async function storeRaw(bucket: R2Bucket, source: string, raws: Map<string, unknown>, changed: { source_id: string; hash: string }[]): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  await Promise.all(
    changed.map(async ({ source_id, hash }) => {
      if (!raws.has(source_id)) return;
      const key = `raw/${source}/${encodeURIComponent(source_id)}/${hash}.json`;
      await bucket.put(key, JSON.stringify(raws.get(source_id)), { httpMetadata: { contentType: "application/json" } });
      keys.set(source_id, key);
    }),
  );
  return keys;
}

// Validates, hashes, upserts. Keeps first_seen_at and writes a grant_versions row on content change.
export async function upsertGrants(db: D1Database, bucket: R2Bucket, grants: Grant[], raws: RawRecord[]): Promise<UpsertResult> {
  if (grants.length === 0) return { upserted: 0, changed: 0, invalid: 0 };
  const now = new Date().toISOString();
  // Invalid records are skipped, never fatal: one bad row must not stop a crawl.
  const valid: Grant[] = [];
  let invalid = 0;
  for (const g of grants) {
    const parsed = GrantSchema.safeParse(g);
    if (parsed.success) valid.push(statusFromDatesWins(parsed.data, now));
    else {
      invalid++;
      console.warn("invalid record", g.id, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
  }
  const hashes = await Promise.all(valid.map((g) => sha256(JSON.stringify(g))));

  const ids = valid.map((g) => g.id);
  const stored = new Map<string, { content_hash: string; opens_at: string | null; closes_at: string | null; source_updated_at: string | null }>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await db
      .prepare(`SELECT id, content_hash, opens_at, closes_at, source_updated_at FROM grants WHERE id IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ id: string; content_hash: string; opens_at: string | null; closes_at: string | null; source_updated_at: string | null }>();
    for (const row of res.results) stored.set(row.id, row);
  }
  // The ledger's archive starts on 2026-09-29: a call first seen after its deadline, already closed, or without any
  // dates (BDNS "unknown": nominative subsidies and agreements nobody can apply for) never enters. Calls seen while
  // current stay when they close, so the archive only holds what the ledger once listed as open.
  const skipped = new Set<string>();
  valid.forEach((g) => {
    if (!stored.has(g.id) && (g.status === "closed" || g.status === "unknown" || (g.closes_at && g.closes_at < now))) skipped.add(g.id);
  });
  if (skipped.size) {
    for (let i = valid.length - 1; i >= 0; i--) if (skipped.has(valid[i]!.id)) { valid.splice(i, 1); hashes.splice(i, 1); }
    if (valid.length === 0) return { upserted: 0, changed: 0, invalid };
  }
  // Some publishers index one call several times (one document per round or per type of action). The document the
  // publisher updated last wins. Without update dates, an older round (earlier opening and earlier deadline) never
  // overwrites a later one. So the stored record never depends on the order the documents arrive in.
  const existing = new Map<string, string>();
  const superseded = new Set<string>();
  valid.forEach((g, i) => {
    const ex = stored.get(g.id);
    if (!ex) return;
    existing.set(g.id, ex.content_hash);
    if (ex.content_hash === hashes[i]) return;
    if (ex.source_updated_at && g.source_updated_at && g.source_updated_at !== ex.source_updated_at) {
      if (g.source_updated_at < ex.source_updated_at) superseded.add(g.id);
      return;
    }
    const olderRound = !!g.closes_at && !!ex.closes_at && g.closes_at < ex.closes_at && !!g.opens_at && !!ex.opens_at && g.opens_at < ex.opens_at;
    if (olderRound) superseded.add(g.id);
  });

  const changedRecords = valid.flatMap((g, i) => (existing.get(g.id) === hashes[i] || superseded.has(g.id) ? [] : [{ source_id: g.source_id, hash: hashes[i]! }]));
  const rawKeys = await storeRaw(bucket, valid[0]!.source, new Map(raws.map((r) => [r.source_id, r.payload])), changedRecords);

  // One group of statements per record, so a record and its version row always land in the same batch.
  const groups: D1PreparedStatement[][] = [];
  let changed = 0;
  valid.forEach((g, i) => {
    const hash = hashes[i]!;
    if (existing.get(g.id) === hash || superseded.has(g.id)) {
      groups.push([db.prepare("UPDATE grants SET last_seen_at = ? WHERE id = ?").bind(now, g.id)]);
      return;
    }
    changed++;
    groups.push([
      db.prepare(UPSERT_SQL).bind(...rowValues(g, hash, now, rawKeys.get(g.source_id) ?? null)),
      db.prepare("INSERT INTO grant_versions (grant_id, content_hash, snapshot, seen_at) VALUES (?, ?, ?, ?)").bind(g.id, hash, JSON.stringify(g), now),
    ]);
  });
  let batch: D1PreparedStatement[] = [];
  for (const group of groups) {
    if (batch.length + group.length > 50) {
      await db.batch(batch);
      batch = [];
    }
    batch.push(...group);
  }
  if (batch.length) await db.batch(batch);
  return { upserted: valid.length, changed, invalid };
}
