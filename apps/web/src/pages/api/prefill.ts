import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hashIp, isAdmin } from "~/lib/auth";
import { currentAccount } from "~/lib/account";
import { verifyTurnstile } from "~/lib/turnstile";
import { geminiConfigured } from "~/lib/gemini";
import { runPrefill } from "~/lib/run-prefill";
import { monthSpend } from "~/lib/spend";

export const prerender = false;
const MAX_PDF = 20 * 1024 * 1024;

// Optional AI step, Pro accounts only: stores the input, extracts a draft profile in the background, sends the user
// back to the form.
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!(await currentAccount(request, env)) && !(await isAdmin(request, env))) return redirect("/pro?from=prefill", 303);
  if (!geminiConfigured(env)) return redirect("/find?error=prefill_unavailable", 303);
  // Refused before anything is read or stored: the month's model budget is a hard limit.
  if ((await monthSpend(env.DB)).blocked) return redirect("/find?error=budget", 303);
  const form = await request.formData();
  if (!(await verifyTurnstile(env, form, request.headers.get("cf-connecting-ip")))) return redirect("/find?error=captcha", 303);
  const url = String(form.get("url") ?? "").trim();
  const text = String(form.get("text") ?? "").trim();
  const file = form.get("pdf");
  const id = crypto.randomUUID();

  let inputType: "url" | "pdf" | "text";
  let inputRef: string | null = null;
  let inputName: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") return redirect("/find?error=pdf_only", 303);
    if (file.size > MAX_PDF) return redirect("/find?error=pdf_size", 303);
    inputType = "pdf";
    inputRef = `private/fit/${id}/${file.name.replace(/[^\w.-]+/g, "_")}`;
    inputName = file.name;
    await env.RAW.put(inputRef, await file.arrayBuffer(), { httpMetadata: { contentType: "application/pdf" } });
  } else if (url) {
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch {
      return redirect("/find?error=bad_url", 303);
    }
    inputType = "url";
    inputRef = parsed.href;
  } else if (text.length >= 40) {
    inputType = "text";
  } else {
    return redirect("/find?error=empty", 303);
  }

  await env.DB.prepare(
    "INSERT INTO fit_checks (id, created_at, input_type, input_ref, input_name, input_text, status, mode, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'sql', ?, ?)",
  )
    .bind(id, new Date().toISOString(), inputType, inputRef, inputName, inputType === "text" ? text.slice(0, 20_000) : null, await hashIp(request.headers.get("cf-connecting-ip")), (request.headers.get("user-agent") ?? "").slice(0, 300))
    .run();
  // Runs inside the request (about 20 seconds): a job that outlives the response could be cut off unfinished.
  await runPrefill(env, id);
  return redirect(`/find?draft=${id}`, 303);
};
