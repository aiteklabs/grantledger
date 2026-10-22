import type { Grant } from "@grantledger/schema";
import { fetchJson, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Netherlands RVO open data (CC0): one JSON list, 50 per page. Status and full text come from the public detail page.
const API = "https://www.rvo.nl/api/v1/opendata/subsidies";
const SITE = "https://www.rvo.nl";
const LICENSE = "CC0 1.0 (data.overheid.nl, RVO)";

interface Item {
  id: string;
  title: string;
  created: string;
  changed: string;
  intro: string;
  countries: { name: string; isoalpha2: string }[];
  sectors: string[];
  subjects: string[];
  subsidies: string[];
  tags: string[];
  targets: string[];
  type: string;
  url: string;
}

const TARGET: [string, Grant["beneficiary_types"][number]][] = [
  ["mkb", "sme"],
  ["grootbedrijf", "company"],
  ["agrarisch", "company"],
  ["kennisinstelling", "research_org"],
  ["non-profit", "ngo"],
  ["overheid", "public_body"],
  ["particulier", "individual"],
];

function beneficiaries(targets: string[]): Grant["beneficiary_types"] {
  const out = new Set<Grant["beneficiary_types"][number]>();
  for (const t of targets) {
    const hit = TARGET.find(([k]) => t.toLowerCase().includes(k));
    out.add(hit ? hit[1] : "other");
  }
  return [...out];
}

function fundingTypes(text: string): Grant["funding_types"] {
  const s = text.toLowerCase();
  const out = new Set<Grant["funding_types"][number]>();
  // RVO lists the accredited Seed Capital and early-stage funds as entries: those are equity, not grants.
  if (/(seed capital|seed business angel|vroegefasefinanciering|fund\b|\bb\.v\.)/.test(s)) return ["equity"];
  if (/(krediet|lening|financiering)/.test(s)) out.add("loan");
  if (/(garantie|borgstelling)/.test(s)) out.add("guarantee");
  if (/(fiscal|belasting|aftrek|wbso|innovatiebox)/.test(s)) out.add("tax_credit");
  if (out.size === 0 || /subsidie/.test(s)) out.add("grant");
  return [...out];
}

async function detail(url: string): Promise<{ status: Grant["status"]; text: string }> {
  const res = await fetch(url, { headers: { "user-agent": "grantledger/0.1 (+https://grantledger.eu)" } });
  if (!res.ok) return { status: "unknown", text: "" };
  const html = await res.text();
  const full = stripHtml(html);
  const status: Grant["status"] = /Open voor aanvragen/i.test(full) ? "open" : /Binnenkort open/i.test(full) ? "forthcoming" : /Gesloten|niet meer mogelijk/i.test(full) ? "closed" : "unknown";
  // Keep the article body: from the status label to the "commissioned by" footer line.
  const start = full.search(/(Open voor aanvragen|Gesloten voor aanvragen|Binnenkort open|Tijdelijk gesloten)/i);
  const body = start >= 0 ? full.slice(start) : full;
  const end = body.search(/\n(In opdracht van|Hoort bij|We helpen u graag)/);
  return { status, text: (end > 0 ? body.slice(0, end) : body).slice(0, 8000) };
}

function normalize(it: Item, d: { status: Grant["status"]; text: string }): Grant {
  const url = it.url.startsWith("http") ? it.url : `${SITE}${it.url}`;
  return {
    id: `nl_rvo:${it.id}`,
    source: "nl_rvo",
    source_id: it.id,
    source_url: url,
    source_license: LICENSE,
    title: stripHtml(it.title),
    title_lang: "nl",
    summary: [stripHtml(it.intro), d.text].filter(Boolean).join("\n\n").slice(0, 20000) || null,
    funder_name: "Rijksdienst voor Ondernemend Nederland (RVO)",
    funder_level: "national",
    country: "NL",
    regions: [],
    funding_types: fundingTypes(`${it.title} ${it.intro} ${it.subsidies.join(" ")}`),
    beneficiary_types: beneficiaries(it.targets),
    sectors: it.sectors,
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: d.status,
    opens_at: null,
    closes_at: null,
    documents: [],
    source_updated_at: it.changed,
  };
}

export const nlRvo: Source = {
  id: "nl_rvo",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const items = await fetchJson<Item[]>(`${API}?page=${page}`);
    const details = await mapLimit(items, 6, (it) => detail(it.url.startsWith("http") ? it.url : `${SITE}${it.url}`).catch(() => ({ status: "unknown" as const, text: "" })));
    const grants = items.map((it, i) => normalize(it, details[i]!));
    return { grants, raws: items.map((it, i) => ({ source_id: it.id, payload: { item: it, status: details[i]!.status } })), next: items.length > 0 ? String(page + 1) : null };
  },
};
