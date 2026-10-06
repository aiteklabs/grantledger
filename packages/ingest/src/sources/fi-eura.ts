import type { Grant } from "@grantledger/schema";
import { stripHtml } from "../util";
import type { Page, Source } from "./types";

// Finland, EURA 2021 (EU structural funds calls). The list page embeds the whole dataset as pre-rendered JSON.
const LIST = "https://eura2021.fi/hakuilmoitukset";
const LICENSE = "EURA 2021 public call notices (Ministry of Economic Affairs and Employment of Finland)";

interface Call {
  id: string;
  tila: string;
  hakuaika?: { alku?: string; loppu?: string };
  otsikko: string;
  rahasto?: string;
  eakrTyyppi?: string;
  viranomainen?: string;
  alue?: string;
  hakutunnus?: string;
  maakunnat?: string[];
}
interface Data { preRenderData: { hankehaku: Call[]; koodisto?: Record<string, Record<string, unknown>> } }

const STATUS: Record<string, Grant["status"]> = { haettavissa: "open", julkaistu: "forthcoming", paattynyt: "closed" };

function label(koodisto: Data["preRenderData"]["koodisto"], set: string, code: string | undefined): string {
  if (!code) return "";
  const entry = koodisto?.[set]?.[code] as { fi?: string; nimi?: string } | string | undefined;
  if (!entry) return code;
  if (typeof entry === "string") return entry;
  return entry.fi ?? entry.nimi ?? code;
}

function normalize(c: Call, koodisto: Data["preRenderData"]["koodisto"]): Grant {
  const opens = c.hakuaika?.alku ? `${c.hakuaika.alku}T00:00:00.000Z` : null;
  const closes = c.hakuaika?.loppu ? `${c.hakuaika.loppu}T23:59:59.000Z` : null;
  const regions = (c.maakunnat ?? []).map((m) => label(koodisto, "maakunta", m));
  const fund = label(koodisto, "rahasto", c.rahasto) || c.rahasto || "";
  const bens: Grant["beneficiary_types"] = c.eakrTyyppi === "YRTU" ? ["company", "sme"] : c.rahasto === "ESR+" ? ["ngo", "public_body", "research_org"] : [];
  return {
    id: `fi_eura:${c.id}`,
    source: "fi_eura",
    source_id: c.id,
    source_url: `https://eura2021.fi/hakuilmoitukset/hakuilmoitus/${c.id}/`,
    source_license: LICENSE,
    title: stripHtml(c.otsikko),
    title_lang: "fi",
    summary: [
      `Rahasto: ${fund}`,
      c.hakutunnus ? `Hakutunnus: ${c.hakutunnus}` : "",
      `Viranomainen: ${label(koodisto, "viranomainen", c.viranomainen)}`,
      `Alue: ${label(koodisto, "alue", c.alue) || c.alue || ""}`,
      regions.length ? `Maakunnat: ${regions.join(", ")}` : "",
    ].filter(Boolean).join("\n"),
    funder_name: label(koodisto, "viranomainen", c.viranomainen) || null,
    funder_level: c.alue === "VALTAKUNNALLINEN" ? "national" : "regional",
    country: "FI",
    regions,
    funding_types: ["grant"],
    beneficiary_types: bens,
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: STATUS[c.tila] ?? "unknown",
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const fiEura: Source = {
  id: "fi_eura",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(): Promise<Page> {
    const res = await fetch(LIST, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for EURA list`);
    const html = await res.text();
    const raw = html.match(/<script type="__PREACT_CLI_DATA__">([\s\S]*?)<\/script>/)?.[1];
    if (!raw) throw new Error("EURA embedded data not found");
    const data = JSON.parse(decodeURIComponent(raw)) as Data;
    const calls = data.preRenderData.hankehaku ?? [];
    return { grants: calls.map((c) => normalize(c, data.preRenderData.koodisto)), raws: calls.map((c) => ({ source_id: c.id, payload: c })), next: null };
  },
};
