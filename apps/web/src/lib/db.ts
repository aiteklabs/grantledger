import type { Grant } from "@grantledger/schema";
import { EUROPE, parseJson } from "./format";

export interface GrantRow {
  id: string;
  source: string;
  source_id: string;
  source_url: string;
  source_license: string;
  title: string;
  title_lang: string;
  summary: string | null;
  funder_name: string | null;
  funder_level: string;
  country: string;
  regions: string;
  funding_types: string;
  beneficiary_types: string;
  consortium: string | null;
  sectors: string;
  amount_min: number | null;
  amount_max: number | null;
  budget_total: number | null;
  currency: string | null;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  documents: string;
  source_updated_at: string | null;
  content_hash: string;
  first_seen_at: string;
  last_seen_at: string;
  // Enrichment's consortium flag, when the query joins grant_enrichments. Fallback for sources that do not state it.
  e_consortium_required?: number | null;
}

export interface GrantView extends Omit<GrantRow, "regions" | "funding_types" | "beneficiary_types" | "sectors" | "documents" | "consortium"> {
  consortium: "required" | "single" | null;
  regions: string[];
  funding_types: Grant["funding_types"];
  beneficiary_types: Grant["beneficiary_types"];
  sectors: string[];
  documents: { title: string; url: string }[];
}

export function toView(r: GrantRow): GrantView {
  return {
    ...r,
    regions: parseJson(r.regions, []),
    funding_types: parseJson(r.funding_types, []),
    beneficiary_types: parseJson(r.beneficiary_types, []),
    consortium: r.consortium === "required" || r.consortium === "single" ? r.consortium : r.e_consortium_required === 1 ? "required" : r.e_consortium_required === 0 ? "single" : null,
    sectors: parseJson(r.sectors, []),
    documents: parseJson(r.documents, []),
  };
}

// Columns every grant view needs: the row plus enrichment's consortium flag.
const VIEW_SELECT = "g.*, e.consortium_required AS e_consortium_required";
// Only the enrichment of the current content version: a changed call waits for its re-enrichment.
const VIEW_JOIN = "LEFT JOIN grant_enrichments e ON e.grant_id = g.id AND e.content_hash = g.content_hash";

export interface SearchParams {
  q?: string;
  country?: string;
  status?: string;
  type?: string;
  beneficiary?: string;
  source?: string;
  sort?: "deadline" | "recent" | "relevance";
  page?: number;
  pageSize?: number;
}

const STOPWORDS = new Set(["the", "and", "for", "of", "in", "to", "with", "on", "by", "at", "an", "a", "de", "des", "du", "la", "le", "les", "un", "une", "et", "en", "pour", "sur", "au", "aux", "el", "los", "las", "del", "y", "der", "die", "das", "und", "für", "von"]);

export function ftsWords(q: string, max: number): string[] {
  return q
    .replace(/["*()]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .slice(0, max);
}

// Short words match exactly (a prefix on "ai" would also hit "aid" and "aim"); longer words match as prefixes.
function ftsTerm(w: string): string {
  return w.length <= 3 ? `"${w}"` : `"${w}"*`;
}

// Escapes user text for an FTS5 MATCH expression used by the site search: every word must appear.
export function ftsQuery(q: string): string {
  return ftsWords(q, 8).map(ftsTerm).join(" ");
}

// One profile keyword as an FTS5 expression: a phrase like "voice roleplay" only matches when its words sit within a
// few tokens of each other, so generic words do not drag in unrelated calls.
export function keywordQuery(kw: string): string {
  const words = ftsWords(kw, 5);
  if (words.length === 0) return "";
  if (words.length === 1) return ftsTerm(words[0]!);
  return `NEAR(${words.map(ftsTerm).join(" ")}, 10)`;
}

export async function searchGrants(db: D1Database, p: SearchParams): Promise<{ items: GrantView[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, p.page ?? 1);
  // "All" on the list page asks for 1000: enough for any filtered view, bounded for the archive.
  const pageSize = Math.min(1000, Math.max(5, p.pageSize ?? 20));
  const where: string[] = [];
  const binds: unknown[] = [];
  const fts = p.q ? ftsQuery(p.q) : "";
  const from = `grants g ${VIEW_JOIN}`;
  if (fts) {
    // The publisher's text and the English summary and search terms: an English query finds a Spanish call.
    where.push("(g.rowid IN (SELECT rowid FROM grants_fts WHERE grants_fts MATCH ?) OR g.id IN (SELECT grant_id FROM enrichment_fts WHERE enrichment_fts MATCH ?))");
    binds.push(fts, fts);
  }
  if (p.country === "EUROPE") {
    const codes = [...EUROPE];
    where.push(`g.country IN (${codes.map(() => "?").join(",")})`);
    binds.push(...codes);
  } else if (p.country) {
    where.push("g.country = ?");
    binds.push(p.country.toUpperCase());
  }
  // Live views show current calls only; closed ones are an explicit archive.
  const nowIso = new Date().toISOString();
  if (p.status === "open") {
    where.push("g.status = 'open' AND (g.closes_at IS NULL OR g.closes_at >= ?)");
    binds.push(nowIso);
  } else if (p.status === "forthcoming") {
    where.push("g.status = 'forthcoming'");
  } else if (p.status === "closed") {
    // The archive also holds records whose status the publisher never stated.
    where.push("(g.status IN ('closed', 'unknown') OR g.closes_at < ?)");
    binds.push(nowIso);
  } else {
    where.push("g.status IN ('open','forthcoming') AND (g.closes_at IS NULL OR g.closes_at >= ?)");
    binds.push(nowIso);
  }
  if (p.source) {
    where.push("g.source = ?");
    binds.push(p.source);
  }
  if (p.type) {
    where.push("g.funding_types LIKE ?");
    binds.push(`%"${p.type}"%`);
  }
  if (p.beneficiary) {
    where.push("g.beneficiary_types LIKE ?");
    binds.push(`%"${p.beneficiary}"%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order =
    p.sort === "recent"
      ? "g.first_seen_at DESC"
      : p.sort === "relevance" && fts
        ? "COALESCE((SELECT bm25(grants_fts) FROM grants_fts WHERE grants_fts MATCH ? AND rowid = g.rowid), 0) + COALESCE((SELECT bm25(enrichment_fts) FROM enrichment_fts WHERE enrichment_fts MATCH ? AND grant_id = g.id), 0)"
        : "CASE WHEN g.closes_at IS NULL THEN 1 ELSE 0 END, g.closes_at ASC, g.id";
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`).bind(...binds).first<{ n: number }>();
  const orderBinds = p.sort === "relevance" && fts ? [fts, fts] : [];
  const rows = await db
    .prepare(`SELECT ${VIEW_SELECT} FROM ${from} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...binds, ...orderBinds, pageSize, (page - 1) * pageSize)
    .all<GrantRow>();
  return { items: rows.results.map(toView), total: total?.n ?? 0, page, pageSize };
}

export async function getGrant(db: D1Database, id: string): Promise<GrantView | null> {
  const row = await db.prepare(`SELECT ${VIEW_SELECT} FROM grants g ${VIEW_JOIN} WHERE g.id = ?`).bind(id).first<GrantRow>();
  return row ? toView(row) : null;
}

export async function getVersions(db: D1Database, id: string): Promise<{ id: number; content_hash: string; seen_at: string; snapshot: string }[]> {
  const res = await db.prepare("SELECT id, content_hash, seen_at, snapshot FROM grant_versions WHERE grant_id = ? ORDER BY seen_at DESC LIMIT 20").bind(id).all();
  return res.results as { id: number; content_hash: string; seen_at: string; snapshot: string }[];
}

export interface Stats {
  total: number;
  open: number;
  forthcoming: number;
  archived: number;
  versions: number;
  sources: { source: string; n: number; open: number; last_seen: string | null }[];
  countries: { country: string; n: number; open: number }[];
}

// Live counts: "open" and per-source/country "open" only count calls whose deadline has not passed.
// "archived" is the closed history, kept and searchable but never mixed into the live numbers.
export async function getStats(db: D1Database): Promise<Stats> {
  const now = new Date().toISOString();
  const CURRENT = "status IN ('open','forthcoming') AND (closes_at IS NULL OR closes_at >= ?)";
  const [totals, versions, sources, countries] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' AND (closes_at IS NULL OR closes_at >= ?) THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status = 'forthcoming' THEN 1 ELSE 0 END) AS forthcoming, SUM(CASE WHEN status IN ('closed', 'unknown') OR closes_at < ? THEN 1 ELSE 0 END) AS archived FROM grants`).bind(now, now),
    db.prepare("SELECT COUNT(*) AS n FROM grant_versions"),
    db.prepare(`SELECT source, COUNT(*) AS n, SUM(CASE WHEN ${CURRENT} THEN 1 ELSE 0 END) AS open, MAX(last_seen_at) AS last_seen FROM grants GROUP BY source ORDER BY open DESC, n DESC`).bind(now),
    db.prepare(`SELECT country, COUNT(*) AS n, SUM(CASE WHEN ${CURRENT} THEN 1 ELSE 0 END) AS open FROM grants GROUP BY country HAVING open > 0 ORDER BY open DESC`).bind(now),
  ]);
  const t = (totals.results[0] ?? {}) as { total?: number; open?: number; forthcoming?: number; archived?: number };
  return {
    total: t.total ?? 0,
    open: t.open ?? 0,
    forthcoming: t.forthcoming ?? 0,
    archived: t.archived ?? 0,
    versions: ((versions.results[0] ?? {}) as { n?: number }).n ?? 0,
    sources: sources.results as Stats["sources"],
    countries: countries.results as Stats["countries"],
  };
}

// Four numbers shown in the footer of every page, from the same tables as everything else.
export interface SiteFacts { active: number; countries: number; sources: number; refreshed: string | null }
export async function getSiteFacts(db: D1Database): Promise<SiteFacts> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM grants WHERE status IN ('open','forthcoming') AND (closes_at IS NULL OR closes_at >= ?)) AS active,
              (SELECT COUNT(DISTINCT country) FROM grants WHERE country != 'EU' AND status IN ('open','forthcoming')) AS countries,
              (SELECT COUNT(DISTINCT source) FROM grants) AS sources,
              (SELECT MAX(finished_at) FROM ingest_runs WHERE error IS NULL) AS refreshed`,
    )
    .bind(now)
    .first<SiteFacts>();
  return row ?? { active: 0, countries: 0, sources: 0, refreshed: null };
}

// One row per feed for the coverage register: what is live, when it was last checked, and whether the last crawl worked.
export interface SourceHealth { source: string; country: string; current: number; last_seen: string | null; last_run: string | null; error: string | null }
export async function getSourceRegister(db: D1Database): Promise<SourceHealth[]> {
  const now = new Date().toISOString();
  const [feeds, runs] = await db.batch([
    db.prepare(`SELECT source, MIN(country) AS country, SUM(CASE WHEN status IN ('open','forthcoming') AND (closes_at IS NULL OR closes_at >= ?) THEN 1 ELSE 0 END) AS current, MAX(last_seen_at) AS last_seen FROM grants GROUP BY source`).bind(now),
    db.prepare("SELECT source, started_at, error FROM ingest_runs r WHERE started_at = (SELECT MAX(started_at) FROM ingest_runs WHERE source = r.source)"),
  ]);
  const last = new Map((runs.results as { source: string; started_at: string; error: string | null }[]).map((r) => [r.source, r]));
  return (feeds.results as { source: string; country: string; current: number; last_seen: string | null }[])
    .map((f) => ({ ...f, last_run: last.get(f.source)?.started_at ?? null, error: last.get(f.source)?.error ?? null }))
    .sort((a, b) => a.country.localeCompare(b.country) || a.source.localeCompare(b.source));
}

// ---- Pro (admin) ----

export interface ProStats {
  accounts: { email: string; plan: string; paid_at: string | null; business_name: string | null; tax_id: string | null; last_login_at: string | null; profiles: number; companies: string | null }[];
  revenue_eur: number;
  solo: number;
  team: number;
  profiles: number;
  emails_sent: number;
  // What paying users look for, over their saved profiles and every screening of the last 90 days.
  countries: [string, number][];
  entity_types: [string, number][];
  sectors: [string, number][];
  keywords: [string, number][];
}

export async function getProStats(db: D1Database): Promise<ProStats> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [accounts, profiles, forms] = await db.batch([
    db.prepare(`SELECT a.email, a.plan, a.paid_at, a.business_name, a.tax_id, a.last_login_at,
        (SELECT COUNT(*) FROM radars r WHERE r.email = a.email AND r.active = 1) AS profiles,
        (SELECT GROUP_CONCAT(COALESCE(company_name, 'Unnamed') || '|' || fit_check_id, ';') FROM radars r WHERE r.email = a.email AND r.active = 1) AS companies
      FROM accounts a WHERE a.paid_at IS NOT NULL ORDER BY a.paid_at DESC`),
    db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN last_sent_at > created_at THEN 1 ELSE 0 END) AS sent FROM radars WHERE active = 1"),
    db.prepare("SELECT form FROM radars WHERE active = 1 UNION ALL SELECT form FROM fit_checks WHERE form IS NOT NULL AND created_at >= ?").bind(since),
  ]);
  const rows = accounts.results as ProStats["accounts"];
  const solo = rows.filter((a) => a.plan === "solo").length;
  const team = rows.filter((a) => a.plan === "team").length;
  const count = (key: string, list: Iterable<string>) => {
    const m = new Map<string, number>();
    for (const v of list) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, key === "keywords" ? 30 : 12);
  };
  const parsed = (forms.results as { form: string }[]).map((r) => parseJson<{ country?: string; entity_type?: string; sectors?: string[]; keywords?: string[] } | null>(r.form, null)).filter((f): f is NonNullable<typeof f> => !!f);
  const p = (profiles.results[0] ?? {}) as { n?: number; sent?: number };
  return {
    accounts: rows,
    revenue_eur: solo * 9 + team * 19,
    solo,
    team,
    profiles: p.n ?? 0,
    emails_sent: p.sent ?? 0,
    countries: count("countries", parsed.map((f) => f.country ?? "")),
    entity_types: count("entity_types", parsed.map((f) => f.entity_type ?? "")),
    sectors: count("sectors", parsed.flatMap((f) => f.sectors ?? [])),
    keywords: count("keywords", parsed.flatMap((f) => (f.keywords ?? []).map((k) => k.toLowerCase()))),
  };
}

// ---- Fit checks (private) ----

export interface FitCheckRow {
  id: string;
  created_at: string;
  input_type: "url" | "pdf" | "text" | "form";
  input_ref: string | null;
  input_name: string | null;
  input_text: string | null;
  contact_email: string | null;
  status: "pending" | "draft" | "done" | "error";
  form: string | null;
  summary: string | null;
  mode: string;
  error: string | null;
  profile: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  ip_hash: string | null;
  user_agent: string | null;
  finished_at: string | null;
}

export interface FitMatchRow {
  fit_check_id: string;
  grant_id: string;
  rank: number;
  verdict: "fit" | "eligible" | "not_yet" | "no";
  score: number;
  reasons: string;
  missing: string;
  gaps: string;
  memo: string | null;
}

export async function getFitCheck(db: D1Database, id: string): Promise<FitCheckRow | null> {
  return db.prepare("SELECT * FROM fit_checks WHERE id = ?").bind(id).first<FitCheckRow>();
}

export async function getFitMatches(db: D1Database, id: string): Promise<(FitMatchRow & { grant: GrantView })[]> {
  const res = await db
    .prepare("SELECT m.*, g.* FROM fit_matches m JOIN grants g ON g.id = m.grant_id WHERE m.fit_check_id = ? ORDER BY m.rank ASC")
    .bind(id)
    .all<FitMatchRow & GrantRow>();
  return res.results.map((r) => ({
    fit_check_id: r.fit_check_id,
    grant_id: r.grant_id,
    rank: r.rank,
    verdict: r.verdict,
    score: r.score,
    reasons: r.reasons,
    missing: r.missing,
    gaps: r.gaps,
    memo: r.memo,
    grant: toView(r),
  }));
}

export async function listFitChecks(db: D1Database, limit = 100): Promise<FitCheckRow[]> {
  const res = await db.prepare("SELECT * FROM fit_checks ORDER BY created_at DESC LIMIT ?").bind(limit).all<FitCheckRow>();
  return res.results;
}

export async function listIngestRuns(db: D1Database, limit = 30) {
  const res = await db.prepare("SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT ?").bind(limit).all();
  return res.results as { id: string; source: string; cursor: string | null; started_at: string; finished_at: string | null; pages: number; upserted: number; changed: number; error: string | null }[];
}
