import type { Grant } from "@grantledger/schema";
import { parseCsv, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// France aides-entreprises.fr, daily CSV mirror published under Licence Ouverte 2.0.
// aides.csv is one 6 MB windows-1252 file with ";" delimiter and id columns resolved through
// four lookup files (financeurs, natures, territoires, profils). Cursor = row offset.
const BASE = "http://data.cquest.org/dge_aides_entreprises";
const PAGE_SIZE = 500;
const LICENSE = "Licence Ouverte 2.0 (Etalab)";

interface Dump {
  header: string[];
  rows: string[][];
  funders: Map<string, string>;
  natures: Map<string, string>;
  territories: Map<string, { code: string; name: string }>;
  profiles: Map<string, string>;
  at: number;
}

let cached: Dump | null = null;

async function csv(name: string): Promise<string[][]> {
  const res = await fetch(`${BASE}/${name}.csv`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${BASE}/${name}.csv`);
  const text = new TextDecoder("windows-1252").decode(await res.arrayBuffer());
  return parseCsv(text, ";").filter((r) => r.length > 1);
}

function lookup(rows: string[][], idCol: number, valueCol: number): Map<string, string> {
  return new Map(rows.slice(1).map((r) => [r[idCol] ?? "", r[valueCol] ?? ""]));
}

// Files are loaded one at a time and reduced to maps immediately: loading all five in parallel exceeded the Worker memory limit.
async function load(): Promise<Dump> {
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached;
  const [header = [], ...rows] = await csv("aides");
  const funders = lookup(await csv("financeurs"), 0, 1);
  const natures = lookup(await csv("natures"), 0, 1);
  const territories = new Map((await csv("territoires")).slice(1).map((r) => [r[0] ?? "", { code: r[2] ?? "", name: r[3] ?? "" }]));
  const profiles = lookup(await csv("profils"), 0, 1);
  cached = { header, rows, funders, natures, territories, profiles, at: Date.now() };
  return cached;
}

const NATURE: [string, Grant["funding_types"][number]][] = [
  ["subvention", "grant"],
  ["prêt", "loan"],
  ["avance", "loan"],
  ["garantie", "guarantee"],
  ["fiscal", "tax_credit"],
  ["exonération", "tax_credit"],
  ["crédit d'impôt", "tax_credit"],
  ["capital", "equity"],
  ["prix", "prize"],
];

function ids(value: string): string[] {
  return value.split(/[,|;]/).map((s) => s.trim()).filter(Boolean);
}

function funderLevel(coverage: string): Grant["funder_level"] {
  const s = coverage.toLowerCase();
  if (s.includes("europ")) return "supranational";
  if (s.includes("national")) return "national";
  if (s.includes("territorial")) return "regional";
  return "unknown";
}

function normalize(row: Record<string, string>, dump: Dump): Grant {
  const id = row.id_aid ?? "";
  const closes = toIso(row.date_fin);
  const natures = ids(row.natures ?? "").map((n) => dump.natures.get(n) ?? n);
  const fundingTypes = new Set<Grant["funding_types"][number]>();
  for (const label of natures) {
    const hit = NATURE.find(([needle]) => label.toLowerCase().includes(needle));
    fundingTypes.add(hit ? hit[1] : "other");
  }
  const profiles = ids(row.profils ?? "").map((p) => dump.profiles.get(p) ?? p);
  // Territory ids missing from the lookup (old ids, free text) are kept raw so the matcher flags "check region" instead of "no restriction".
  const territorial = (row.couverture_geo ?? "").toLowerCase().includes("territorial");
  const regions = ids(row.territoires ?? "")
    .map((t) => {
      const hit = dump.territories.get(t);
      return hit?.code || hit?.name || t;
    })
    .filter((t) => t && t !== "FR");
  if (territorial && regions.length === 0) regions.push("territorial");
  const eligibility = [
    natures.length ? `Type: ${natures.join(", ")}` : "",
    profiles.length ? `Profiles: ${profiles.join(", ")}` : "",
    row.effectif ? `Headcount: ${row.effectif}` : "",
    row.age_entreprise ? `Company age: ${row.age_entreprise}` : "",
  ].filter(Boolean);
  const summary = [row.aid_objet, row.aid_operations_el, row.aid_conditions, row.aid_montant]
    .filter(Boolean)
    .map((s) => stripHtml(s!))
    .concat(eligibility.length ? [eligibility.join("\n")] : [])
    .join("\n\n");
  return {
    id: `fr_aides_entreprises:${id}`,
    source: "fr_aides_entreprises",
    source_id: id,
    source_url: `https://www.aides-entreprises.fr/aide/${id}`,
    source_license: LICENSE,
    title: stripHtml(row.aid_nom ?? id),
    title_lang: "fr",
    summary: summary || null,
    funder_name: ids(row.financeurs ?? "").map((f) => dump.funders.get(f) ?? f).join(" / ") || null,
    funder_level: funderLevel(row.couverture_geo ?? ""),
    country: "FR",
    // Territory codes are the source's region codes (NORM, BRET, NA, department numbers). Names or raw ids when no code.
    regions,
    funding_types: fundingTypes.size ? [...fundingTypes] : ["other"],
    beneficiary_types: ["company"],
    sectors: ids(row.id_domaine ?? ""),
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: row.status !== "1" ? "closed" : closes && new Date(closes) < new Date() ? "closed" : "open",
    opens_at: null,
    closes_at: closes,
    documents: ids(row.complements_reglements ?? "")
      .filter((u) => /^https?:\/\//.test(u))
      .map((u) => ({ title: "Regulation", url: u })),
    source_updated_at: toIso(row.aid_validation),
  };
}

export const frAidesEntreprises: Source = {
  id: "fr_aides_entreprises",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const offset = Number(cursor);
    const dump = await load();
    const slice = dump.rows.slice(offset, offset + PAGE_SIZE);
    const records = slice.map((r) => Object.fromEntries(dump.header.map((h, i) => [h, r[i] ?? ""])));
    const grants = records.map((r) => normalize(r, dump));
    return {
      grants,
      raws: records.map((r, i) => ({ source_id: grants[i]!.source_id, payload: r })),
      next: offset + PAGE_SIZE < dump.rows.length ? String(offset + PAGE_SIZE) : null,
    };
  },
};
