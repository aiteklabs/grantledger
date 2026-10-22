import type { Grant } from "@grantledger/schema";
import { stripHtml } from "../util";
import type { Page, Source } from "./types";

// Ireland, Enterprise Ireland supports: one server-rendered page of funding and grant programmes (open-ended, no dates).
const SITE = "https://www.enterprise-ireland.com";
const LIST = `${SITE}/en/supports/funding-and-grants`;
const LICENSE = "Enterprise Ireland public supports information";

function normalize(card: string): Grant | null {
  const href = card.match(/href="(\/en\/supports\/[^"]+)"/)?.[1];
  if (!href) return null;
  const title = stripHtml(card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1] ?? "").trim();
  const tags = [...card.matchAll(/icon-tag"><\/i>([^<]+)/g)].map((m) => m[1]!.trim());
  const desc = stripHtml(card.match(/<div class="body-text desc">([\s\S]*?)<\/div>/)?.[1] ?? "").trim();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (tags.some((t) => /SME/i.test(t))) bens.add("sme");
  if (tags.some((t) => /Start-?up/i.test(t))) bens.add("startup");
  if (tags.some((t) => /Researcher|Research/i.test(t))) bens.add("research_org");
  if (bens.size === 0) bens.add("company");
  const slug = href.split("/").filter(Boolean).pop() ?? href;
  return {
    id: `ie_enterprise_ireland:${slug}`,
    source: "ie_enterprise_ireland",
    source_id: slug,
    source_url: `${SITE}${href}`,
    source_license: LICENSE,
    title: title || slug,
    title_lang: "en",
    summary: [desc, tags.length ? `Tags: ${tags.join(", ")}` : ""].filter(Boolean).join("\n") || null,
    funder_name: "Enterprise Ireland",
    funder_level: "national",
    country: "IE",
    regions: [],
    funding_types: tags.some((t) => /equity|investment/i.test(t)) ? ["equity"] : ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: "open",
    opens_at: null,
    closes_at: null,
    documents: [],
    source_updated_at: null,
  };
}

export const ieEnterpriseIreland: Source = {
  id: "ie_enterprise_ireland",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(): Promise<Page> {
    const res = await fetch(LIST, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Enterprise Ireland list`);
    const html = await res.text();
    const cards = html.split('class="col-lg-4 col-12 card-wrapper js-filter-card"').slice(1);
    const grants = cards.map(normalize).filter((g): g is Grant => !!g);
    return { grants, raws: grants.map((g) => ({ source_id: g.source_id, payload: { title: g.title, url: g.source_url } })), next: null };
  },
};
