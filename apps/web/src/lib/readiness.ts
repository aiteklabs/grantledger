import type { GrantView } from "./db";
import type { ProfileForm } from "./profile-form";
import type { RuleResult } from "./match";

// Readiness gaps and negative memos, all rule based. A "family" is a programme type with a known submission
// checklist. Hours are rough founder-time estimates for a first-time applicant; they exist to make the cost of a
// wrong route visible, not to be precise.
export type Bucket = "documents" | "evidence" | "compliance" | "partners" | "narrative";
export type GapState = "missing" | "check" | "ok";
export interface Gap { bucket: Bucket; text: string; hours: number; state: GapState }

export type Family = "horizon" | "eic_accelerator" | "digital_europe" | "life" | "erasmus" | "europeaid" | "cef" | "eu_other" | "es_bdns" | "fr_aides" | "nl_rvo" | "lt_esif" | "us_federal" | "other";

export const FAMILY_LABEL: Record<Family, string> = {
  horizon: "Horizon Europe collaborative call",
  eic_accelerator: "EIC Accelerator",
  digital_europe: "Digital Europe Programme",
  life: "LIFE Programme",
  erasmus: "Erasmus+",
  europeaid: "EU external action (EuropeAid)",
  cef: "Connecting Europe Facility",
  eu_other: "EU programme",
  es_bdns: "Spanish public aid (BDNS)",
  fr_aides: "French public aid",
  nl_rvo: "Dutch RVO scheme",
  lt_esif: "Lithuanian EU funds call",
  us_federal: "US federal grant",
  other: "Public funding call",
};

// Typical effort for a full first application, in hours.
export const APPLICATION_HOURS: Record<Family, number> = {
  horizon: 250,
  eic_accelerator: 160,
  digital_europe: 200,
  life: 180,
  erasmus: 120,
  europeaid: 200,
  cef: 220,
  eu_other: 150,
  es_bdns: 40,
  fr_aides: 35,
  nl_rvo: 30,
  lt_esif: 60,
  us_federal: 120,
  other: 50,
};

export const HOURLY_EUR = 60;

export function familyOf(g: GrantView): Family {
  const id = g.source_id.toUpperCase();
  if (g.source === "eu_ft") {
    if (id.includes("EIC") && /ACCELERATOR/.test(id + (g.summary ?? "").toUpperCase().slice(0, 400))) return "eic_accelerator";
    if (id.startsWith("HORIZON")) return "horizon";
    if (id.startsWith("DIGITAL")) return "digital_europe";
    if (id.startsWith("LIFE")) return "life";
    if (id.startsWith("ERASMUS")) return "erasmus";
    if (id.startsWith("CEF")) return "cef";
    if (id.startsWith("EUROPEAID")) return "europeaid";
    return "eu_other";
  }
  if (g.source === "es_bdns") return "es_bdns";
  if (g.source === "fr_aides_entreprises") return "fr_aides";
  if (g.source === "nl_rvo") return "nl_rvo";
  if (g.source === "lt_esinvesticijos") return "lt_esif";
  if (g.source === "us_grants_gov") return "us_federal";
  return "other";
}

const has = (text: string | null, re: RegExp) => !!text && re.test(text);

export function readinessGaps(g: GrantView, form: ProfileForm, rules: RuleResult[]): Gap[] {
  const fam = familyOf(g);
  const gaps: Gap[] = [];
  const consortiumRule = rules.find((r) => r.rule === "consortium");
  // EIC calls (Accelerator, STEP Scale Up, Transition) are single-applicant; every other Horizon call is collaborative.
  // The matcher's consortium rule is the structured answer; the call family and the text are the fallback.
  const singleApplicant = consortiumRule?.text.startsWith("Single applicant") || (g.source === "eu_ft" && /-EIC-|EIC-/.test(g.source_id.toUpperCase()));
  const needsConsortium = !singleApplicant && (consortiumRule?.text.startsWith("Requires a consortium") || fam === "horizon" || fam === "digital_europe" || fam === "life" || fam === "cef" || has(g.summary, /consortium|at least (two|three|3|2) (independent )?(legal entities|partners)/i));
  const partnerState: GapState = form.partners === "signed" ? "ok" : form.partners === "identified" ? "check" : form.partners === "none" ? "missing" : "check";

  // Common to every public grant in Europe: registry extract and last accounts.
  const isEu = ["horizon", "eic_accelerator", "digital_europe", "life", "erasmus", "europeaid", "cef", "eu_other"].includes(fam);
  if (fam !== "us_federal") {
    gaps.push({ bucket: "documents", text: "Company registry extract, less than 3 months old", hours: 1, state: form.founded_year ? "ok" : "check" });
    gaps.push({ bucket: "documents", text: "Last annual accounts or financial statements", hours: 2, state: form.revenue === "none" && form.company_age === "lt1" ? "missing" : form.revenue === "unknown" ? "check" : "ok" });
  }

  if (isEu) {
    gaps.push({ bucket: "documents", text: "Participant Identification Code (PIC) on the Funding & Tenders Portal, with validated legal entity", hours: 3, state: form.prior_funding === "eu" || form.prior_funding === "both" ? "ok" : "missing" });
    gaps.push({ bucket: "compliance", text: "Financial capacity self-check (for coordinators, formal financial viability check)", hours: 2, state: form.revenue === "none" ? "check" : "ok" });
    if (fam !== "eic_accelerator") gaps.push({ bucket: "compliance", text: "Ethics self-assessment in the proposal template", hours: 3, state: "check" });
    if (form.entity_type === "research_org" || form.entity_type === "public_body") gaps.push({ bucket: "compliance", text: "Gender Equality Plan (required for public bodies, research organisations and higher education)", hours: 20, state: "check" });
  }

  if (needsConsortium && fam !== "eic_accelerator") {
    gaps.push({ bucket: "partners", text: "Consortium of at least three independent legal entities from three different eligible countries (standard Horizon rule; check the call)", hours: 40, state: partnerState });
    gaps.push({ bucket: "partners", text: "Letters of intent or MoU from each partner, plus a coordinator", hours: 12, state: form.partners === "signed" ? "ok" : "missing" });
  }

  if (fam === "eic_accelerator") {
    gaps.push({ bucket: "documents", text: "SME status declaration (EU definition: under 250 staff and under €50M turnover)", hours: 1, state: ["micro", "small", "medium"].includes(form.size) ? "ok" : form.size === "large" ? "missing" : "check" });
    gaps.push({ bucket: "evidence", text: "TRL 5 or 6 reached: prototype validated in a relevant environment", hours: 0, state: form.trl === null ? "check" : form.trl >= 5 ? "ok" : "missing" });
    gaps.push({ bucket: "evidence", text: "IP position: patent filed or freedom-to-operate reasoning", hours: 10, state: form.ip_status === "none" ? "missing" : form.ip_status === "unknown" ? "check" : "ok" });
    gaps.push({ bucket: "narrative", text: "Short application: pitch deck (10 slides), 3-minute video, AI-guided form", hours: 30, state: "missing" });
    gaps.push({ bucket: "narrative", text: "Full application: business plan, financials for 5 years, team, market, go-to-market", hours: 90, state: "missing" });
  } else if (isEu) {
    gaps.push({ bucket: "narrative", text: "Proposal part B: excellence, impact, implementation, against the call's expected outcomes", hours: fam === "erasmus" ? 40 : 80, state: "missing" });
    gaps.push({ bucket: "evidence", text: "Prior results, publications or pilots that back the claimed starting TRL", hours: 6, state: form.trl === null ? "check" : "ok" });
  }

  if (fam === "es_bdns") {
    gaps.push({ bucket: "documents", text: "Certificados de estar al corriente con AEAT y Seguridad Social", hours: 1, state: "check" });
    gaps.push({ bucket: "compliance", text: "Declaración responsable de ayudas de minimis recibidas (3 años)", hours: 1, state: form.prior_funding === "none" ? "ok" : "check" });
    gaps.push({ bucket: "documents", text: "Certificado digital de representante legal for the sede electrónica", hours: 2, state: "check" });
    gaps.push({ bucket: "narrative", text: "Memoria técnica y presupuesto según el anexo de la convocatoria", hours: 20, state: "missing" });
  }
  if (fam === "fr_aides") {
    gaps.push({ bucket: "documents", text: "Extrait Kbis de moins de 3 mois et RIB", hours: 1, state: "check" });
    gaps.push({ bucket: "documents", text: "Liasses fiscales des 2 derniers exercices", hours: 1, state: form.company_age === "lt1" ? "missing" : "check" });
    gaps.push({ bucket: "compliance", text: "Attestation de régularité fiscale et sociale, déclaration de minimis", hours: 1, state: "check" });
    gaps.push({ bucket: "narrative", text: "Dossier de présentation du projet et budget prévisionnel", hours: 16, state: "missing" });
  }
  if (fam === "nl_rvo") {
    gaps.push({ bucket: "documents", text: "KVK-uittreksel and eHerkenning level 3 for the RVO portal", hours: 3, state: "check" });
    gaps.push({ bucket: "compliance", text: "De-minimisverklaring (state aid received in the last 3 years)", hours: 1, state: form.prior_funding === "none" ? "ok" : "check" });
    gaps.push({ bucket: "narrative", text: "Projectplan en begroting according to the scheme's format", hours: 16, state: "missing" });
  }
  if (fam === "lt_esif") {
    gaps.push({ bucket: "documents", text: "Account on the Data Exchange Site (DMS) at dms.investis.lt and e-signature", hours: 3, state: "check" });
    gaps.push({ bucket: "compliance", text: "De minimis declaration and SME status declaration", hours: 1, state: "check" });
    gaps.push({ bucket: "narrative", text: "Project implementation plan (PĮP) with budget and indicators", hours: 30, state: "missing" });
  }
  if (fam === "us_federal") {
    gaps.push({ bucket: "documents", text: "SAM.gov registration with UEI (allow 2 to 4 weeks) and Grants.gov workspace", hours: 8, state: form.prior_funding === "none" ? "missing" : "check" });
    gaps.push({ bucket: "documents", text: "Budget narrative (SF-424A) and indirect cost rate or de minimis 15%", hours: 10, state: "missing" });
    gaps.push({ bucket: "narrative", text: "Project narrative against the NOFO evaluation criteria", hours: 60, state: "missing" });
    gaps.push({ bucket: "compliance", text: "Certifications and assurances (SF-424B), human subjects if applicable", hours: 3, state: "check" });
  }
  if (fam === "other") {
    gaps.push({ bucket: "narrative", text: "Project description and budget in the funder's format", hours: 20, state: "missing" });
  }
  return gaps;
}

export function gapHours(gaps: Gap[]): number {
  return gaps.filter((x) => x.state !== "ok").reduce((n, x) => n + x.hours, 0);
}

export interface Memo {
  looked_like_fit: string[];
  disqualifiers: string[];
  wasted_hours: number;
  wasted_eur: number;
  alternatives: { kind: "later_cutoff" | "same_goal" | "build_partners"; text: string; grant_id?: string }[];
}

export function negativeMemo(g: GrantView, rules: RuleResult[], alternatives: { later?: GrantView; sameGoal?: GrantView }, form: ProfileForm): Memo {
  const fam = familyOf(g);
  const hours = APPLICATION_HOURS[fam];
  const disq = rules.filter((r) => r.state === "mismatch").map((r) => r.text);
  const unknown = rules.filter((r) => r.state === "unknown" && r.rule !== "relevance").map((r) => r.text);
  const alts: Memo["alternatives"] = [];
  if (alternatives.later) alts.push({ kind: "later_cutoff", text: `Same programme family, later cut-off: ${alternatives.later.title}`, grant_id: alternatives.later.id });
  if (alternatives.sameGoal) alts.push({ kind: "same_goal", text: `Same goal, different programme: ${alternatives.sameGoal.title}`, grant_id: alternatives.sameGoal.id });
  if (rules.some((r) => r.rule === "consortium" && r.state === "mismatch") || (form.partners === "none" && ["horizon", "digital_europe", "life", "cef"].includes(fam))) {
    alts.push({ kind: "build_partners", text: "Build the partner network first: two to three partners in other eligible countries, letters of intent, then reapply at the next cut-off." });
  }
  return {
    looked_like_fit: rules.filter((r) => r.state === "match").map((r) => r.text),
    disqualifiers: disq.length ? disq : unknown,
    wasted_hours: hours,
    wasted_eur: hours * HOURLY_EUR,
    alternatives: alts,
  };
}
