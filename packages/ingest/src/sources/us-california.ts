import type { Grant } from "@grantledger/schema";
import { num, parseCsv, stripHtml } from "../util";
import type { Page, Source } from "./types";

// United States, California Grants Portal (grants.ca.gov): every grant and loan opportunity of the state agencies,
// published as open data on data.ca.gov (dataset "california-grants-portal", public domain). robots.txt of
// data.ca.gov disallows /api/, so the CKAN datastore API is not used: the resource is read through its CSV download
// under /dataset/ (one request, about 7 MB, 2,000 rows) and only the rows with status active or forecasted are kept
// (about 160). OpenDate and LastUpdated are UTC; ApplicationDeadline is the Pacific wall-clock time the portal shows
// ("Ongoing" for rolling opportunities). The portal page of an opportunity is its WordPress short link (?p=PortalID).
// Contact details are left out.
const CSV_URL = "https://data.ca.gov/dataset/e1b1c799-cdd4-4219-af6d-93b79747fffb/resource/111c8c88-21f6-453c-ae2c-b4785a0624f5/download/california-grants-portal-data.csv";
const PORTAL = "https://www.grants.ca.gov";
const LICENSE = "Public domain (California Grants Portal open data, data.ca.gov)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

type Row = Record<string, string>;

const APPLICANTS: Record<string, Grant["beneficiary_types"][number]> = {
  business: "company",
  individual: "individual",
  nonprofit: "ngo",
  "public agency": "public_body",
  "tribal government": "public_body",
  "other legal entity": "other",
};

// Text cells mark the former line breaks with two spaces and use no-break spaces inside lines.
function plain(s: string | undefined): string {
  return stripHtml((s ?? "").replace(/ {2,}/g, "\n")).replace(/[\u00a0\u202f\u200b]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

// A Pacific wall-clock time as ISO in UTC. California is UTC-7 from the second Sunday of March to the first Sunday of
// November, else UTC-8.
function pacificIso(value: string): string | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const firstSunday = (mo: number) => 1 + ((7 - new Date(Date.UTC(year, mo, 1)).getUTCDay()) % 7);
  const summer = (month > 2 && month < 10) || (month === 2 && day >= firstSunday(2) + 7) || (month === 10 && day < firstSunday(10));
  return new Date(Date.UTC(year, month, day, Number(m[4]) + (summer ? 7 : 8), Number(m[5]))).toISOString();
}

// "2026-11-12 17:00:00" in UTC.
function utcIso(value: string): string | null {
  const m = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}.000Z` : null;
}

const dollars = (s: string | undefined) => num((s ?? "").replace(/,/g, ""));

function normalize(r: Row): Grant {
  const opens = utcIso(r.OpenDate ?? "");
  const closes = pacificIso(r.ApplicationDeadline ?? "");
  const now = new Date().toISOString();
  const status: Grant["status"] = r.Status === "closed" || (closes && closes < now) ? "closed" : r.Status === "forecasted" || (opens && opens > now) ? "forthcoming" : r.Status === "active" ? "open" : "unknown";
  // "$2,000,000.00", "Between $500,000.00 and $1,000,000.00" or a sentence saying that it depends.
  const amounts = [...(r.EstAmounts ?? "").matchAll(/\$([\d,]+(?:\.\d+)?)/g)].map((m) => dollars(m[1]));
  const line = (label: string, value: string | undefined, notes?: string) => {
    const text = [plain(value), plain(notes)].filter(Boolean).join(". ");
    return text ? (text.includes("\n") ? `${label}:\n${text}` : `${label}: ${text}`) : "";
  };
  const summary = [
    line("Purpose", r.Purpose),
    line("Description", r.Description),
    line("Eligible applicants", r.ApplicantType, r.ApplicantTypeNotes),
    line("Geography", r.Geography),
    [
      line("Opportunity type", r.Type),
      line("Categories", r.Categories),
      line("Letter of intent required", r.LOI),
      line("Funding source", r.FundingSource, r.FundingSourceNotes),
      line("Matching funds", r.MatchingFunds, r.MatchingFundsNotes),
      line("Total estimated available funding", r.EstAvailFunds),
      line("Expected number of awards", r.EstAwards),
      line("Estimated amount per award", r.EstAmounts),
      line("Funding method", r.FundingMethod, r.FundingMethodNotes),
      line("Open date (UTC)", r.OpenDate),
      line("Application deadline (Pacific time)", r.ApplicationDeadline),
      line("Period of performance", r.AwardPeriod),
      line("Expected award announcement", r.ExpAwardDate),
      // "url: https://...; email: ...;": the separators go, a ";" right after a URL would read as an HTML entity.
      line("How to apply", (r.ElecSubmission ?? "").replace(/;(?=\s|$)/g, "")),
      line("Grant page", r.GrantURL),
      line("Agency page", r.AgencyURL),
      line("Events", r.GrantEventsURL),
    ].filter(Boolean).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  const split = (s: string | undefined) => (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);
  const id = r.PortalID as string;
  return {
    id: `us_california:${id}`,
    source: "us_california",
    source_id: id,
    source_url: `${PORTAL}/?p=${id}`,
    source_license: LICENSE,
    title: plain(r.Title).replace(/\n/g, " "),
    title_lang: "en",
    summary: summary || null,
    funder_name: plain(r.AgencyDept) || null,
    funder_level: "regional",
    country: "US",
    regions: ["US-CA"],
    funding_types: [...new Set(split(r.Type).map((t): Grant["funding_types"][number] => (/loan/i.test(t) ? "loan" : /grant/i.test(t) ? "grant" : "other")))].sort(),
    beneficiary_types: [...new Set(split(r.ApplicantType).map((t) => APPLICANTS[t.toLowerCase()] ?? "other"))].sort(),
    sectors: split(r.Categories),
    amount_min: amounts.length === 2 ? (amounts[0] ?? null) : null,
    amount_max: amounts.at(-1) ?? null,
    budget_total: dollars(r.EstAvailFunds),
    currency: "USD",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: utcIso(r.LastUpdated ?? ""),
  };
}

export const usCalifornia: Source = {
  id: "us_california",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(): Promise<Page> {
    const res = await fetch(CSV_URL, { headers: UA, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for the California Grants Portal CSV`);
    const table = parseCsv((await res.text()).replace(/^\ufeff/, ""));
    const header = table[0] ?? [];
    if (!header.includes("PortalID") || !header.includes("Status") || table.length < 2) throw new Error("California Grants Portal CSV has no rows or a changed header");
    const rows = table
      .slice(1)
      .map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])) as Row)
      .filter((r) => r.PortalID && r.Title && (r.Status === "active" || r.Status === "forecasted"));
    const grants = rows.map(normalize);
    return {
      grants,
      // Contact names, emails and phone numbers are not archived.
      raws: rows.map((r) => ({ source_id: r.PortalID as string, payload: { ...r, ContactInfo: undefined } })),
      next: null,
    };
  },
};
