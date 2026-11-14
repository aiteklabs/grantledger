import type { Grant } from "@grantledger/schema";
import { fetchJson, num, stripHtml } from "../util";
import { LEGACY_IDS } from "./it-incentivi-ids";
import type { Page, Source } from "./types";

// Italy, Incentivi Italia (Ministry of Enterprises, incentivitalia.gov.it): the daily open data export of the
// incentives catalogue, CC BY 4.0. One JSON file of about 6k incentives (29 MB) with structured beneficiaries, sizes,
// regions and amounts. It replaced the Solr index of incentivi.gov.it, which now redirects to the new portal.
const SITE = "https://www.incentivitalia.gov.it";
const EXPORT = `${SITE}/open-data/incentivi/OpenData_Incentivi.json`;
const PAGE_SIZE = 200;
const LICENSE = "CC BY 4.0, Incentivi Italia (incentivitalia.gov.it)";

type Doc = Record<string, string | number | string[] | null | undefined>;

const NUTS: Record<string, string> = {
  Piemonte: "ITC1", "Valle d'Aosta": "ITC2", Lombardia: "ITC4", Liguria: "ITC3", "Trentino-Alto Adige": "ITH1", "Trentino-Alto Adige/Südtirol": "ITH1", "Valle d'Aosta/Vallée d'Aoste": "ITC2", Veneto: "ITH3", "Friuli-Venezia Giulia": "ITH4",
  "Emilia-Romagna": "ITH5", Toscana: "ITI1", Umbria: "ITI2", Marche: "ITI3", Lazio: "ITI4", Abruzzo: "ITF1", Molise: "ITF2", Campania: "ITF3", Puglia: "ITF4",
  Basilicata: "ITF5", Calabria: "ITF6", Sicilia: "ITG1", Sardegna: "ITG2",
};

// The export pads empty fields with a single space and empty lists with [" "].
const arr = (d: Doc, k: string) => (Array.isArray(d[k]) ? (d[k] as string[]) : typeof d[k] === "string" ? [d[k] as string] : []).map((x) => x.trim()).filter(Boolean);
const str = (d: Doc, k: string) => (Array.isArray(d[k]) ? arr(d, k).join(", ") : String(d[k] ?? "").trim());

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
  const portalId = str(d, "idBando");
  const id = LEGACY_IDS[portalId] ?? portalId;
  const opens = str(d, "Data_apertura") ? new Date(str(d, "Data_apertura")).toISOString() : null;
  const closes = str(d, "Data_chiusura") ? new Date(str(d, "Data_chiusura")).toISOString() : null;
  const now = new Date().toISOString();
  const status: Grant["status"] = closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : opens ? "open" : "unknown";
  // "Estero" (abroad) is listed next to the regions and is not one.
  const regionsRaw = arr(d, "Regioni").filter((r) => NUTS[r]);
  const sizes = arr(d, "Dimensione_beneficiari");
  const summary = [
    stripHtml(str(d, "Descrizione")),
    str(d, "Obiettivo_Finalita") ? `Obiettivo: ${str(d, "Obiettivo_Finalita")}` : "",
    sizes.length ? `Dimensione impresa: ${sizes.join(", ")}` : "",
    str(d, "Tipologia_Soggetto") ? `Tipologia soggetto: ${str(d, "Tipologia_Soggetto")}` : "",
    str(d, "Forma_agevolazione") ? `Forma agevolazione: ${str(d, "Forma_agevolazione")}` : "",
    str(d, "Codici_ATECO") ? `Codici ATECO: ${str(d, "Codici_ATECO")}` : "",
    str(d, "Note_di_apertura_chiusura") ? `Note: ${str(d, "Note_di_apertura_chiusura")}` : "",
  ].filter(Boolean).join("\n\n");
  const link = str(d, "Link_istituzionale");
  return {
    id: `it_incentivi:${id}`,
    source: "it_incentivi",
    source_id: id,
    source_url: `${SITE}/incentivo/${portalId}`,
    source_license: LICENSE,
    title: stripHtml(str(d, "Titolo")) || id,
    title_lang: "it",
    summary: summary.slice(0, 20000) || null,
    funder_name: str(d, "Soggetto_Concedente") || null,
    funder_level: regionsRaw.length > 0 && regionsRaw.length < 20 ? "regional" : "national",
    country: "IT",
    regions: regionsRaw.length >= 20 ? [] : regionsRaw.map((r) => NUTS[r]!),
    funding_types: fundingTypes(arr(d, "Forma_agevolazione")),
    beneficiary_types: beneficiaries(arr(d, "Tipologia_Soggetto"), sizes),
    sectors: /tutti i settori/i.test(str(d, "Codici_ATECO")) ? [] : ateco(str(d, "Codici_ATECO")),
    amount_min: num(d.Agevolazione_Concedibile_Min),
    amount_max: num(d.Agevolazione_Concedibile_Max),
    budget_total: num(d.Stanziamento_incentivo),
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: /^https?:\/\//.test(link) ? [{ title: "Sito istituzionale", url: link }] : [],
    source_updated_at: null,
  };
}

// The export is one file: download it once per process, then hand it out in pages.
let catalogue: Promise<Doc[]> | undefined;

// The file is too large to parse inside a Worker (128 MB), so this feed runs on the GitHub runner.
export const itIncentivi: Source = {
  id: "it_incentivi",
  license: LICENSE,
  runner: "local",
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const start = Number(cursor);
    catalogue ??= fetchJson<Doc[]>(EXPORT, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" } });
    const all = await catalogue;
    if (!Array.isArray(all) || all.length === 0) throw new Error("Incentivi Italia export is empty or not a list (format change?)");
    const docs = all.slice(start, start + PAGE_SIZE);
    const grants = docs.map(normalize);
    return { grants, raws: docs.map((d, i) => ({ source_id: grants[i]!.source_id, payload: d })), next: start + PAGE_SIZE < all.length ? String(start + PAGE_SIZE) : null };
  },
};
