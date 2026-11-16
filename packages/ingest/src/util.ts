import { decodeHTML } from "entities";

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Sources double-encode entities ("&amp;rsquo;"), so decode until the text stops changing.
export function decodeEntities(s: string): string {
  let out = s;
  for (let i = 0; i < 3; i++) {
    const next = decodeHTML(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

export function stripHtml(s: string): string {
  const withoutBlocks = s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  return decodeEntities(withoutBlocks.replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/div>|<\/tr>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// dd/mm/yyyy (BDNS) and mm/dd/yyyy (Grants.gov) helpers.
export function dmyToIso(value: string | null | undefined): string | null {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z` : null;
}
export function mdyToIso(value: string | null | undefined): string | null {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}T00:00:00.000Z` : null;
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function statusFromDates(opens: string | null, closes: string | null, now = new Date()): "forthcoming" | "open" | "closed" | "unknown" {
  const t = now.getTime();
  if (opens && new Date(opens).getTime() > t) return "forthcoming";
  if (closes && new Date(closes).getTime() < t) return "closed";
  if (opens || closes) return "open";
  return "unknown";
}

// A UK wall-clock time as ISO in UTC. The UK is UTC+1 from the last Sunday of March to the last Sunday of October.
export function londonIso(year: number, month: number, day: number, hour: number, minute = 0): string {
  const lastSunday = (m: number) => { const end = new Date(Date.UTC(year, m + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
  const summer = (month > 2 && month < 9) || (month === 2 && day >= lastSunday(2)) || (month === 9 && day < lastSunday(9));
  return new Date(Date.UTC(year, month, day, hour - (summer ? 1 : 0), minute)).toISOString();
}

// Some publishers (Akamai, Cloudflare WAF) fingerprint the TLS/HTTP client: fetch() gets 403, curl with HTTP/2
// passes. On the local runner (Bun) fall back to curl; inside the Worker there is no fallback and the error says so.
export async function fetchHtml(url: string, headers: Record<string, string>): Promise<string> {
  const res = await fetch(url, { headers, redirect: "follow" });
  if (res.ok) return res.text();
  const bun = (globalThis as { Bun?: { spawn: (cmd: string[], opts: { stdout: "pipe" }) => { stdout: ReadableStream; exited: Promise<number> } } }).Bun;
  if (res.status !== 403 || !bun) throw new Error(`HTTP ${res.status} for ${url} (WAF; use the local runner)`);
  const args = ["curl", "-sS", "-L", "--http2", "--compressed", "-m", "60", url];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  const proc = bun.spawn(args, { stdout: "pipe" });
  const html = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0 || html.length < 500) throw new Error(`curl failed for ${url}`);
  return html;
}

export async function fetchJson<T>(input: string, init?: RequestInit, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} for ${input}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${input}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

// Minimal RFC 4180 parser. Fields are taken as slices of the input, never built char by char:
// per-character concatenation creates millions of rope nodes and blew the Worker memory limit on a 6 MB file.
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    let field: string;
    if (text[i] === '"') {
      let j = i + 1;
      let escaped = false;
      for (;;) {
        const q = text.indexOf('"', j);
        if (q === -1) { j = n; break; }
        if (text[q + 1] === '"') { escaped = true; j = q + 2; continue; }
        j = q;
        break;
      }
      field = text.slice(i + 1, j);
      if (escaped) field = field.replaceAll('""', '"');
      i = Math.min(j + 1, n);
    } else {
      let j = i;
      while (j < n && text[j] !== delimiter && text[j] !== "\n" && text[j] !== "\r") j++;
      field = text.slice(i, j);
      i = j;
    }
    row.push(field);
    if (i >= n) break;
    const c = text[i];
    if (c === delimiter) i++;
    else if (c === "\r" || c === "\n") {
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      rows.push(row);
      row = [];
    } else {
      // Stray character after a closing quote: skip to the next delimiter or newline.
      while (i < n && text[i] !== delimiter && text[i] !== "\n" && text[i] !== "\r") i++;
    }
  }
  if (row.length) rows.push(row);
  return rows;
}
