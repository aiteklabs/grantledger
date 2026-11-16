import { GeminiParseError, generateJson, type GeminiEnv } from "./gemini";
import type { GrantRow } from "./db";
import { assertBudget, recordUsage, reserveUsage } from "./spend";

// Offline enrichment: one model pass per record whose source publishes no structured eligibility.
// Output is stored in grant_enrichments and used by the matcher as a fallback. Never called at request time.
export interface Enrichment {
  beneficiary_types: ("company" | "sme" | "startup" | "individual" | "research_org" | "public_body" | "ngo" | "other")[];
  sectors: string[];
  regions: string[];
  company_sizes: ("micro" | "small" | "medium" | "large")[];
  min_company_age: number | null;
  max_company_age: number | null;
  consortium_required: boolean | null;
  summary_en: string;
  keywords_en: string[];
}

const SCHEMA = {
  type: "object",
  properties: {
    beneficiary_types: { type: "array", items: { type: "string", enum: ["company", "sme", "startup", "individual", "research_org", "public_body", "ngo", "other"] }, description: "Empty when the text does not say" },
    sectors: { type: "array", items: { type: "string" }, description: "NACE Rev. 2 divisions (2 digits) the call targets. Empty when open to all sectors" },
    regions: { type: "array", items: { type: "string" }, description: "NUTS codes or region names when restricted. Empty when national or EU-wide" },
    company_sizes: { type: "array", items: { type: "string", enum: ["micro", "small", "medium", "large"] }, description: "Empty when any size" },
    min_company_age: { type: "integer", nullable: true },
    max_company_age: { type: "integer", nullable: true },
    consortium_required: { type: "boolean", nullable: true },
    summary_en: { type: "string", description: "Two sentences in English: purpose and who can apply" },
    keywords_en: { type: "array", items: { type: "string" }, description: "8 to 12 English search phrases of 1 to 3 words: the technologies, topics and beneficiaries this call is about, as a company would search for them" },
  },
  required: ["beneficiary_types", "sectors", "regions", "company_sizes", "min_company_age", "max_company_age", "consortium_required", "summary_en", "keywords_en"],
};

const SYSTEM = `You read one public funding call and extract its eligibility conditions as structured fields.
Only state what the text says. When the text is silent, return empty lists or null. Do not guess sectors from the funder's name.`;

export async function enrichGrant(env: GeminiEnv, g: GrantRow) {
  const text = [
    `TITLE: ${g.title}`,
    `FUNDER: ${g.funder_name ?? ""} (${g.funder_level}, ${g.country})`,
    `FUNDING TYPES: ${g.funding_types}`,
    `PUBLISHED BENEFICIARIES: ${g.beneficiary_types}`,
    `PUBLISHED SECTORS: ${g.sectors}`,
    `PUBLISHED REGIONS: ${g.regions}`,
    `TEXT:\n${(g.summary ?? "").slice(0, 12_000)}`,
  ].join("\n");
  return generateJson<Enrichment>(env, { system: SYSTEM, input: [{ type: "text", text }], schema: SCHEMA, thinking: "low" });
}

// Enriches up to `limit` current records with no enrichment for their current content. Returns how many were written.
export async function enrichBatch(env: GeminiEnv & { DB: D1Database; GEMINI_MODEL: string }, opts: { source?: string; limit: number; shard?: number; shards?: number }): Promise<{ done: number; errors: string[] }> {
  // Every current call with any usable text: a long descriptive title alone is enough for keywords and beneficiaries.
  const where = ["g.status IN ('open','forthcoming')", "(g.closes_at IS NULL OR g.closes_at >= ?)", "length(g.title) + length(COALESCE(g.summary, '')) > 60", "(e.grant_id IS NULL OR e.content_hash IS NULL OR e.content_hash != g.content_hash)"];
  const binds: unknown[] = [new Date().toISOString()];
  if (opts.source) {
    where.push("g.source = ?");
    binds.push(opts.source);
  }
  // Parallel callers each take a disjoint slice of the queue, so no record is enriched twice.
  if (opts.shards && opts.shards > 1) {
    where.push("g.rowid % ? = ?");
    binds.push(opts.shards, opts.shard ?? 0);
  }
  // Calls published in a language other than English come first: enrichment is what makes them searchable in English.
  const rows = await env.DB.prepare(`SELECT g.* FROM grants g LEFT JOIN grant_enrichments e ON e.grant_id = g.id WHERE ${where.join(" AND ")} ORDER BY CASE WHEN g.country IN ('EU','US','GB','IE') THEN 1 ELSE 0 END, CASE WHEN g.closes_at IS NULL THEN 1 ELSE 0 END, g.closes_at ASC LIMIT ?`)
    .bind(...binds, opts.limit)
    .all<GrantRow>();
  let done = 0;
  const errors: string[] = [];
  for (const g of rows.results) {
    try {
      await assertBudget(env.DB, 0.7);
      const reservation = await reserveUsage(env.DB, "enrichment", g.id, env.GEMINI_MODEL, 5_000, 1_500);
      const r = await enrichGrant(env, g);
      await recordUsage(env.DB, "enrichment", g.id, env.GEMINI_MODEL, r.input_tokens, r.output_tokens, reservation);
      const d = r.data;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO grant_enrichments (grant_id, beneficiary_types, sectors, regions, company_sizes, min_company_age, max_company_age, consortium_required, summary_en, keywords_en, model, input_tokens, output_tokens, created_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(g.id, JSON.stringify(d.beneficiary_types), JSON.stringify(d.sectors.filter((s) => /^\d{2}/.test(s))), JSON.stringify(d.regions), JSON.stringify(d.company_sizes), d.min_company_age, d.max_company_age, d.consortium_required === null ? null : d.consortium_required ? 1 : 0, d.summary_en, JSON.stringify((d.keywords_en ?? []).slice(0, 12)), env.GEMINI_MODEL, r.input_tokens, r.output_tokens, new Date().toISOString(), g.content_hash)
        .run();
      done++;
    } catch (err) {
      if (err instanceof GeminiParseError) await recordUsage(env.DB, "enrichment", g.id, env.GEMINI_MODEL, err.input_tokens, err.output_tokens);
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${g.id}: ${message}`.slice(0, 300));
      if (message.startsWith("Model budget reached")) break;
    }
  }
  return { done, errors };
}
