// Model spend guard. Every model call appends its token counts to model_usage; the month-to-date cost is computed
// from that ledger and compared to the limit kept in settings. Prices are Gemini 3.8 Flash list prices per million tokens.
export const PRICE_IN_USD_PER_M = 0.75;
export const PRICE_OUT_USD_PER_M = 3.75;
export const DEFAULT_LIMIT_USD = 10;

export interface Spend { month: string; input_tokens: number; output_tokens: number; usd: number; limit_usd: number; blocked: boolean; enrichments: number; prefills: number }

export function costUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * PRICE_IN_USD_PER_M + (outputTokens / 1e6) * PRICE_OUT_USD_PER_M;
}

export async function getLimitUsd(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'model_monthly_limit_usd'").first<{ value: string }>();
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LIMIT_USD;
}

export async function setLimitUsd(db: D1Database, usd: number): Promise<void> {
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('model_monthly_limit_usd', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(String(usd), new Date().toISOString()).run();
}

export async function monthSpend(db: D1Database): Promise<Spend> {
  const month = new Date().toISOString().slice(0, 7);
  const like = `${month}%`;
  const [row, limit] = await Promise.all([
    db.prepare("SELECT SUM(input_tokens) AS i, SUM(output_tokens) AS o, SUM(kind = 'enrichment') AS e, SUM(kind = 'prefill') AS p FROM model_usage WHERE created_at LIKE ?").bind(like).first<{ i: number | null; o: number | null; e: number | null; p: number | null }>(),
    getLimitUsd(db),
  ]);
  const input = row?.i ?? 0;
  const output = row?.o ?? 0;
  const usd = costUsd(input, output);
  return { month, input_tokens: input, output_tokens: output, usd, limit_usd: limit, blocked: usd >= limit, enrichments: row?.e ?? 0, prefills: row?.p ?? 0 };
}

// A call reserves an estimate before it starts, so concurrent calls near the limit are bounded; the reservation is
// replaced by the real usage when known, or stays as a conservative charge when the call never reports back.
export async function reserveUsage(db: D1Database, kind: "prefill" | "enrichment", ref: string, model: string, inputTokens: number, outputTokens: number): Promise<number> {
  const res = await db.prepare("INSERT INTO model_usage (created_at, kind, ref, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?) RETURNING id").bind(new Date().toISOString(), kind, `reserve:${ref}`, model, inputTokens, outputTokens).first<{ id: number }>();
  return res?.id ?? 0;
}

// Every model call is written here as soon as its usage is known, before its result is parsed or stored.
export async function recordUsage(db: D1Database, kind: "prefill" | "enrichment", ref: string, model: string, inputTokens: number | null, outputTokens: number | null, reservationId?: number): Promise<void> {
  const stmts = [db.prepare("INSERT INTO model_usage (created_at, kind, ref, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)").bind(new Date().toISOString(), kind, ref, model, inputTokens ?? 0, outputTokens ?? 0)];
  if (reservationId) stmts.push(db.prepare("DELETE FROM model_usage WHERE id = ?").bind(reservationId));
  await db.batch(stmts);
}

// First day of next month, when the budget resets, and the whole days left until then.
export function budgetReset(): { date: string; days: number } {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { date: next.toISOString().slice(0, 10), days: Math.ceil((next.getTime() - now.getTime()) / 86_400_000) };
}

// Throws when the month is over budget. Called before every model call.
// `share` lets background work stop earlier than the hard limit, so some budget stays for user prefills.
export async function assertBudget(db: D1Database, share = 1): Promise<Spend> {
  const s = await monthSpend(db);
  const cap = s.limit_usd * share;
  if (s.blocked || s.usd >= cap) throw new Error(`Model budget reached: $${s.usd.toFixed(2)} of $${cap.toFixed(2)} this month`);
  return s;
}
