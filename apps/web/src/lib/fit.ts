import { decodeHTML } from "entities";
import { generateJson, type ContentItem, type GeminiEnv } from "./gemini";

// AI prefill: turns a website, a PDF or a paragraph into a draft ProfileForm. The user confirms before matching.
export interface CompanyProfile {
  company_name: string;
  country: string;
  region: string;
  description: string;
  entity_type: "company" | "sme" | "startup" | "individual" | "research_org" | "public_body" | "ngo" | "other";
  size: "micro" | "small" | "medium" | "large" | "unknown";
  company_age: "lt1" | "1to3" | "3to10" | "gt10" | "unknown";
  headcount: "1" | "2to9" | "10to49" | "50to249" | "250plus" | "unknown";
  founded_year: number | null;
  revenue: "none" | "lt100k" | "100kto1m" | "1mto10m" | "gt10m" | "unknown";
  stage: "idea" | "pre_seed" | "seed" | "growth" | "established" | "unknown";
  trl: number | null;
  ip_status: "none" | "pending" | "granted" | "unknown";
  prior_funding: "none" | "national" | "eu" | "both" | "unknown";
  partners: "none" | "identified" | "signed" | "unknown";
  nace_codes: string[];
  keywords: string[];
  funding_needs: string[];
  confidence: "low" | "medium" | "high";
  notes: string;
}

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    company_name: { type: "string" },
    country: { type: "string", description: "ISO 3166-1 alpha-2 of the legal seat, XX if unknown" },
    region: { type: "string", description: "NUTS-2 code of the seat if inferable (ES30, FRK2, ...), else empty" },
    description: { type: "string", description: "Two sentences: what the company does and for whom" },
    entity_type: { type: "string", enum: ["company", "sme", "startup", "individual", "research_org", "public_body", "ngo", "other"] },
    size: { type: "string", enum: ["micro", "small", "medium", "large", "unknown"], description: "EU definition: micro <10 staff, small <50, medium <250" },
    company_age: { type: "string", enum: ["lt1", "1to3", "3to10", "gt10", "unknown"] },
    headcount: { type: "string", enum: ["1", "2to9", "10to49", "50to249", "250plus", "unknown"] },
    founded_year: { type: "integer", nullable: true },
    revenue: { type: "string", enum: ["none", "lt100k", "100kto1m", "1mto10m", "gt10m", "unknown"], description: "Annual revenue band in EUR" },
    stage: { type: "string", enum: ["idea", "pre_seed", "seed", "growth", "established", "unknown"] },
    trl: { type: "integer", nullable: true, description: "Technology readiness level 1-9 when inferable, else null" },
    ip_status: { type: "string", enum: ["none", "pending", "granted", "unknown"], description: "Patents or registered IP" },
    prior_funding: { type: "string", enum: ["none", "national", "eu", "both", "unknown"], description: "Public grants already received" },
    partners: { type: "string", enum: ["none", "identified", "signed", "unknown"], description: "Consortium partners for collaborative calls" },
    nace_codes: { type: "array", items: { type: "string" }, description: "Up to 3 NACE Rev. 2 divisions, 2 digits each, for the company's own activity (a software vendor selling to schools is 62, not 85)" },
    keywords: { type: "array", items: { type: "string" }, description: "10 to 14 search phrases of 1 to 3 words, in English plus the local language. Half name the product and technology precisely (for example: voice roleplay, conversational AI, speech recognition). Half are the funding topics a public call would use for this company's work (for example: artificial intelligence, digital skills, vocational training, e-learning, SME digitalisation). Never a generic word alone such as training, platform, solution, team, innovation" },
    funding_needs: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string", description: "What is unclear or missing" },
  },
  required: ["company_name", "country", "region", "description", "entity_type", "size", "company_age", "headcount", "founded_year", "revenue", "stage", "trl", "ip_status", "prior_funding", "partners", "nace_codes", "keywords", "funding_needs", "confidence", "notes"],
};

const PROFILE_SYSTEM = `You fill a company profile form for public funding screening, from the material provided only.
Never invent facts. Unknown means "unknown", "XX" or empty. Country is the legal seat. NACE divisions must be 2-digit codes.
Keywords are used for full-text search over funding calls: name the technology and the funding topics, not marketing claims.`;

export function stripHtml(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h\d|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = decodeHTML(out);
    if (next === out) break;
    out = next;
  }
  return out.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

export async function fetchSiteText(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, { headers: { "user-agent": "grantledger-fitcheck/0.1 (+https://grantledger.eu)", accept: "text/html,*/*" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}`);
  const html = await res.text();
  const title = stripHtml(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? url);
  const text = stripHtml(html).slice(0, 60_000);
  if (text.length < 200) throw new Error("The page has too little readable text. Try another page or describe the company.");
  return { title, text };
}

export async function extractProfile(env: GeminiEnv, input: ContentItem[]) {
  return generateJson<CompanyProfile>(env, { system: PROFILE_SYSTEM, input, schema: PROFILE_SCHEMA, thinking: "low" });
}
