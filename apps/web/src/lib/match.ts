import type { GrantView, GrantRow } from "./db";
import { ftsWords, keywordQuery, toView } from "./db";
import { COUNTRY_NAMES, EU_MEMBERS, EUROPE, HORIZON_ASSOCIATED, parseJson } from "./format";
import type { ProfileForm } from "./profile-form";
import { frRegionToNuts } from "./fr-regions";

// Deterministic matcher. No model call. Every rule yields match | mismatch | unknown with a sentence a user can verify.
export type RuleState = "match" | "mismatch" | "unknown";
export interface RuleResult { rule: string; state: RuleState; text: string }
// fit: eligible and relevant (keyword or sector match). eligible: conditions met but nothing links the call to the company.
// not_yet: one or two conditions missing or unverifiable. no: three or more mismatches.
export type Verdict = "fit" | "eligible" | "not_yet" | "no";
export interface MatchResult { grant: GrantView; verdict: Verdict; score: number; rules: RuleResult[] }

interface EnrichedRow extends GrantRow {
  e_beneficiary_types: string | null;
  e_sectors: string | null;
  e_regions: string | null;
  e_company_sizes: string | null;
  e_min_company_age: number | null;
  e_max_company_age: number | null;
  e_consortium_required: number | null;
  e_keywords_en: string | null;
  fts_hit?: number;
  // Profile keywords found in the title or summary, and each keyword's rank in that search (0 = best).
  fts_terms?: string[];
  fts_rank?: Record<string, number>;
  // Keywords so common in the ledger that a mention alone says little (the search hit its result cap).
  fts_broad?: string[];
}

const ENTITY_COMPAT: Record<ProfileForm["entity_type"], string[]> = {
  // A startup is a company, a company is not necessarily a startup: calls reserved to startups need the status.
  company: ["company", "sme"],
  sme: ["sme", "company"],
  startup: ["startup", "sme", "company"],
  individual: ["individual"],
  research_org: ["research_org"],
  public_body: ["public_body"],
  ngo: ["ngo"],
  other: ["other"],
};

const AGE_YEARS: Record<ProfileForm["company_age"], [number, number] | null> = {
  lt1: [0, 1],
  "1to3": [1, 3],
  "3to10": [3, 10],
  gt10: [10, 100],
  unknown: null,
};

function pick(primary: string, fallback: string | null): string[] {
  const p = parseJson<string[]>(primary, []);
  return p.length ? p : parseJson<string[]>(fallback, []);
}

// NACE/CNAE: "62" or "62.01". US CFDA numbers ("93.473") and free-text themes are not comparable.
function isNace(codes: string[], source: string): boolean {
  return source !== "us_grants_gov" && codes.length > 0 && codes.every((c) => /^\d{2}(\.\d{1,2})?$/.test(c));
}

export function evaluate(row: EnrichedRow, form: ProfileForm): MatchResult {
  const g = toView(row);
  const rules: RuleResult[] = [];

  // Country: hard filter happened in SQL. EU-wide programmes are open to member states by default, to associated
  // countries for most calls, and to others only case by case.
  const userCountry = form.country === "UK" ? "GB" : form.country;
  const countryName = COUNTRY_NAMES[form.country] ?? form.country;
  if (form.country === "EU" && g.country !== "EU") rules.push({ rule: "country", state: "unknown", text: `National call of ${COUNTRY_NAMES[g.country] ?? g.country}: usually needs an establishment there, check the call` });
  else if (form.country === "EU") rules.push({ rule: "country", state: "match", text: "EU programme, open to entities established in any member state" });
  else if (g.country !== "EU") rules.push({ rule: "country", state: "match", text: `Published for ${COUNTRY_NAMES[g.country] ?? g.country}` });
  else if (EU_MEMBERS.has(userCountry)) rules.push({ rule: "country", state: "match", text: `EU programme, open to entities established in ${countryName} (EU member state)` });
  else if (HORIZON_ASSOCIATED.has(userCountry)) rules.push({ rule: "country", state: "unknown", text: `EU programme; ${countryName} is an associated country, eligible for most calls: check the call` });
  else rules.push({ rule: "country", state: "unknown", text: `EU programme; ${countryName} is a third country: check the call's international rules` });

  // Region
  const regions = pick(row.regions, row.e_regions).map((r) => (g.country === "FR" ? frRegionToNuts(r) : r).toUpperCase());
  const codes = regions.filter((r) => /^[A-Z0-9]{2,5}$/.test(r));
  const label = regions.filter((r) => r !== "TERRITORIAL").slice(0, 4).join(", ") || "a specific territory";
  if (regions.length === 0 || g.country === "EU") rules.push({ rule: "region", state: "match", text: "No regional restriction stated" });
  else if (!form.region) rules.push({ rule: "region", state: "unknown", text: `Limited to ${label}: check your region` });
  else if (codes.some((r) => form.region.startsWith(r) || r.startsWith(form.region))) rules.push({ rule: "region", state: "match", text: `Covers your region (${form.region})` });
  else if (codes.length === 0) rules.push({ rule: "region", state: "unknown", text: `Limited to ${label}: not coded, check the call` });
  else rules.push({ rule: "region", state: "mismatch", text: `Limited to ${label}, not ${form.region}` });

  // Beneficiary type
  const bens = pick(row.beneficiary_types, row.e_beneficiary_types);
  const compat = ENTITY_COMPAT[form.entity_type];
  if (bens.length === 0 && g.source === "eu_ft" && ["company", "sme", "startup", "research_org", "public_body", "ngo"].includes(form.entity_type))
    rules.push({ rule: "beneficiary", state: "match", text: "EU general rule: any legal entity established in an eligible country (check the call for consortium and type-of-action limits)" });
  else if (bens.length === 0) rules.push({ rule: "beneficiary", state: "unknown", text: "Eligible entity types not structured in the source: read the call" });
  else if (bens.some((b) => compat.includes(b))) rules.push({ rule: "beneficiary", state: "match", text: `Open to ${bens.filter((b) => compat.includes(b)).join(", ").replace(/_/g, " ")}` });
  else rules.push({ rule: "beneficiary", state: "mismatch", text: `Open to ${bens.join(", ").replace(/_/g, " ")} only` });

  // Sector (NACE divisions)
  const sectors = pick(row.sectors, row.e_sectors);
  if (sectors.length === 0) rules.push({ rule: "sector", state: "match", text: "No sector restriction stated" });
  else if (!isNace(sectors, g.source)) rules.push({ rule: "sector", state: "match", text: `Theme: ${sectors.slice(0, 4).join(", ")}` });
  else if (form.sectors.length === 0) rules.push({ rule: "sector", state: "unknown", text: `Targets NACE ${sectors.slice(0, 4).join(", ")}: pick your sector to compare` });
  else if (sectors.some((s) => form.sectors.some((f) => s.startsWith(f)))) {
    rules.push({ rule: "sector", state: "match", text: `Targets your sector (NACE ${sectors.filter((s) => form.sectors.some((f) => s.startsWith(f))).join(", ")})` });
  } else {
    rules.push({ rule: "sector", state: "mismatch", text: `Targets NACE ${sectors.slice(0, 5).join(", ")}` });
  }

  // Funding type wanted
  if (form.funding_types.length === 0) rules.push({ rule: "funding_type", state: "match", text: `Instrument: ${g.funding_types.join(", ").replace(/_/g, " ") || "unspecified"}` });
  else if (g.funding_types.some((f) => (form.funding_types as string[]).includes(f))) rules.push({ rule: "funding_type", state: "match", text: `Instrument you want: ${g.funding_types.filter((f) => (form.funding_types as string[]).includes(f)).join(", ").replace(/_/g, " ")}` });
  else rules.push({ rule: "funding_type", state: "mismatch", text: `Instrument is ${g.funding_types.join(", ").replace(/_/g, " ") || "unspecified"}` });

  // Company size (enrichment only)
  const sizes = parseJson<string[]>(row.e_company_sizes, []);
  if (sizes.length) {
    if (form.size === "unknown") rules.push({ rule: "size", state: "unknown", text: `Reserved for ${sizes.join(", ")} companies; your size is not known` });
    else if (sizes.includes(form.size)) rules.push({ rule: "size", state: "match", text: `Company size ${form.size} eligible` });
    else rules.push({ rule: "size", state: "mismatch", text: `Reserved for ${sizes.join(", ")} companies` });
  }

  // Company age (enrichment only). The form gives an age band; the call passes only when the whole band fits,
  // is refused when nothing overlaps, and is left to the reader when the band straddles the limit.
  const age = AGE_YEARS[form.company_age];
  if (row.e_min_company_age !== null || row.e_max_company_age !== null) {
    const min = row.e_min_company_age ?? 0;
    const max = row.e_max_company_age ?? 100;
    if (!age) rules.push({ rule: "age", state: "unknown", text: `Company must be ${min}-${max} years old; your founding year is not known` });
    else if (age[0] >= min && age[1] <= max) rules.push({ rule: "age", state: "match", text: `Company age window ${min}-${max} years fits` });
    else if (age[1] <= min || age[0] >= max) rules.push({ rule: "age", state: "mismatch", text: `Company must be ${min}-${max} years old` });
    else rules.push({ rule: "age", state: "unknown", text: `Company must be ${min}-${max} years old; check your exact founding date` });
  }

  // Consortium: the source's rule (type of action) first, enrichment's reading of the text as fallback.
  if (g.consortium === "required" && !form.consortium_ok) rules.push({ rule: "consortium", state: "mismatch", text: "Requires a consortium; you said no partners" });
  else if (g.consortium === "required") rules.push({ rule: "consortium", state: "match", text: "Requires a consortium; you can partner" });
  else if (g.consortium === "single") rules.push({ rule: "consortium", state: "match", text: "Single applicant, no consortium needed" });
  // EU calls whose type of action carries no standard rule (Digital Europe grants, CSA) and whose text enrichment could
  // not read: most of them need partners, so a solo applicant gets "verify", not "fit".
  else if (g.source === "eu_ft" && !form.consortium_ok)
    rules.push({ rule: "consortium", state: "unknown", text: /^DIGITAL-/.test(g.source_id) ? "Digital Europe grants usually need a consortium of at least three entities from three countries; you said no partners: check the call" : "Consortium rule not stated for this type of action; you said no partners: check the call" });
  // A call written for the company's own entity type that one applicant can file (EIC Accelerator, cascade funding
  // for SMEs) is relevant by design, whatever its keywords say.
  const applicantFit = g.consortium === "single" && bens.length > 0 && bens.some((b) => compat.includes(b));
  if (applicantFit) rules.push({ rule: "applicant", state: "match", text: `Designed for your entity type (${bens.filter((b) => compat.includes(b)).join(", ").replace(/_/g, " ")}), single applicant` });

  // Deadline
  if (g.closes_at) {
    const days = Math.ceil((new Date(g.closes_at).getTime() - Date.now()) / 86_400_000);
    rules.push({ rule: "deadline", state: days >= 0 ? "match" : "mismatch", text: days >= 0 ? `${days} days left` : "Deadline passed" });
  } else rules.push({ rule: "deadline", state: "unknown", text: g.status === "forthcoming" ? "Not open yet" : "No deadline published (rolling or unknown)" });

  // Keywords
  // Keyword evidence, scored in points: a precise term in the call's own theme classification or title weighs most,
  // a precise phrase in the text next, a broad term (one that tags a large share of the pool) least. Two points
  // make the call relevant, so a lone broad tag such as "artificial intelligence" never counts on its own.
  const terms = row.fts_terms ?? [];
  const broad = new Set(row.fts_broad ?? []);
  const title = g.title.toLowerCase();
  const themeList = isNace(sectors, g.source) ? [] : sectors.map((t) => t.toLowerCase());
  const hasWord = (hay: string, w: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(hay);
  const inText = (hay: string, kw: string) => ftsWords(kw, 5).every((w) => hasWord(hay, w));
  // Enrichment's English keywords count like the publisher's own classification: they describe what the call is about.
  const enrichedTerms = parseJson<string[]>(row.e_keywords_en, []).map((t) => t.toLowerCase());
  const themeHits = form.keywords.filter((k) => themeList.some((t) => inText(t, k)) || enrichedTerms.some((t) => inText(t, k)));
  const titleHits = terms.filter((k) => inText(title, k));
  const textHits = terms.filter((k) => !titleHits.includes(k));
  // A text mention counts fully only when the call ranks among the ten best for that term; a passing mention deep in
  // a long text, or a broad term, counts for little.
  const rank = row.fts_rank ?? {};
  const pts = (list: string[], precise: number, broadPts: number) => list.reduce((n, k) => n + (broad.has(k) ? broadPts : precise), 0);
  const textPts = textHits.reduce((n, k) => n + (broad.has(k) ? 0.5 : (rank[k] ?? 99) < 10 ? 2 : 1), 0);
  const evidence = pts(themeHits, 3, 1) + pts(titleHits, 3, 2) + textPts;
  // Relevant means the call's own classification or title names the topic. Words found only deep in the text
  // (a space call that mentions "digital skills" once) are a lead to read, not a fit.
  const keywordRelevant = evidence >= 2 && (themeHits.length > 0 || titleHits.length > 0);
  const top3 = (list: string[]) => list.slice(0, 3).join(", ");
  if (themeHits.length) rules.push({ rule: "theme", state: keywordRelevant ? "match" : "unknown", text: `Classified under your topic: ${top3(themeHits)}` });
  if (titleHits.length) rules.push({ rule: "keywords", state: "match", text: `Your keywords in the title: ${top3(titleHits)}` });
  else if (textHits.length) rules.push({ rule: "keywords", state: keywordRelevant ? "match" : "unknown", text: keywordRelevant ? `Your keywords in the call text: ${top3(textHits)}` : `Your keywords appear only in the call text (${top3(textHits)}): read the call before investing time` });

  const mismatches = rules.filter((r) => r.state === "mismatch").length;
  const matches = rules.filter((r) => r.state === "match").length;
  const unknowns = rules.filter((r) => r.state === "unknown" && r.rule !== "keywords" && r.rule !== "theme").length;
  // Fit only when every eligibility rule (region, beneficiary, sector, size, age) is confirmed. Unknowns must be verified by the reader.
  const eligibilityUnknown = rules.some((r) => ["country", "region", "beneficiary", "sector", "size", "age", "consortium"].includes(r.rule) && r.state === "unknown");
  const sectorHit = rules.some((r) => r.rule === "sector" && r.state === "match" && r.text.startsWith("Targets your sector"));
  // A single-applicant call written for the company's entity type is relevant when the source itself says single
  // (EIC Accelerator, EIC STEP: bottom-up, any topic) or when anything in the text touches the keywords. A themed
  // challenge that enrichment read as single-applicant (quantum sensors for a voice AI startup) stays "eligible".
  const relevant = keywordRelevant || sectorHit || (applicantFit && (row.consortium === "single" || themeHits.length > 0 || titleHits.length > 0 || textHits.length > 0));
  if (!relevant && !textHits.length) rules.push({ rule: "relevance", state: "unknown", text: "Nothing in the call text matches your keywords or sector: read the call before investing time" });
  const deadlinePassed = rules.some((r) => r.rule === "deadline" && r.state === "mismatch");
  let verdict: Verdict;
  if (deadlinePassed) verdict = "no";
  else if (mismatches === 0 && !eligibilityUnknown) verdict = relevant ? "fit" : "eligible";
  // A call is only worth verifying when something links it to the company; an unrelated call with open questions is noise.
  else if (mismatches <= 2 && relevant) verdict = "not_yet";
  else verdict = "no";
  // Eligibility rules fill up to 70; relevance adds the rest. An eligible but off-topic call never scores above 70.
  // Each matched keyword counts, so a call hit by three keywords ranks above a call hit by one.
  const eligibilityScore = Math.min(70, 20 + matches * 8 - mismatches * 25 - unknowns * 10);
  const keywordBonus = Math.min(35, Math.round(evidence * 5));
  const raw = Math.max(0, Math.min(100, eligibilityScore + keywordBonus + (sectorHit ? 15 : 0) + (applicantFit ? 15 : 0)));
  // An eligible but off-topic call never scores above 70, as the methodology says.
  const score = verdict === "eligible" ? Math.min(70, raw) : raw;
  return { grant: g, verdict, score, rules };
}

const SELECT = `SELECT g.*, e.beneficiary_types AS e_beneficiary_types, e.sectors AS e_sectors, e.regions AS e_regions,
  e.company_sizes AS e_company_sizes, e.min_company_age AS e_min_company_age, e.max_company_age AS e_max_company_age,
  e.consortium_required AS e_consortium_required, e.keywords_en AS e_keywords_en`;

export interface MatchSummary {
  screened: number;
  fit: number;
  eligible: number;
  not_yet: number;
  no: number;
  shown: number;
  // Why calls were filtered, counted over the whole pool: rule name -> count of calls where it was the blocker.
  filtered_by: Record<string, number>;
  // The most frequent unverified condition among "not yet" calls, if any.
  common_gap: string | null;
}

export async function matchGrants(db: D1Database, form: ProfileForm, limit = 40): Promise<{ results: MatchResult[]; summary: MatchSummary }> {
  // "EU" as origin means anywhere in Europe: the pool is every European country in the ledger plus EU-wide calls.
  const countries = form.country === "EU" ? [...EUROPE] : [...new Set([form.country, "EU"])];
  const ph = countries.map(() => "?").join(",");
  const nowIso = new Date().toISOString();
  const rows = new Map<string, EnrichedRow>();

  // Keyword hits first (they carry a bonus and the matched terms), then the country pool ordered by deadline.
  const KW_LIMIT = 60;
  const broad: string[] = [];
  for (const kw of form.keywords.slice(0, 14)) {
    const q = keywordQuery(kw);
    if (!q) continue;
    // Title matches rank first (weight 8 against 1 for the summary).
    const res = await db
      .prepare(`${SELECT} FROM grants_fts f JOIN grants g ON g.rowid = f.rowid LEFT JOIN grant_enrichments e ON e.grant_id = g.id AND e.content_hash = g.content_hash
        WHERE grants_fts MATCH ? AND g.status IN ('open','forthcoming') AND (g.closes_at IS NULL OR g.closes_at >= ?) AND g.country IN (${ph}) ORDER BY bm25(grants_fts, 8.0, 1.0) LIMIT ${KW_LIMIT}`)
      .bind(q, nowIso, ...countries)
      .all<EnrichedRow>();
    // Calls published in another language are reached through their English enrichment text.
    const viaEnrichment = await db
      .prepare(`${SELECT} FROM enrichment_fts x JOIN grants g ON g.id = x.grant_id LEFT JOIN grant_enrichments e ON e.grant_id = g.id AND e.content_hash = g.content_hash
        WHERE enrichment_fts MATCH ? AND g.status IN ('open','forthcoming') AND (g.closes_at IS NULL OR g.closes_at >= ?) AND g.country IN (${ph}) ORDER BY bm25(enrichment_fts) LIMIT ${KW_LIMIT}`)
      .bind(q, nowIso, ...countries)
      .all<EnrichedRow>();
    if (res.results.length >= KW_LIMIT || viaEnrichment.results.length >= KW_LIMIT) broad.push(kw);
    [...res.results, ...viaEnrichment.results].forEach((r, rank) => {
      const prev = rows.get(r.id);
      if (prev?.fts_terms?.includes(kw)) return;
      rows.set(r.id, { ...r, fts_hit: 1, fts_terms: [...(prev?.fts_terms ?? []), kw], fts_rank: { ...(prev?.fts_rank ?? {}), [kw]: rank % KW_LIMIT } });
    });
  }
  // "Anywhere in Europe" screens the EU-wide programmes as a pool; national calls only enter through keyword hits,
  // since without a country nothing else links them to the company.
  const poolCountries = form.country === "EU" ? ["EU"] : countries;
  const poolPh = poolCountries.map(() => "?").join(",");
  const pool = await db
    .prepare(`${SELECT} FROM grants g LEFT JOIN grant_enrichments e ON e.grant_id = g.id AND e.content_hash = g.content_hash
      WHERE g.status IN ('open','forthcoming') AND (g.closes_at IS NULL OR g.closes_at >= ?) AND g.country IN (${poolPh})
      ORDER BY CASE WHEN g.closes_at IS NULL THEN 1 ELSE 0 END, g.closes_at ASC LIMIT 2500`)
    .bind(nowIso, ...poolCountries)
    .all<EnrichedRow>();
  for (const r of pool.results) if (!rows.has(r.id)) rows.set(r.id, r);
  // A keyword that tags a large share of the pool through the calls' theme classification is broad too.
  const themeCounts = new Map<string, number>();
  for (const r of rows.values()) {
    const themes = parseJson<string[]>(r.sectors, []).map((t) => t.toLowerCase());
    for (const k of form.keywords) if (themes.some((t) => ftsWords(k, 5).every((w) => t.includes(w)))) themeCounts.set(k, (themeCounts.get(k) ?? 0) + 1);
  }
  const threshold = Math.max(15, Math.round(rows.size * 0.05));
  for (const [k, n] of themeCounts) if (n >= threshold && !broad.includes(k)) broad.push(k);
  for (const r of rows.values()) r.fts_broad = broad;

  const all = [...rows.values()].map((r) => evaluate(r, form));
  const filteredBy: Record<string, number> = {};
  for (const m of all) {
    if (m.verdict !== "no") continue;
    const blocker = m.rules.find((r) => r.state === "mismatch")?.rule ?? (m.rules.some((r) => r.rule === "relevance") ? "relevance" : "other");
    filteredBy[blocker] = (filteredBy[blocker] ?? 0) + 1;
  }
  const gapCounts: Record<string, number> = {};
  for (const m of all) {
    if (m.verdict !== "not_yet") continue;
    for (const r of m.rules) if (r.state !== "match" && r.rule !== "relevance") gapCounts[r.text] = (gapCounts[r.text] ?? 0) + 1;
  }
  const commonGap = Object.entries(gapCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const summary: MatchSummary = {
    screened: all.length,
    fit: all.filter((m) => m.verdict === "fit").length,
    eligible: all.filter((m) => m.verdict === "eligible").length,
    not_yet: all.filter((m) => m.verdict === "not_yet").length,
    no: all.filter((m) => m.verdict === "no").length,
    shown: 0,
    filtered_by: filteredBy,
    common_gap: commonGap,
  };
  const results = all.filter((m) => m.verdict !== "no" || m.rules.some((r) => (r.rule === "keywords" || r.rule === "theme") && r.state === "match"));
  const order: Record<Verdict, number> = { fit: 0, not_yet: 1, eligible: 2, no: 3 };
  // Verdict first, then calls that match the keywords, then score, then nearest deadline.
  const kw = (m: MatchResult) => (m.rules.some((r) => (r.rule === "keywords" || r.rule === "theme") && r.state === "match") ? 1 : 0);
  results.sort((a, b) => order[a.verdict] - order[b.verdict] || kw(b) - kw(a) || b.score - a.score || (a.grant.closes_at ?? "9").localeCompare(b.grant.closes_at ?? "9"));
  const shown = results.slice(0, limit);
  summary.shown = shown.length;
  return { results: shown, summary };
}

// For a negative memo: a later cut-off in the same programme family (same source, same identifier prefix) and,
// when the call matched keywords, another open call that also matched.
export async function findAlternatives(db: D1Database, g: GrantView, results: MatchResult[]): Promise<{ later?: GrantView; sameGoal?: GrantView }> {
  const prefix = g.source_id.split("-").slice(0, 2).join("-");
  const later = await db
    .prepare(`SELECT * FROM grants WHERE source = ? AND source_id LIKE ? AND id != ? AND status IN ('open','forthcoming') AND (closes_at IS NULL OR closes_at > ?) ORDER BY closes_at ASC LIMIT 1`)
    .bind(g.source, `${prefix}%`, g.id, g.closes_at ?? "0")
    .first<GrantRow>();
  const sameGoal = results.find((m) => m.grant.id !== g.id && (m.verdict === "fit") && m.rules.some((r) => r.rule === "keywords"));
  return { later: later ? toView(later) : undefined, sameGoal: sameGoal?.grant };
}