import { z } from "zod";

// One record = one funding opportunity (a call, a topic, a scheme), as published by its source.
// Arrays are stored as JSON text in D1. Dates are ISO 8601 strings in UTC.

export const SourceId = z.enum(["eu_ft", "es_bdns", "fr_aides_entreprises", "us_grants_gov", "nl_rvo", "lt_esinvesticijos", "uk_find_a_grant", "it_incentivi", "se_vinnova", "fi_eura", "no_forskningsradet", "dk_tilskudspuljer", "at_ffg", "pt_portugal2030", "de_foerderinfo", "cz_dotaceeu", "gr_espa", "ie_enterprise_ireland", "ro_mfe", "pl_harmonogram", "be_1890", "be_innoviris", "be_vlaio", "at_aws", "at_fwf", "be_belspo", "dk_dff", "dk_innovationsfonden", "dk_kunstfond", "de_dfg", "ie_enterprise_hub", "ie_research_ireland", "no_innovasjonnorge", "no_tilskudd", "pt_fct", "pt_fundo_ambiental", "lt_inovacijuagentura", "uk_prs_foundation", "uk_sussex_cf", "uk_brighton_hove", "sk_itms21", "sk_fpu", "hr_ekohezija", "hr_ruralnirazvoj", "lv_esfondi", "cy_funding_portal", "eu_eea_grants", "si_gov_objave", "si_aris", "si_podjetniski_sklad", "si_evropska_sredstva", "bg_isun", "hu_nkfih", "eu_eit", "ee_etag", "ee_rtk", "ee_kysk", "lu_fnr", "is_island", "ch_prohelvetia", "ch_innosuisse", "mt_xjenza", "pl_ncbr", "pl_nfosigw", "pl_regional", "fi_haeavustuksia", "fi_aka", "fi_skr", "us_california", "fr_iledefrance", "de_dsee", "uk_innovate", "ie_hrb", "nl_zonmw", "nl_nwo", "nl_gelderland", "se_formas", "se_energimyndigheten", "se_kulturradet", "se_forte", "dk_novo_nordisk", "dk_carlsberg", "no_kulturdirektoratet", "no_regionale_forskningsfond", "it_piemonte", "it_lazio", "it_toscana", "it_con_il_sud", "be_kbs", "be_fnrs", "be_hub_brussels", "cz_tacr", "cz_sfzp", "pt_pepac", "pt_gulbenkian", "lt_apva", "lt_cpva", "gr_agro", "ro_afir"]);
export type SourceId = z.infer<typeof SourceId>;

export const FunderLevel = z.enum(["supranational", "national", "regional", "local", "unknown"]);
export const FundingType = z.enum([
  "grant",
  "loan",
  "guarantee",
  "tax_credit",
  "voucher",
  "equity",
  "prize",
  "procurement",
  "other",
]);
export const BeneficiaryType = z.enum([
  "company",
  "sme",
  "startup",
  "individual",
  "research_org",
  "public_body",
  "ngo",
  "other",
]);
export const GrantStatus = z.enum(["forthcoming", "open", "closed", "unknown"]);

export const Document = z.object({
  title: z.string(),
  url: z.string().url(),
});

export const GrantSchema = z.object({
  // `${source}:${source_id}`
  id: z.string().min(3),
  source: SourceId,
  source_id: z.string().min(1),
  // Official page for this opportunity. Every record must point at the publisher.
  source_url: z.string().url(),
  source_license: z.string(),

  title: z.string().min(1),
  // BCP 47 language of title and summary as published.
  title_lang: z.string().min(2).max(8),
  summary: z.string().nullable(),

  funder_name: z.string().nullable(),
  funder_level: FunderLevel,
  // ISO 3166-1 alpha-2, or "EU" for EU-wide, or "XX" when not stated.
  country: z.string().length(2),
  // NUTS codes when known, else free text from the source.
  regions: z.array(z.string()),

  funding_types: z.array(FundingType),
  beneficiary_types: z.array(BeneficiaryType),
  // Whether one legal entity can apply alone, when the source states it (a Horizon RIA needs three partners,
  // an EIC Accelerator takes one company). Missing when the source does not say; enrichment fills the gap.
  consortium: z.enum(["required", "single"]).nullable().optional(),
  // NACE / CNAE codes when known, else free text from the source.
  sectors: z.array(z.string()),

  amount_min: z.number().nullable(),
  amount_max: z.number().nullable(),
  budget_total: z.number().nullable(),
  currency: z.string().length(3).nullable(),

  status: GrantStatus,
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),

  documents: z.array(Document),
  // Last modification time as reported by the source, if any.
  source_updated_at: z.string().nullable(),
});

export type Grant = z.infer<typeof GrantSchema>;
