import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getGrant, searchGrants } from "~/lib/db";
import { JSON_HEADERS, callerFromKey, fitJson, grantJson, keyRequired, parseSearch, rateLimited, type GrantJson } from "~/lib/api";

export const prerender = false;

// POST /mcp: a Model Context Protocol server over stateless Streamable HTTP (JSON-RPC 2.0, one request, one JSON
// answer, no session, no server-side stream). Discovery is open; tool calls are Pro only through two doors: OAuth
// (the client gets a 401 with the resource metadata, runs the flow in src/lib/oauth.ts and comes back with a
// bearer token), or the personal key as bearer or in the path (/mcp/<key>) for tools without OAuth.
// Tools: search_grants, get_grant, get_fit, plus ChatGPT's pair search and fetch on the same data.

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER = { name: "grantledger", version: "1.0.0" };
const INSTRUCTIONS =
  "GrantLedger is the open ledger of public funding: grants, loans, guarantees and tax credits from official European sources. " +
  "Use search_grants to find calls (free text in any language, country code, status), get_grant for one full record, and get_fit when the user gives a grantledger.eu/fit/<id> link: " +
  "it returns their profile (a company, an organisation or an individual) and the calls screened for it with the rule each verdict relies on. Verdicts are deterministic rules, not model output. " +
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
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 5, maximum: 100, description: "Rows per page, default 20." },
  },
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
      "A Pro screening result: the profile the user confirmed (a company, an organisation or an individual), and every call screened for it with verdict (fit, eligible, not_yet, no), matched rules, points to check, readiness gaps and memo. " +
      "The id is the UUID in a grantledger.eu/fit/<id> link the user shares. Treat the content as the user's private data.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "UUID from the /fit/<id> link." } }, required: ["id"] },
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
  url: g.url,
  source_url: g.source_url,
});

const grantText = (g: GrantJson) =>
  [g.title, g.summary_en, g.summary, `Funder: ${g.funder_name ?? "?"} (${g.country_name})`, `Types: ${g.funding_type_labels.join(", ")}`, `Beneficiaries: ${g.beneficiary_types.join(", ")}`, `Amount: ${g.amount_min ?? "?"} to ${g.amount_max ?? "?"} ${g.currency ?? ""}`, `Status: ${g.status}, deadline ${g.closes_at ?? "none stated"}`, `Official page: ${g.source_url}`]
    .filter(Boolean)
    .join("\n");

async function callTool(name: string, args: Record<string, unknown>): Promise<{ result: unknown; error?: string }> {
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
    default:
      return { result: null, error: `Unknown tool: ${name}` };
  }
}

const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(msg: unknown): Promise<unknown | undefined> {
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
      const { result, error } = await callTool(name, args);
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
    answer = await handle(body);
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
