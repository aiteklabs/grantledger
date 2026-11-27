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
  ES: "BDNS", FR: "aides-entreprises.fr", US: "Grants.gov", NL: "RVO", LT: "ES investicijos, Inovacijų agentūra", GB: "Find a grant", UK: "Find a grant", IT: "Incentivi Italia",
  SE: "Vinnova", FI: "EURA 2021", NO: "Forskningsrådet, Innovasjon Norge, Tilskudd.no", DK: "Statens Tilskudspuljer, DFF, Innovationsfonden, Statens Kunstfond", AT: "FFG, aws, FWF", PT: "Portugal 2030, FCT, Fundo Ambiental", DE: "Förderberatung des Bundes, DFG",
  CZ: "dotaceeu.cz", GR: "ESPA", IE: "Enterprise Ireland, National Enterprise Hub, Research Ireland", RO: "MIPE announcements", PL: "FERS and FERC schedules (dane.gov.pl)", BE: "VLAIO, 1890.be, Innoviris, BELSPO",
};
export const PLANNED_SOURCES: Record<string, string> = {
  DE: "Förderdatenbank", NL: "RVO", IT: "Incentivi Italia", GB: "Find a Grant", UK: "Find a Grant", LT: "INVEGA / LVPA", PL: "PARP", AT: "FFG / aws",
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
  it_incentivi: "Italy Incentivi Italia",
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
  uk_prs_foundation: "UK PRS Foundation",
  uk_sussex_cf: "UK Sussex Community Foundation",
  uk_brighton_hove: "UK Brighton & Hove City Council",
  fr_iledefrance: "France Région Île-de-France",
  de_dsee: "Germany DSEE Förderdatenbank",
  ee_etag: "Estonia Eesti Teadusagentuur",
  ee_rtk: "Estonia Riigi Tugiteenuste Keskus",
  ee_kysk: "Estonia Kodanikuühiskonna Sihtkapital",
  lu_fnr: "Luxembourg FNR",
  is_island: "Iceland Ísland.is Styrkjatorg",
  ch_prohelvetia: "Switzerland Pro Helvetia",
  ch_innosuisse: "Switzerland Innosuisse",
  mt_xjenza: "Malta Xjenza Malta",
  cz_tacr: "Czechia TA ČR",
  cz_sfzp: "Czechia SFŽP",
  pt_pepac: "Portugal PEPAC Continente",
  pt_gulbenkian: "Portugal Fundação Calouste Gulbenkian",
  lt_apva: "Lithuania APVA",
  lt_cpva: "Lithuania CPVA",
  gr_agro: "Greece Agrotiki Anaptixi",
  ro_afir: "Romania AFIR",
  si_gov_objave: "Slovenia GOV.SI javne objave",
  si_aris: "Slovenia ARIS",
  si_podjetniski_sklad: "Slovenia Slovenski podjetniški sklad",
  si_evropska_sredstva: "Slovenia evropskasredstva.si",
  bg_isun: "Bulgaria ISUN 2020",
  hu_nkfih: "Hungary NKFIH",
  eu_eit: "EU EIT",
  uk_innovate: "UK Innovate UK",
  ie_hrb: "Ireland Health Research Board",
  nl_zonmw: "Netherlands ZonMw",
  nl_nwo: "Netherlands NWO",
  nl_gelderland: "Netherlands Provincie Gelderland",
  pl_ncbr: "Poland NCBR",
  pl_nfosigw: "Poland NFOŚiGW",
  pl_regional: "Poland regional EU programmes",
  fi_haeavustuksia: "Finland Haeavustuksia.fi",
  fi_aka: "Finland Research Council of Finland",
  fi_skr: "Finland Suomen Kulttuurirahasto",
  us_california: "US California Grants Portal",
  se_formas: "Sweden Formas",
  se_energimyndigheten: "Sweden Energimyndigheten",
  se_kulturradet: "Sweden Kulturrådet",
  se_forte: "Sweden Forte",
  dk_novo_nordisk: "Denmark Novo Nordisk Fonden",
  dk_carlsberg: "Denmark Carlsbergfondet",
  no_kulturdirektoratet: "Norway Kulturdirektoratet",
  no_regionale_forskningsfond: "Norway Regionale forskningsfond",
  it_piemonte: "Italy Regione Piemonte",
  it_lazio: "Italy Lazio Europa",
  it_toscana: "Italy Regione Toscana",
  it_con_il_sud: "Italy Fondazione Con il Sud",
  be_kbs: "Belgium King Baudouin Foundation",
  be_fnrs: "Belgium F.R.S.-FNRS",
  be_hub_brussels: "Belgium Brussels hub.brussels",
  sk_itms21: "Slovakia ITMS21+",
  sk_fpu: "Slovakia Fond na podporu umenia",
  hr_ekohezija: "Croatia eKohezija",
  hr_ruralnirazvoj: "Croatia Ruralni razvoj",
  lv_esfondi: "Latvia esfondi.lv",
  cy_funding_portal: "Cyprus Funding Programmes Portal",
  eu_eea_grants: "EEA and Norway Grants",
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
  it_incentivi: "National incentive schemes for businesses on Incentivi Italia (incentivitalia.gov.it)",
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
  uk_prs_foundation: "PRS Foundation funds for music creators, music organisations and industry professionals in the UK",
  uk_sussex_cf: "Sussex Community Foundation main grants rounds and additional funds for community groups and individuals in Sussex",
  uk_brighton_hove: "Brighton & Hove City Council Community Catalyst Fund for community and voluntary organisations",  fr_iledefrance: "Île-de-France regional council grants and calls for projects for associations, local authorities, companies, research bodies and residents",
  de_dsee: "Register of third-party funding programmes for non-profits and volunteering in Germany (foundations, Länder, federal bodies, lotteries), kept by the Deutsche Stiftung für Engagement und Ehrenamt",
  ee_etag: "Estonian Research Council application rounds: the agency's own research funding programmes and the joint calls it takes part in (Horizon Europe partnerships, NordForsk, bilateral schemes)",
  ee_rtk: "Estonian State Shared Service Centre application rounds: EU structural funds, recovery facility, modernisation fund and national programmes for municipalities, public bodies, companies and NGOs",
  ee_kysk: "National Foundation of Civil Society (KÜSK) grant rounds for Estonian NGOs and scholarships for community leaders, without the EU CERV calls it relays",
  lu_fnr: "Luxembourg National Research Fund funding instruments for researchers and research institutions (CORE, ATTRACT, PEARL, AFR, BRIDGES, INTER and others) with their current call deadlines",
  is_island: "Icelandic government grants portal: funds run by Rannís and other state agencies for research, innovation, education, culture, sport and environment, plus R&D tax deductions",
  ch_prohelvetia: "Swiss Arts Council funding formats for artists and cultural institutions in design, literature, music, performing and visual arts: creation, production, translation, residencies, mobility and promotion",
  ch_innosuisse: "Swiss Innovation Agency calls for projects: national calls (Flagship, Innovation Booster, Quantum) and international ones (Eureka, Eurostars, Innowwide, bilateral) for companies and research partners",
  mt_xjenza: "Xjenza Malta open research and innovation funding schemes: national programmes, vouchers, commercialisation support and the Maltese side of joint European and bilateral calls",
  cz_tacr: "Technology Agency of the Czech Republic public competitions and calls for applied research and innovation, including the national side of European partnerships (Eurostars, Water4All, DUT, M-ERA.NET)",
  cz_sfzp: "State Environmental Fund of the Czech Republic: currently offered calls of the National Programme Environment and of the Modernisation Fund",
  pt_pepac: "Calls of the CAP Strategic Plan rural development interventions for mainland Portugal: farm investment, young farmers, forestry, irrigation, restoration after fires and storms, advisory services",
  pt_gulbenkian: "Calouste Gulbenkian Foundation scholarships and grants to organisations in arts, science, education, sustainability, Armenian communities and Portuguese-speaking African countries",
  lt_apva: "Environmental Projects Management Agency calls in the APVIS system: building renovation, electric vehicles, climate change programme, modernisation fund, forestry and environmental compensation schemes for residents, companies and municipalities",
  lt_cpva: "Central Project Management Agency calls: state budget programmes, the Development Cooperation and Humanitarian Aid Fund, the cybersecurity programme and the Swiss-Lithuanian cooperation programme",
  gr_agro: "Calls of the Greek CAP Strategic Plan 2023-2027 interventions, including the LEADER calls of the local action groups, for farmers, companies, collective bodies and public bodies",
  ro_afir: "Agency for Financing Rural Investments open application sessions under the CAP Strategic Plan: farm investment, young farmers, small farms and sector-specific interventions",
  si_gov_objave: "Public funding calls of the Slovenian ministries and government bodies published on GOV.SI: public calls (javni razpisi) and public invitations (javni pozivi) with vouchers, grants, incentives and loan products",
  si_aris: "Slovenian Research and Innovation Agency calls: open and planned calls for research projects, international cooperation, mobility, ERC complementary schemes and innovation projects",
  si_podjetniski_sklad: "Slovene Enterprise Fund calls for small and medium-sized enterprises: vouchers, start-up grants, microloans, loans, guarantees and equity",
  si_evropska_sredstva: "Slovenian government portal of EU funds: current and announced calls under cohesion policy, Interreg, the fisheries programme, AMIF, LIFE and the CAP strategic plan",
  bg_isun: "Competitive grant procedures of the Bulgarian EU funds programmes 2021-2027 open for applications in the ISUN 2020 system (education, human resources, maritime and fisheries, environment, transport, rural development)",
  hu_nkfih: "Current domestic calls of the Hungarian National Research, Development and Innovation Office: NKFI Fund calls, Széchenyi Plan Plus capital programmes and other support",
  eu_eit: "European Institute of Innovation and Technology opportunities: open calls, prizes and programmes of the EIT and its Knowledge and Innovation Communities for startups, SMEs, universities and innovators",
  uk_innovate: "Innovate UK Innovation Funding Service competitions: grants, loans and SBRI contracts for UK businesses and research organisations, open or opening soon",
  ie_hrb: "Health Research Board funding schemes for health and social care research in Ireland, including the EU co-funded joint transnational calls the HRB takes part in",
  nl_zonmw: "ZonMw subsidy calls for health research and care innovation in the Netherlands, open or expected",
  nl_nwo: "Dutch Research Council (NWO) calls for proposals that are open, continuous, upcoming or in preparation, for researchers, research organisations and their public and private partners",
  nl_gelderland: "Province of Gelderland subsidy schemes for residents, businesses, foundations and public bodies in Gelderland",
  pl_ncbr: "National Centre for Research and Development competitions: national, EU-funded and international R&D calls for companies, research organisations and consortia",
  pl_nfosigw: "National Fund for Environmental Protection and Water Management schedule of calls: running and planned grant and loan calls for energy, air, water, waste, nature and climate adaptation",
  pl_regional: "Running and upcoming calls of the 2021-2027 regional EU programmes of five voivodeships (Małopolskie, Dolnośląskie, Pomorskie, Opolskie, Wielkopolskie)",
  fi_haeavustuksia: "National portal of Finnish government grant calls: running and upcoming calls of ministries, agencies and regional state authorities",
  fi_aka: "Research Council of Finland open and upcoming calls for research funding, including strategic research and international joint calls",
  fi_skr: "Finnish Cultural Foundation grant types for science and art, with the application period of each",
  us_california: "California state agency grant and loan opportunities that are active or forecasted on the California Grants Portal",
  se_formas: "Formas (Swedish research council for sustainable development) calls for proposals: research and innovation funding for universities, institutes, companies and public bodies, including joint European calls",
  se_energimyndigheten: "Swedish Energy Agency calls: research and innovation funding, business development programmes, competitions and other energy support for companies, researchers and public bodies",
  se_kulturradet: "Swedish Arts Council grants for literature, performing arts, music, visual arts, libraries, national minorities and regional culture, plus the Creative Europe calls it relays as the Swedish desk",
  se_forte: "Forte (Swedish Research Council for Health, Working Life and Welfare) calls for research funding in health, working life and welfare",
  dk_novo_nordisk: "Novo Nordisk Foundation open and upcoming calls: research grants, fellowships and investigator programmes in life science, health and natural science, plus science teaching prizes",
  dk_carlsberg: "Carlsberg Foundation grant instruments for basic research in natural sciences, social sciences and humanities: fellowships, Semper Ardens grants, research infrastructure, field trips, conferences and science communication",
  no_kulturdirektoratet: "Arts and Culture Norway grant schemes run for Kulturrådet, Fond for lyd og bilde, Statens kunstnerstipend and the ministry: project grants, literature purchasing schemes, artist stipends, museum and national minority programmes",
  no_regionale_forskningsfond: "The eleven Norwegian regional research funds: FORREGION pre-projects and regional research and innovation projects for companies, the public sector and research organisations in each county",
  it_piemonte: "Regione Piemonte grants and financing calls: open and pre-announced regional, state and EU-funded calls for companies, public bodies, third-sector organisations and citizens",
  it_lazio: "Lazio Europa (Regione Lazio) open and upcoming calls funded by EU, state and regional money for companies, professionals, public bodies, schools and citizens",
  it_toscana: "Regione Toscana open funding calls from the Bandi aperti page: grants, vouchers and incentives for companies, public bodies, third-sector organisations and citizens",
  it_con_il_sud: "Fondazione Con il Sud calls and permanent initiatives for third-sector organisations in southern Italy (Basilicata, Calabria, Campania, Puglia, Sardegna, Sicilia)",
  be_kbs: "King Baudouin Foundation open calls for projects, prizes and grants, including the funds it manages, for non-profits, researchers, individuals and local initiatives in Belgium and abroad",
  be_fnrs: "F.R.S.-FNRS research funding instruments that are upcoming, open or continuous: international joint calls, mobility and scientific exchange support for researchers in the Wallonia-Brussels Federation",
  be_hub_brussels: "hub.brussels directory of subsidies and financial aid for Brussels businesses: regional, federal, community and municipal premiums, financing, tax incentives and employment aid",
  sk_itms21: "Slovak EU funds 2021-2027 demand-driven calls (Programme Slovakia, Interreg and other programmes) from the ITMS21+ open data API, with eligibility conditions, assessment rounds and documents",
  sk_fpu: "Slovak Arts Council calls of the current programme year, one record per subprogramme in each call (grants and scholarships for arts, culture, festivals, heritage, libraries)",
  hr_ekohezija: "Croatian EU cohesion funds 2021-2027 calls for project proposals (programmes Konkurentnost i kohezija, Integrirani teritorijalni program, Učinkoviti ljudski potencijali), open and announced, without direct awards",
  hr_ruralnirazvoj: "Croatian CAP Strategic Plan 2023-2027 calls (rural development and agricultural sector interventions) published by the Ministry of Agriculture",
  lv_esfondi: "Latvian EU funds project selections from the Pieejamais atbalsts register (cohesion programme 2021-2027, Recovery Fund, rural and fisheries measures, Interreg calls), announced and planned",
  cy_funding_portal: "Cyprus national grant schemes, EU co-financed programmes, Recovery and Resilience Plan, financial instruments and EEA and Norway Grants calls from the government funding portal, without the EU competitive programmes",
  eu_eea_grants: "Open calls for proposals of the EEA and Norway Grants in the beneficiary states (programme calls, civil society funds, bilateral initiatives), with country set to the beneficiary state",
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
