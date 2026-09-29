import type { CloudflareEnvLike } from "./env-like";
import { extractProfile, fetchSiteText } from "./fit";
import { GeminiParseError, type ContentItem } from "./gemini";
import { assertBudget, recordUsage, reserveUsage } from "./spend";

// Reads the input, extracts a draft profile, marks the row "draft". The user then confirms the form.
export async function runPrefill(env: CloudflareEnvLike, id: string): Promise<void> {
  const db = env.DB;
  const started = Date.now();
  const row = await db.prepare("SELECT input_type, input_ref, input_text FROM fit_checks WHERE id = ?").bind(id).first<{ input_type: string; input_ref: string | null; input_text: string | null }>();
  if (!row) return;
  try {
    await assertBudget(db);
    const reservation = await reserveUsage(db, "prefill", id, env.GEMINI_MODEL, 40_000, 3_000);
    const input: ContentItem[] = [];
    let inputText = row.input_text ?? "";
    let inputName: string | null = null;
    if (row.input_type === "url" && row.input_ref) {
      const site = await fetchSiteText(row.input_ref);
      inputText = site.text;
      inputName = site.title;
      input.push({ type: "text", text: `WEBSITE: ${row.input_ref}\nTITLE: ${site.title}\n\n${site.text}` });
    } else if (row.input_type === "pdf" && row.input_ref) {
      const obj = await env.RAW.get(row.input_ref);
      if (!obj) throw new Error("Uploaded file not found");
      input.push({ type: "document", data: toBase64(new Uint8Array(await obj.arrayBuffer())), mime_type: "application/pdf" });
      input.push({ type: "text", text: "Fill the company profile from this document." });
    } else {
      input.push({ type: "text", text: `COMPANY DESCRIPTION\n${inputText}` });
    }
    const res = await extractProfile(env, input);
    await recordUsage(db, "prefill", id, env.GEMINI_MODEL, res.input_tokens, res.output_tokens, reservation);
    // Only a row still waiting takes the draft: a form confirmed meanwhile must not be reset.
    await db
      .prepare("UPDATE fit_checks SET status = 'draft', profile = ?, model = ?, input_name = COALESCE(?, input_name), input_text = ?, input_tokens = ?, output_tokens = ?, duration_ms = ? WHERE id = ? AND status = 'pending'")
      .bind(JSON.stringify(res.data), env.GEMINI_MODEL, inputName, inputText.slice(0, 20_000), res.input_tokens, res.output_tokens, Date.now() - started, id)
      .run();
  } catch (err) {
    if (err instanceof GeminiParseError) await recordUsage(db, "prefill", id, env.GEMINI_MODEL, err.input_tokens, err.output_tokens);
    const message = err instanceof Error ? err.message : String(err);
    await db.prepare("UPDATE fit_checks SET status = 'error', error = ?, duration_ms = ?, finished_at = ? WHERE id = ? AND status = 'pending'").bind(message.slice(0, 2000), Date.now() - started, new Date().toISOString(), id).run();
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
