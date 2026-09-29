import type { Grant } from "@grantledger/schema";
import { stripHtml } from "../util";
import type { Page, Source } from "./types";

// Belgium, Brussels-Capital: Innoviris programme calendar, one server-rendered table (ID, description, type, kind, dates, comment).
const SITE = "https://www.innoviris.brussels";
const LICENSE = "Innoviris public programme calendar";

function normalize(cells: string[]): Grant | null {
  const [id, description, type, kind, start, end, comment] = cells;
  if (!id || !description || id === "ID") return null;
  const opens = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? `${start}T00:00:00.000Z` : null;
  const closes = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? `${end}T23:59:59.000Z` : null;
  const now = new Date().toISOString();
  const suspended = /suspend/i.test(comment ?? "");
  const status: Grant["status"] = suspended ? "closed" : closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : opens || kind === "OPEN" ? "open" : "unknown";
  return {
    id: `be_innoviris:${id}`,
    source: "be_innoviris",
    source_id: id,
    source_url: `${SITE}/program-calendar`,
    source_license: LICENSE,
    title: description,
    title_lang: "en",
    summary: [`Programme: ${type ?? ""}`, `Kind: ${kind ?? ""}`, comment ? `Comment: ${comment}` : ""].filter(Boolean).join("\n"),
    funder_name: "Innoviris",
    funder_level: "regional",
    country: "BE",
    regions: ["BE1"],
    funding_types: ["grant"],
    beneficiary_types: /brains|phd|doctor/i.test(description) ? ["research_org"] : ["company", "sme", "research_org"],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const beInnoviris: Source = {
  id: "be_innoviris",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(): Promise<Page> {
    const res = await fetch(`${SITE}/program-calendar`, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Innoviris calendar`);
    const html = await res.text();
    const rows = (html.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((tr) => (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map((c) => stripHtml(c).replace(/\s+/g, " ").trim()));
    const grants = rows.map(normalize).filter((g): g is Grant => !!g);
    return { grants, raws: grants.map((g) => ({ source_id: g.source_id, payload: rows.find((r) => r[0] === g.source_id) })), next: null };
  },
};
