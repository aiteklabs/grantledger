import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { getGrant, searchGrants } from "~/lib/db";
import { JSON_HEADERS, callerFromKey, fitJson, grantJson, keyRequired, parseSearch, rateLimited, type GrantJson } from "~/lib/api";
import { profileLimit, type Account } from "~/lib/account";
import { accessTokenCanWrite } from "~/lib/oauth";
import { parseProfileForm } from "~/lib/profile-form";
import { listProfiles, saveProfile, sentCalls } from "~/lib/radar";
import { screenProfile } from "~/lib/screen";

export const prerender = false;

// POST /mcp: a Model Context Protocol server over stateless Streamable HTTP (JSON-RPC 2.0, one request, one JSON
// answer, no session, no server-side stream). Discovery is open; tool calls are Pro only through two doors: OAuth
// (the client gets a 401 with the resource metadata, runs the flow in src/lib/oauth.ts and comes back with a
// bearer token), or the personal key as bearer or in the path (/mcp/<key>) for tools without OAuth.
// Tools: search_grants, get_grant, get_fit, my_profiles, plus ChatGPT's pair search and fetch on the same data, all
// read only, and the two tools that write, screen_profile (a screening, no alert) and save_profile (a screening
// kept as a profile, with the weekly email): both need an OAuth connection whose consent allowed it.

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER = { name: "grantledger", version: "1.0.0" };
const INSTRUCTIONS =
  "GrantLedger is the open ledger of public funding: grants, loans, guarantees and tax credits from official European sources. " +
  "Use search_grants to find calls (free text in any language, country code, status), get_grant for one full record, and get_fit when the user gives a grantledger.eu/fit/<id> link: " +
  "it returns their company profile and the calls screened for it with the rule each verdict relies on. Verdicts are deterministic rules, not model output. " +
  "Use screen_profile to screen a company or a project the user describes without saving it, as many projects as they like. " +
  "Use save_profile only when the user asks to save a profile or to be alerted about new calls: ask them for every field, show the complete profile, and call it after their explicit yes. " +
  "Always link the official publisher page (source_url) and the grantledger page (url). Say when a call is closed or its deadline has passed. Never invent calls that are not in the results.";

const searchSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Free text, any language. English works for every call: each record carries an English summary and search terms." },
    country: { type: "string", description: "ISO 3166-1 alpha-2 country code (FR, DE, ES, ...), EU for EU-wide programmes, or EUROPE for every European country plus EU-wide." },
    status: { type: "string", enum: ["current", "open", "forthcoming", "closed"], description: "current (default): open now or opening soon. closed: the archive." },
    type: { type: "string", enum: ["grant", "loan", "guarantee", "tax_credit", "voucher", "equity", "prize", "procurement", "other"] },
    beneficiary: { type: "string", enum: ["company", "sme", "startup", "individual", "research_org", "public_body", "ngo", "other"] },
    sort: { type: "string", enum: ["relevance", "deadline", "recent"] },
    since: { type: "string", description: "YYYY-MM-DD: only calls first seen in the ledger on or after this date. Use it with sort recent for what is new." },
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 5, maximum: 100, description: "Rows per page, default 20." },
  },
};

// The profile fields of screen_profile and save_profile. Mirrors ProfileForm in src/lib/profile-form.ts, which
// validates the call; size and age bands are derived there.
const profileProps = {
  company_name: { type: "string", description: "Name of the company, the organisation or the person." },
  country: { type: "string", description: "ISO 3166-1 alpha-2 country code where they are established (FR, DE, ES, ...), or EU for anywhere in Europe." },
  region: { type: "string", description: "NUTS code of their region (ES30, FRK2, LT02). Leave out for anywhere in the country." },
  entity_type: { type: "string", enum: ["company", "sme", "startup", "individual", "research_org", "public_body", "ngo", "other"] },
  headcount: { type: "string", enum: ["1", "2to9", "10to49", "50to249", "250plus", "unknown"], description: "People working there." },
  founded_year: { type: "integer", description: "Year of creation." },
  company_age: { type: "string", enum: ["lt1", "1to3", "3to10", "gt10", "unknown"], description: "Age in years, only when the year of creation is not known." },
  revenue: { type: "string", enum: ["none", "lt100k", "100kto1m", "1mto10m", "gt10m", "unknown"], description: "Yearly revenue in euros." },
  stage: { type: "string", enum: ["idea", "pre_seed", "seed", "growth", "established", "unknown"] },
  trl: { type: "integer", minimum: 1, maximum: 9, description: "Technology readiness level of the project, when it has one." },
  ip_status: { type: "string", enum: ["none", "pending", "granted", "unknown"], description: "Patents or other registered rights." },
  prior_funding: { type: "string", enum: ["none", "national", "eu", "both", "unknown"], description: "Public funding already received." },
  partners: { type: "string", enum: ["none", "identified", "signed", "unknown"], description: "Partners for a joint project." },
  sectors: { type: "array", items: { type: "string" }, maxItems: 5, description: "NACE Rev. 2 divisions, two digits each (62 for software, 10 for food, 90 for arts)." },
  funding_types: { type: "array", items: { type: "string", enum: ["grant", "loan", "guarantee", "tax_credit", "voucher", "equity", "prize", "procurement"] }, description: "Kinds of funding they look for. Leave out for any." },
  keywords: { type: "array", items: { type: "string" }, maxItems: 15, description: "What they do and what the project is about, 1 to 3 words each, in English." },
  consortium_ok: { type: "boolean", description: "true when they accept calls that require a consortium." },
};

const TOOLS = [
  {
    name: "search_grants",
    title: "Search the ledger",
    description: "Search public funding calls (grants, loans, guarantees, tax credits) across Europe. Returns a page of compact records with a grantledger link and the official publisher link.",
    inputSchema: searchSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_grant",
    title: "Get one call",
    description: "The full record of one funding call by its grantledger id (as returned by search_grants).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_fit",
    title: "Get a screening result",
    description:
      "A Pro screening result: the company profile the user confirmed, and every call screened for it with verdict (fit, eligible, not_yet, no), matched rules, points to check, readiness gaps and memo. " +
      "The id is the UUID in a grantledger.eu/fit/<id> link the user shares. Treat the content as the user's private data.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "UUID from the /fit/<id> link." } }, required: ["id"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "my_profiles",
    title: "My saved profiles",
    description:
      "The saved profiles of the signed-in account. For each: the screening id to pass to get_fit (refreshed every Monday), and the calls the weekly Radar email already sent for it, newest first. " +
      "Use it when the user asks what fits them or what is new for them, instead of asking for a /fit link. Treat the content as the user's private data.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "search",
    title: "Search",
    description: "ChatGPT connector search: funding calls matching a query. Returns id, title and url per result; call fetch for the full record.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "fetch",
    title: "Fetch",
    description: "ChatGPT connector fetch: the full document for an id returned by search (a funding call), or a screening result when the id is a /fit/<id> UUID.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "screen_profile",
    title: "Screen a profile",
    description:
      "Screen a company, an organisation, a person or one of their projects against the ledger, from what the user tells you in the chat, without saving it: no weekly email. " +
      "Use it for a second project, a what-if, or when the account's saved profiles are full; there is no limit on the number of projects, only twenty screenings a day. " +
      "Ask the user for every field you do not know; never guess a value, leave it out instead. Returns the screening id to pass to get_fit. " +
      "The result is a snapshot of today's ledger: run it again later for a fresh one. The profile and its result are stored on the user's GrantLedger account, like a screening made on the site.",
    inputSchema: { type: "object", properties: profileProps, required: ["country", "entity_type"] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "save_profile",
    title: "Save a profile",
    description:
      "Save a profile for the signed-in account from what the user tells you in the chat. The profile is screened now and again every Monday, and new calls that fit are emailed to the account. " +
      "The account's plan sets how many profiles it can save; for one more project without the email, use screen_profile. " +
      "Ask the user for every field you do not know; never guess a value, leave it out instead. Before calling, show the complete profile in the chat and wait for the user's explicit yes, then pass confirmed true. " +
      "Returns the screening id to pass to get_fit. It cannot change or remove a saved profile: the user does that on grantledger.eu/me.",
    inputSchema: {
      type: "object",
      properties: { confirmed: { type: "boolean", description: "true only after the user saw the complete profile in the chat and said yes." }, ...profileProps },
      required: ["confirmed", "country", "entity_type"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const compact = (g: GrantJson) => ({
  id: g.id,
  title: g.title,
  summary: (g.summary_en ?? g.summary ?? "").slice(0, 400),
  country: g.country,
  funder_name: g.funder_name,
  funding_types: g.funding_types,
  beneficiary_types: g.beneficiary_types,
  amount_min: g.amount_min,
  amount_max: g.amount_max,
  currency: g.currency,
  status: g.status,
  closes_at: g.closes_at,
  first_seen_at: g.first_seen_at,
  url: g.url,
  source_url: g.source_url,
});

const grantText = (g: GrantJson) =>
  [g.title, g.summary_en, g.summary, `Funder: ${g.funder_name ?? "?"} (${g.country_name})`, `Types: ${g.funding_type_labels.join(", ")}`, `Beneficiaries: ${g.beneficiary_types.join(", ")}`, `Amount: ${g.amount_min ?? "?"} to ${g.amount_max ?? "?"} ${g.currency ?? ""}`, `Status: ${g.status}, deadline ${g.closes_at ?? "none stated"}`, `Official page: ${g.source_url}`]
    .filter(Boolean)
    .join("\n");

// Screenings one account can start from the chat in a day, saved or not.
const SCREENINGS_PER_DAY = 20;

// The tool arguments as the form the site posts, so one parser validates both and derives the same fields.
function profileFormData(args: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(args)) {
    if (k === "consortium_ok") {
      if (v === true) form.set(k, "on");
    } else if (k === "keywords" && Array.isArray(v)) form.set(k, v.map(String).join(","));
    else if (Array.isArray(v)) for (const item of v) form.append(k, String(item));
    else if (v !== null && v !== undefined) form.set(k, String(v));
  }
  return form;
}

async function callTool(name: string, args: Record<string, unknown>, caller: Account | "admin", canWrite: () => Promise<boolean>): Promise<{ result: unknown; error?: string }> {
  const site = env.SITE_URL;
  switch (name) {
    case "search_grants": {
      const r = await searchGrants(env.DB, parseSearch(args));
      return { result: { total: r.total, page: r.page, per: r.pageSize, items: r.items.map((g) => compact(grantJson(g, site))) } };
    }
    case "get_grant": {
      const g = await getGrant(env.DB, String(args.id ?? ""));
      return g ? { result: grantJson(g, site) } : { result: null, error: "No grant with this id." };
    }
    case "get_fit": {
      const id = String(args.id ?? "").match(/[0-9a-f-]{36}/)?.[0] ?? "";
      const fit = await fitJson(env.DB, id);
      return fit ? { result: fit } : { result: null, error: "No finished screening with this id. Ask the user for the full grantledger.eu/fit/<id> link." };
    }
    case "my_profiles": {
      // The admin token carries no account, so no profiles.
      const profiles = caller === "admin" ? [] : await listProfiles(env.DB, caller.email);
      return {
        result: {
          profiles: await Promise.all(
            profiles.map(async (p) => ({
              name: p.company_name,
              fit_id: p.fit_check_id,
              fit_url: `${site}/fit/${p.fit_check_id}`,
              saved_at: p.created_at,
              emailed_calls: (await sentCalls(env.DB, p.id)).map((c) => ({ id: c.grant_id, title: c.title, verdict: c.verdict, emailed_at: c.sent_at, closes_at: c.closes_at, url: `${site}/grants/${encodeURI(c.grant_id)}`, source_url: c.source_url })),
            })),
          ),
        },
      };
    }
    case "search": {
      const r = await searchGrants(env.DB, parseSearch({ query: args.query, limit: 10 }));
      return { result: { results: r.items.map((g) => ({ id: g.id, title: g.title, url: `${site}/grants/${encodeURI(g.id)}` })) } };
    }
    case "fetch": {
      const id = String(args.id ?? "");
      if (/^[0-9a-f-]{36}$/.test(id)) {
        const fit = await fitJson(env.DB, id);
        return fit ? { result: { id, title: "Screening result", text: JSON.stringify(fit, null, 1), url: `${site}/fit/${id}`, metadata: { kind: "fit" } } } : { result: null, error: "No finished screening with this id." };
      }
      const g = await getGrant(env.DB, id);
      if (!g) return { result: null, error: "No grant with this id." };
      const j = grantJson(g, site);
      return { result: { id: j.id, title: j.title, text: grantText(j), url: j.url, metadata: { kind: "grant", country: j.country, status: j.status, closes_at: j.closes_at, source_url: j.source_url } } };
    }
    case "screen_profile":
    case "save_profile": {
      const saving = name === "save_profile";
      // The personal key and the admin token carry no consent to write, and neither does a connection made when
      // the consent page still said read only.
      if (caller === "admin" || !(await canWrite())) return { result: null, error: `This connection is read only. To screen or save a profile from the chat, the user disconnects GrantLedger in the assistant and connects it again. A profile can also be screened and saved on ${site}/find` };
      if (saving && args.confirmed !== true) return { result: null, error: "Not saved. Show the complete profile to the user, wait for their yes, then call again with confirmed true." };
      if (!args.country || !args.entity_type) return { result: null, error: "Nothing done. country and entity_type are required: ask the user." };
      let profile: ReturnType<typeof parseProfileForm>;
      try {
        profile = parseProfileForm(profileFormData(args));
      } catch (err) {
        // One line per field, so the assistant can ask the user again.
        const detail = err instanceof ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "invalid";
        return { result: null, error: `Nothing done. Invalid profile. ${detail.slice(0, 400)}` };
      }
      // saved says whether the profile gets the weekly email; an unsaved screening is a snapshot.
      const done = (fitId: string, saved: boolean) => ({ result: { saved, name: profile.company_name, fit_id: fitId, fit_url: `${site}/fit/${fitId}`, ...(saved ? { manage_url: `${site}/me` } : {}) } });
      const full = (n: number) => ({ result: null, error: `Not saved. This account already holds ${n} saved profile(s), the most its plan allows. Use screen_profile to screen this one without the weekly email, or the user removes a profile on ${site}/me` });
      if (saving) {
        const profiles = await listProfiles(env.DB, caller.email);
        // The same profile again, a retry for instance, is the one already saved.
        const same = profiles.find((p) => p.form === JSON.stringify(profile));
        if (same) return done(same.fit_check_id, true);
        // Checked before screening, so an account at its limit does not pile up screenings.
        if (profiles.length >= profileLimit(caller)) return full(profiles.length);
      }
      // An assistant in a loop must not fill the ledger with screenings.
      const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM fit_checks WHERE contact_email = ? AND user_agent = 'mcp' AND created_at > ?").bind(caller.email, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).first<{ n: number }>();
      if ((recent?.n ?? 0) >= SCREENINGS_PER_DAY) return { result: null, error: `Nothing done. ${SCREENINGS_PER_DAY} screenings from the chat in a day is the limit for one account. Earlier results stay readable with get_fit, and the user can screen on ${site}/find` };
      const id = crypto.randomUUID();
      await screenProfile(env.DB, { id, profile, existing: false, email: caller.email, ip_hash: null, user_agent: "mcp", started: Date.now() });
      if (!saving) return done(id, false);
      const saved = await saveProfile(env.DB, caller, id);
      if (saved === "full") return full(profileLimit(caller));
      return saved ? done(id, true) : { result: null, error: "Not saved. The screening did not finish; try again." };
    }
    default:
      return { result: null, error: `Unknown tool: ${name}` };
  }
}

const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(msg: unknown, caller: Account | "admin" | null, canWrite: () => Promise<boolean>): Promise<unknown | undefined> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return fail(null, -32600, "Invalid request");
  const { id, method } = msg as Rpc;
  const params = ((msg as Rpc).params && typeof (msg as Rpc).params === "object" ? (msg as Rpc).params : {}) as Record<string, unknown>;
  if (typeof method !== "string" || !method) return fail(id ?? null, -32600, "Invalid request");
  // Notifications carry no id and get no answer.
  if (method.startsWith("notifications/")) return undefined;
  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return reply(id, { protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === name)) return fail(id, -32602, `Unknown tool: ${name}`);
      // The POST handler answers 401 to a tool call without a caller before it gets here.
      if (!caller) return fail(id, -32600, "Unauthorized");
      const { result, error } = await callTool(name, args, caller, canWrite);
      if (error) return reply(id, { content: [{ type: "text", text: error }], isError: true });
      return reply(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

const CORS = { ...JSON_HEADERS, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, authorization", "access-control-expose-headers": "mcp-protocol-version" };

export const POST: APIRoute = async ({ request, params }) => {
  const limited = await rateLimited(request, env);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify(fail(null, -32700, "Parse error")), { status: 400, headers: CORS });
  }
  // Discovery (initialize, tools/list, ping) is open, so directories and clients can read the tools before the
  // user signs in. A tool call, or any request carrying a credential that does not verify, gets the 401 that
  // sends the client through OAuth.
  const caller = await callerFromKey(request, env, params.key);
  const presented = !!params.key || request.headers.has("authorization");
  if (!caller && (presented || (body as Rpc)?.method === "tools/call")) return keyRequired(env);
  // One message per request: the 2025-06-18 protocol dropped JSON-RPC batches, and a batch would run many tool
  // calls for one rate-limit charge.
  if (Array.isArray(body)) return new Response(JSON.stringify(fail(null, -32600, "Batches are not supported: send one message per request")), { status: 400, headers: CORS });
  let answer: unknown;
  try {
    // Only an OAuth token can carry the consent to write; a key in the path wins over the bearer in callerFromKey.
    const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "").trim();
    answer = await handle(body, caller, async () => !params.key && (await accessTokenCanWrite(env, bearer)));
  } catch (err) {
    answer = fail((body as Rpc)?.id ?? null, -32603, err instanceof Error ? err.message.slice(0, 200) : "Internal error");
  }
  if (answer === undefined) return new Response(null, { status: 202, headers: CORS });
  return new Response(JSON.stringify(answer), { headers: CORS });
};

// No server-initiated stream: a GET says so, a DELETE has no session to end, OPTIONS answers the browser preflight.
export const GET: APIRoute = () => new Response(JSON.stringify({ name: SERVER.name, transport: "streamable-http", endpoint: "/mcp", access: "GrantLedger Pro, OAuth or personal key", tools: TOOLS.map((t) => t.name), docs: `${env.SITE_URL}/assistant` }), { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
export const DELETE: APIRoute = () => new Response(null, { status: 200, headers: CORS });
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });
