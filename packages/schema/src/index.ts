import { z } from "zod";

// One record = one funding opportunity (a call, a topic, a scheme), as published by its source.
// Arrays are stored as JSON text in D1. Dates are ISO 8601 strings in UTC.

export const SourceId = z.enum(["eu_ft", "es_bdns", "fr_aides_entreprises", "us_grants_gov", "nl_rvo", "lt_esinvesticijos", "uk_find_a_grant", "it_incentivi", "se_vinnova", "fi_eura", "no_forskningsradet", "dk_tilskudspuljer", "at_ffg", "pt_portugal2030", "de_foerderinfo", "cz_dotaceeu", "gr_espa", "ie_enterprise_ireland", "ro_mfe", "pl_harmonogram", "be_1890", "be_innoviris", "be_vlaio", "at_aws", "at_fwf", "be_belspo", "dk_dff", "dk_innovationsfonden", "dk_kunstfond", "de_dfg", "ie_enterprise_hub", "ie_research_ireland", "no_innovasjonnorge", "no_tilskudd", "pt_fct", "pt_fundo_ambiental", "lt_inovacijuagentura"]);
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
