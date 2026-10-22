import type { Grant } from "@grantledger/schema";
import { fetchJson, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Belgium, Wallonia: 1890.be (SOWALFIN, Région wallonne), the official directory of business aid. JSON API, 15 per page,
// one detail call per solution for the text. Schemes are open-ended, no dates.
const API = "https://api.1890.be/api/v1/solution";
const SITE = "https://www.1890.be";
const LICENSE = "1890.be public business aid directory (Région wallonne)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

interface ListItem { title: string; date?: string; kind?: string; link?: { url?: string } }
interface ListResponse { content: ListItem[]; pages: number; current_page: number; is_last_page: boolean }

function collectText(node: unknown, out: string[], depth = 0): void {
  if (depth > 8) return;
  if (Array.isArray(node)) node.forEach((n) => collectText(n, out, depth + 1));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if ((k === "intro" || k === "wysiwyg" || k === "text") && typeof v === "string") out.push(stripHtml(v));
      else if (typeof v === "object") collectText(v, out, depth + 1);
    }
  }
}

function fundingTypes(text: string): Grant["funding_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["funding_types"][number]>();
  if (/prêt|crédit|financement/.test(t)) out.add("loan");
  if (/garantie/.test(t)) out.add("guarantee");
  if (/capital|investissement en fonds/.test(t)) out.add("equity");
  if (/fiscal|déduction|réduction d'impôt/.test(t)) out.add("tax_credit");
  if (/chèque/.test(t)) out.add("voucher");
  if (/subside|subvention|prime|aide financière/.test(t) || out.size === 0) out.add("grant");
  return [...out];
}

export const be1890: Source = {
  id: "be_1890",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const list = await fetchJson<ListResponse>(`${API}?page=${page}`, { headers: UA });
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    for (const it of list.content) {
      const slug = (it.link?.url ?? "").split("/").filter(Boolean).pop();
      if (!slug) continue;
      const detail = await fetchJson<unknown>(`${API}/${encodeURIComponent(slug)}`, { headers: UA }).catch(() => null);
      const texts: string[] = [];
      if (detail) collectText(detail, texts);
      const summary = [...new Set(texts)].join("\n\n").slice(0, 12000);
      const text = `${it.title} ${summary}`;
      grants.push({
        id: `be_1890:${slug}`,
        source: "be_1890",
        source_id: slug,
        source_url: `${SITE}/solution/${slug}/`,
        source_license: LICENSE,
        title: stripHtml(it.title),
        title_lang: "fr",
        summary: summary || null,
        funder_name: "Région wallonne (1890.be)",
        funder_level: "regional",
        country: "BE",
        regions: ["BE3"],
        funding_types: fundingTypes(text),
        beneficiary_types: /indépendant|personne physique/i.test(text) ? ["company", "sme", "individual"] : ["company", "sme"],
        sectors: [],
        amount_min: null,
        amount_max: null,
        budget_total: null,
        currency: "EUR",
        status: "open",
        opens_at: null,
        closes_at: null,
        documents: [],
        source_updated_at: it.date ? `${it.date}T00:00:00.000Z` : null,
      });
      raws.push({ source_id: slug, payload: { item: it, summary: summary.slice(0, 1500) } });
    }
    return { grants, raws, next: list.is_last_page || list.content.length === 0 ? null : String(page + 1) };
  },
};
