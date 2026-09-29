export function fmtDate(iso: string | null | undefined, locale = "en-GB"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" });
}

export function fmtMoney(value: number | null | undefined, currency: string | null | undefined, locale = "en-GB"): string {
  if (value === null || value === undefined) return "";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency ?? "EUR", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString(locale)} ${currency ?? ""}`;
  }
}

export function fmtInt(n: number, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function daysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export const COUNTRY_NAMES: Record<string, string> = {
  EU: "European Union",
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus", CZ: "Czechia", DK: "Denmark", EE: "Estonia",
  FI: "Finland", FR: "France", DE: "Germany", GR: "Greece", HU: "Hungary", IE: "Ireland", IT: "Italy", LV: "Latvia",
  LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "Netherlands", PL: "Poland", PT: "Portugal", RO: "Romania",
  SK: "Slovakia", SI: "Slovenia", ES: "Spain", SE: "Sweden",
  NO: "Norway", IS: "Iceland", LI: "Liechtenstein", CH: "Switzerland", GB: "United Kingdom", UK: "United Kingdom",
  UA: "Ukraine", MD: "Moldova", RS: "Serbia", BA: "Bosnia and Herzegovina", ME: "Montenegro", MK: "North Macedonia",
  AL: "Albania", XK: "Kosovo", TR: "Türkiye", GE: "Georgia", AM: "Armenia", IL: "Israel", TN: "Tunisia", FO: "Faroe Islands",
  US: "United States", CA: "Canada",
};

// Country name in the UI locale (CLDR through Intl), falling back to the English table.
export function countryName(code: string, locale: string): string {
  try {
    const n = new Intl.DisplayNames([locale], { type: "region" }).of(code);
    if (n && n !== code) return n;
  } catch {}
  return COUNTRY_NAMES[code] ?? code;
}

// EU member states: eligible by default for EU-wide programmes (Horizon Europe, Digital Europe, LIFE, Erasmus+, EIC...).
export const EU_MEMBERS = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);
// Countries associated to Horizon Europe (2026): eligible for most calls, with programme-specific exceptions.
export const HORIZON_ASSOCIATED = new Set(["NO", "IS", "UA", "MD", "RS", "BA", "ME", "MK", "AL", "XK", "TR", "GE", "AM", "IL", "TN", "FO", "GB", "UK", "CH", "CA", "KR", "NZ"]);

// Every European origin the form offers, used by the "all Europe" filter and the EU-wide screening mode.
export const EUROPE = new Set([...EU_MEMBERS, "NO", "IS", "LI", "CH", "GB", "UK", "UA", "MD", "RS", "BA", "ME", "MK", "AL", "XK", "TR", "GE", "AM", "EU"]);

// Countries with a national source already crawled. Everything else gets EU-wide programmes only.
export const NATIONAL_COVERAGE: Record<string, string> = {
  ES: "BDNS", FR: "aides-entreprises.fr", US: "Grants.gov", NL: "RVO", LT: "ES investicijos, Inovacijų agentūra", GB: "Find a grant", UK: "Find a grant", IT: "incentivi.gov.it",
  SE: "Vinnova", FI: "EURA 2021", NO: "Forskningsrådet, Innovasjon Norge, Tilskudd.no", DK: "Statens Tilskudspuljer, DFF, Innovationsfonden, Statens Kunstfond", AT: "FFG, aws, FWF", PT: "Portugal 2030, FCT, Fundo Ambiental", DE: "Förderberatung des Bundes, DFG",
  CZ: "dotaceeu.cz", GR: "ESPA", IE: "Enterprise Ireland, National Enterprise Hub, Research Ireland", RO: "MIPE announcements", PL: "FERS and FERC schedules (dane.gov.pl)", BE: "VLAIO, 1890.be, Innoviris, BELSPO",
};
export const PLANNED_SOURCES: Record<string, string> = {
  DE: "Förderdatenbank", NL: "RVO", IT: "incentivi.gov.it", GB: "Find a Grant", UK: "Find a Grant", LT: "INVEGA / LVPA", PL: "PARP", AT: "FFG / aws",
  SE: "Vinnova", DK: "Erhvervsstyrelsen", FI: "Business Finland", IE: "Enterprise Ireland", PT: "IAPMEI / Portugal 2030", BE: "regional agencies (VLAIO, Wallonie, Innoviris)",
};

// Order for the form: covered countries first, then the rest of Europe, then others.
export const FORM_COUNTRIES: string[] = [
  "DE", "FR", "IT", "ES", "PL", "NL", "BE", "AT", "PT", "SE", "FI", "DK", "NO", "IE", "CZ", "GR", "RO", "LT", "GB", "US",
  "BG", "HR", "CY", "EE", "HU", "LV", "LU", "MT", "SK", "SI",
  "IS", "LI", "CH", "UA", "MD", "RS", "BA", "ME", "MK", "AL", "XK", "TR", "GE", "AM", "IL", "CA",
];

export const SOURCE_NAMES: Record<string, string> = {
  eu_ft: "EU Funding & Tenders Portal",
  es_bdns: "Spain BDNS",
  fr_aides_entreprises: "France aides-entreprises.fr",
  us_grants_gov: "US Grants.gov",
  nl_rvo: "Netherlands RVO",
  lt_esinvesticijos: "Lithuania ES investicijos",
  uk_find_a_grant: "UK Find a grant",
  it_incentivi: "Italy incentivi.gov.it",
  se_vinnova: "Sweden Vinnova",
  fi_eura: "Finland EURA 2021",
  no_forskningsradet: "Norway Forskningsrådet",
  dk_tilskudspuljer: "Denmark Statens Tilskudspuljer",
  at_ffg: "Austria FFG",
  pt_portugal2030: "Portugal 2030",
  de_foerderinfo: "Germany Förderberatung des Bundes",
  cz_dotaceeu: "Czechia dotaceeu.cz",
  gr_espa: "Greece ESPA",
  ie_enterprise_ireland: "Ireland Enterprise Ireland",
  ro_mfe: "Romania MIPE announcements",
  pl_harmonogram: "Poland FERS and FERC schedules",
  be_1890: "Belgium Wallonia 1890.be",
  be_innoviris: "Belgium Brussels Innoviris",
  be_vlaio: "Belgium Flanders VLAIO",
  at_aws: "Austria aws",
  at_fwf: "Austria FWF",
  be_belspo: "Belgium BELSPO",
  dk_dff: "Denmark Danmarks Frie Forskningsfond",
  dk_innovationsfonden: "Denmark Innovationsfonden",
  dk_kunstfond: "Denmark Statens Kunstfond",
  de_dfg: "Germany DFG",
  ie_enterprise_hub: "Ireland National Enterprise Hub",
  ie_research_ireland: "Ireland Research Ireland",
  no_innovasjonnorge: "Norway Innovasjon Norge",
  no_tilskudd: "Norway Tilskudd.no",
  pt_fct: "Portugal FCT",
  pt_fundo_ambiental: "Portugal Fundo Ambiental",
  lt_inovacijuagentura: "Lithuania Inovacijų agentūra",
};

// What each feed covers, for the coverage register.
export const SOURCE_SCOPE: Record<string, string> = {
  eu_ft: "Every call on the Funding & Tenders Portal: Horizon Europe, Digital Europe, EIC, LIFE, CEF, Erasmus+, EU4Health and the rest, with topic descriptions",
  es_bdns: "National, regional and local subsidy calls in the state register, incremental every night",
  fr_aides_entreprises: "National and regional business support schemes listed by aides-entreprises.fr",
  us_grants_gov: "Federal grant opportunities from every US agency",
  nl_rvo: "National innovation, energy and enterprise programmes run by RVO",
  lt_esinvesticijos: "EU-funded calls published on esinvesticijos.lt",
  uk_find_a_grant: "Central government grants on Find a grant (GOV.UK)",
  it_incentivi: "National incentive schemes for businesses on incentivi.gov.it",
  se_vinnova: "Vinnova calls and application rounds",
  fi_eura: "EU structural fund calls in EURA 2021",
  no_forskningsradet: "Research and innovation calls for proposals from the Research Council of Norway",
  dk_tilskudspuljer: "Every state grant pool in the national register, across all ministries and funds",
  at_ffg: "Applied research and innovation calls from FFG",
  pt_portugal2030: "Calls for applications across the Portugal 2030 programmes",
  de_foerderinfo: "Federal research and innovation funding announcements (Bekanntmachungen)",
  cz_dotaceeu: "Calls across the Czech EU-funded operational programmes",
  gr_espa: "Proclamations across the Greek ESPA programmes",
  ie_enterprise_ireland: "Grants, vouchers and capability supports from Enterprise Ireland",
  ro_mfe: "Announcements from the Romanian Ministry of European Investments and Projects",
  pl_harmonogram: "Call schedules of the FERS and FERC programmes",
  be_1890: "The Walloon business support directory on 1890.be",
  be_innoviris: "The Brussels research and innovation programme calendar",
  be_vlaio: "Flemish subsidies and financing in the VLAIO subsidiedatabank",
  at_aws: "aws national SME and start-up programmes: grants, loans, guarantees, equity and prizes from the programme pages on aws.at",
  at_fwf: "FWF basic-research funding portfolio: projects, careers, collaborations and bilateral calls with their submission windows",
  be_belspo: "BELSPO federal research calls (STEREO, P4Science, DEFRA, JPI and partnership calls) and permanent schemes",
  dk_dff: "Independent Research Fund Denmark: current and announced national instruments and international co-investigator calls",
  dk_innovationsfonden: "Innovation Fund Denmark calls across its programmes",
  dk_kunstfond: "Danish Arts Foundation grant pools across architecture, visual arts, film, crafts and design, literature, music and performing arts",
  de_dfg: "DFG calls for proposals currently open (Informationen für die Wissenschaft: Ausschreibungen)",
  ie_enterprise_hub: "The National Enterprise Hub register of state business supports from about 29 Irish government agencies",
  ie_research_ireland: "Research Ireland funding programmes: open, upcoming and recently closed calls for researchers and host institutions",
  no_innovasjonnorge: "Innovasjon Norge grants, loans and guarantees for Norwegian companies: startup and innovation grants, environmental technology, clusters, agriculture",
  no_tilskudd: "Norwegian state grant schemes for voluntary and non-profit organisations registered on Tilskudd.no",
  pt_fct: "FCT, Portugal's national research agency: calls for R&D projects, advanced computing, bilateral cooperation, institutions, infrastructures and prizes",
  pt_fundo_ambiental: "Fundo Ambiental calls from the current-year register and the PRR register, with deadlines, budgets and beneficiaries",
  lt_inovacijuagentura: "Lithuanian Innovation Agency funding calls: national and EU-funded instruments for startups, SMEs, research organisations and public bodies",
};

export const FUNDING_TYPE_LABELS: Record<string, string> = {
  grant: "Grant",
  loan: "Loan",
  guarantee: "Guarantee",
  tax_credit: "Tax credit",
  voucher: "Voucher",
  equity: "Equity",
  prize: "Prize",
  procurement: "Procurement",
  other: "Other",
};
