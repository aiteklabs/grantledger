import type { Grant } from "@grantledger/schema";
import { fetchJson, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Italy incentivi.gov.it (Ministry of Enterprises): public Solr index behind the portal's "Scarica JSON" open data
// button, Italian Open Data License v2.0. About 6k incentives with structured beneficiaries, sizes, regions, amounts.
const SITE = "https://www.incentivi.gov.it";
const ENDPOINT = `${SITE}/solr/coredrupal/select`;
const PAGE_SIZE = 200;
const LICENSE = "IODL 2.0 (Italian Open Data License), incentivi.gov.it";
const FIELDS = [
  "zs_nid", "zs_title", "zs_body", "zs_url", "zm_field_scopes_value", "zs_field_open_date", "zs_field_close_date", "zs_field_close_date_descriptor",
  "zm_field_dimensions_value", "zm_field_subject_type_value", "zm_field_support_form_value", "zs_field_cost_min", "zs_field_cost_max",
  "zs_field_support_grant_type_min", "zs_field_support_grant_type_max", "zm_field_activity_sector_value", "zs_field_ateco", "zm_field_regions_value",
  "zm_field_special_territory_value", "zs_field_subject_grant", "zs_field_budget_allocation", "zs_field_link", "ds_last_update",
];

type Doc = Record<string, string | string[] | undefined>;
interface SolrResponse { response: { numFound: number; start: number; docs: Doc[] } }

const NUTS: Record<string, string> = {
  Piemonte: "ITC1", "Valle d'Aosta": "ITC2", Lombardia: "ITC4", Liguria: "ITC3", "Trentino-Alto Adige": "ITH1", Veneto: "ITH3", "Friuli-Venezia Giulia": "ITH4",
  "Emilia-Romagna": "ITH5", Toscana: "ITI1", Umbria: "ITI2", Marche: "ITI3", Lazio: "ITI4", Abruzzo: "ITF1", Molise: "ITF2", Campania: "ITF3", Puglia: "ITF4",
  Basilicata: "ITF5", Calabria: "ITF6", Sicilia: "ITG1", Sardegna: "ITG2",
};

const str = (d: Doc, k: string) => (Array.isArray(d[k]) ? (d[k] as string[]).join(", ") : ((d[k] as string | undefined) ?? ""));
const arr = (d: Doc, k: string) => (Array.isArray(d[k]) ? (d[k] as string[]) : d[k] ? [d[k] as string] : []);

function fundingTypes(forms: string[]): Grant["funding_types"] {
  const out = new Set<Grant["funding_types"][number]>();
  for (const f of forms.map((x) => x.toLowerCase())) {
    if (/fondo perduto|contributo|sovvenzione/.test(f)) out.add("grant");
    if (/finanziamento|prestito|mutuo/.test(f)) out.add("loan");
    if (/garanzia/.test(f)) out.add("guarantee");
    if (/fiscale|credito d'imposta|imposta|detrazione/.test(f)) out.add("tax_credit");
    if (/fondo di investimento|equity|capitale/.test(f)) out.add("equity");
    if (/premio/.test(f)) out.add("prize");
    if (/voucher/.test(f)) out.add("voucher");
  }
  return out.size ? [...out] : ["other"];
}

function beneficiaries(types: string[], sizes: string[]): Grant["beneficiary_types"] {
  const out = new Set<Grant["beneficiary_types"][number]>();
  const t = types.join(" ").toLowerCase();
  if (/startup|pmi innovativa/.test(t)) out.add("startup");
  if (/impresa|pmi|imprend/.test(t) || sizes.length) out.add("company");
  if (sizes.some((s) => /micro|piccola|media/i.test(s))) out.add("sme");
  if (/persona fisica|privat|cittadin|libero profess/.test(t)) out.add("individual");
  if (/ente pubblico|pubblica amministrazione|comun|regione/.test(t)) out.add("public_body");
  if (/terzo settore|associazion|no profit|non profit|onlus/.test(t)) out.add("ngo");
  if (/universit|ricerca/.test(t)) out.add("research_org");
  return [...out];
}

function ateco(text: string): string[] {
  return [...new Set([...text.matchAll(/\b(\d{2})(?:\.\d{1,2})?\b/g)].map((m) => m[1]!))].filter((c) => Number(c) >= 1 && Number(c) <= 99).slice(0, 20);
}

function normalize(d: Doc): Grant {
  const nid = str(d, "zs_nid");
  const opens = str(d, "zs_field_open_date") ? new Date(str(d, "zs_field_open_date")).toISOString() : null;
  const closes = str(d, "zs_field_close_date") ? new Date(str(d, "zs_field_close_date")).toISOString() : null;
  const now = new Date().toISOString();
  const status: Grant["status"] = closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : opens ? "open" : "unknown";
  const regionsRaw = arr(d, "zm_field_regions_value");
  const regions = regionsRaw.map((r) => NUTS[r] ?? r);
  const sizes = arr(d, "zm_field_dimensions_value");
  const summary = [
    stripHtml(str(d, "zs_body")),
    arr(d, "zm_field_scopes_value").length ? `Obiettivo: ${str(d, "zm_field_scopes_value")}` : "",
    sizes.length ? `Dimensione impresa: ${sizes.join(", ")}` : "",
    str(d, "zm_field_subject_type_value") ? `Tipologia soggetto: ${str(d, "zm_field_subject_type_value")}` : "",
    str(d, "zm_field_support_form_value") ? `Forma agevolazione: ${str(d, "zm_field_support_form_value")}` : "",
    str(d, "zs_field_ateco") ? `Codici ATECO: ${str(d, "zs_field_ateco")}` : "",
    str(d, "zs_field_close_date_descriptor") ? `Note: ${str(d, "zs_field_close_date_descriptor")}` : "",
  ].filter(Boolean).join("\n\n");
  const link = str(d, "zs_field_link");
  return {
    id: `it_incentivi:${nid}`,
    source: "it_incentivi",
    source_id: nid,
    source_url: `${SITE}${str(d, "zs_url") || `/it/catalogo`}`,
    source_license: LICENSE,
    title: stripHtml(str(d, "zs_title")) || nid,
    title_lang: "it",
    summary: summary.slice(0, 20000) || null,
    funder_name: str(d, "zs_field_subject_grant") || null,
    funder_level: regionsRaw.length > 0 && regionsRaw.length < 20 ? "regional" : "national",
    country: "IT",
    regions: regionsRaw.length >= 20 ? [] : regions,
    funding_types: fundingTypes(arr(d, "zm_field_support_form_value")),
    beneficiary_types: beneficiaries(arr(d, "zm_field_subject_type_value"), sizes),
    sectors: /tutti i settori/i.test(str(d, "zs_field_ateco")) ? [] : ateco(str(d, "zs_field_ateco")),
    amount_min: num(str(d, "zs_field_support_grant_type_min")),
    amount_max: num(str(d, "zs_field_support_grant_type_max")),
    budget_total: num(str(d, "zs_field_budget_allocation")),
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: /^https?:\/\//.test(link) ? [{ title: "Sito istituzionale", url: link }] : [],
    source_updated_at: str(d, "ds_last_update") ? new Date(str(d, "ds_last_update")).toISOString() : null,
  };
}

export const itIncentivi: Source = {
  id: "it_incentivi",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const start = Number(cursor);
    const params = new URLSearchParams({ "q.op": "OR", wt: "json", rows: String(PAGE_SIZE), start: String(start), q: "index_id:incentivi", fl: FIELDS.join(","), sort: "id asc" });
    const data = await fetchJson<SolrResponse>(`${ENDPOINT}?${params}`, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" } });
    const docs = data.response.docs;
    const grants = docs.map(normalize);
    const seen = start + docs.length;
    return { grants, raws: docs.map((d, i) => ({ source_id: grants[i]!.source_id, payload: d })), next: docs.length > 0 && seen < data.response.numFound ? String(seen) : null };
  },
};
