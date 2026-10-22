import { z } from "zod";

// The confirmed company profile ("passport"). Every field is a closed list or a code, so matching is deterministic.
export const ProfileForm = z.object({
  company_name: z.string().trim().max(200).default(""),
  // ISO alpha-2, or "EU" for "anywhere in Europe": screens EU-wide programmes plus every national call in the ledger.
  country: z.string().regex(/^[A-Z]{2}$/),
  region: z.string().trim().max(20).default(""), // NUTS code (ES30, FRK2, LT02) or empty = anywhere in the country
  entity_type: z.enum(["company", "sme", "startup", "individual", "research_org", "public_body", "ngo", "other"]),
  headcount: z.enum(["1", "2to9", "10to49", "50to249", "250plus", "unknown"]).default("unknown"),
  size: z.enum(["micro", "small", "medium", "large", "unknown"]).default("unknown"),
  founded_year: z.number().int().min(1800).max(2100).nullable().default(null),
  company_age: z.enum(["lt1", "1to3", "3to10", "gt10", "unknown"]).default("unknown"),
  revenue: z.enum(["none", "lt100k", "100kto1m", "1mto10m", "gt10m", "unknown"]).default("unknown"),
  stage: z.enum(["idea", "pre_seed", "seed", "growth", "established", "unknown"]).default("unknown"),
  trl: z.number().int().min(1).max(9).nullable().default(null),
  ip_status: z.enum(["none", "pending", "granted", "unknown"]).default("unknown"),
  prior_funding: z.enum(["none", "national", "eu", "both", "unknown"]).default("unknown"),
  partners: z.enum(["none", "identified", "signed", "unknown"]).default("unknown"),
  sectors: z.array(z.string().regex(/^\d{2}$/)).max(5).default([]), // NACE divisions
  funding_types: z.array(z.enum(["grant", "loan", "guarantee", "tax_credit", "voucher", "equity", "prize", "procurement"])).default([]),
  keywords: z.array(z.string().trim().min(2).max(60)).max(15).default([]),
  consortium_ok: z.boolean().default(false),
});
export type ProfileForm = z.infer<typeof ProfileForm>;

const SIZE_FROM_HEADCOUNT: Record<ProfileForm["headcount"], ProfileForm["size"]> = {
  "1": "micro",
  "2to9": "micro",
  "10to49": "small",
  "50to249": "medium",
  "250plus": "large",
  unknown: "unknown",
};

function ageFromYear(year: number | null): ProfileForm["company_age"] {
  if (!year) return "unknown";
  const age = new Date().getUTCFullYear() - year;
  return age < 1 ? "lt1" : age < 3 ? "1to3" : age < 10 ? "3to10" : "gt10";
}

export function parseProfileForm(form: FormData): ProfileForm {
  const list = (name: string) => form.getAll(name).map(String).map((s) => s.trim()).filter(Boolean);
  const str = (name: string, fallback = "") => String(form.get(name) ?? fallback).trim();
  const intOrNull = (name: string) => {
    const n = Number(str(name));
    return str(name) && Number.isFinite(n) ? Math.round(n) : null;
  };
  const headcount = (str("headcount") || "unknown") as ProfileForm["headcount"];
  const foundedYear = intOrNull("founded_year");
  const raw = {
    company_name: str("company_name"),
    country: str("country").toUpperCase(),
    region: str("region").toUpperCase(),
    entity_type: str("entity_type", "company"),
    headcount,
    size: SIZE_FROM_HEADCOUNT[headcount] ?? "unknown",
    founded_year: foundedYear,
    company_age: foundedYear ? ageFromYear(foundedYear) : str("company_age", "unknown"),
    revenue: str("revenue", "unknown"),
    stage: str("stage", "unknown"),
    trl: intOrNull("trl"),
    ip_status: str("ip_status", "unknown"),
    prior_funding: str("prior_funding", "unknown"),
    partners: str("partners", "unknown"),
    sectors: list("sectors"),
    funding_types: list("funding_types"),
    keywords: str("keywords")
      .split(/[,\n;]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .slice(0, 15),
    consortium_ok: form.get("consortium_ok") === "on" || ["identified", "signed"].includes(str("partners")),
  };
  return ProfileForm.parse(raw);
}
