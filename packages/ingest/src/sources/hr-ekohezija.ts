import type { Grant } from "@grantledger/schema";
import { fetchJson, mapLimit, num, toIso } from "../util";
import type { Page, Source } from "./types";

// Croatia, eKohezija (the information system for EU cohesion funds 2021-2027): calls for project proposals of the
// programmes Konkurentnost i kohezija (PK), Integrirani teritorijalni program (IP) and Učinkoviti ljudski potencijali
// (SF). The official list at eufondovi.gov.hr/pozivi/ is a small app over this public JSON API:
// GET /MISPublicApi/poziv/browse/?status=<status>&top=&skip= returns {TotalCount, Records} with the summary text,
// dates and amounts; GET /MISPublicApi/poziv/{ID} adds the documents. Statuses are "Otvoren" (published, which
// includes calls whose application window has not started yet), "U najavi" (announced) and "Završen" (finished,
// not read). Direct awards ("Izravna dodjela", most of the open list) are dropped: the beneficiary is named in
// advance. Dates are Croatian local times printed with a Z suffix (deadlines like 23:59:59Z) and are kept as printed.
const API = "https://ekohezija.gov.hr/MISPublicApi/poziv";
const LICENSE = "eKohezija public call data (Ministarstvo regionalnoga razvoja i fondova Europske unije)";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "application/json" };
const STATUSES = ["Otvoren", "U najavi"] as const;
const TOP = 20;
const MAX_DOCUMENTS = 40;

interface Cursor { status: (typeof STATUSES)[number]; skip: number }
interface Doc { Naslov?: string | null; FileName?: string | null; DocumentVersionID?: string | null }

interface Row {
  ID: string;
  Naziv: string;
  Oznaka?: string | null;
  VrstaPostupkaDodjeleNaziv?: string | null;
  NadleznoTijeloNaziv?: string | null;
  DatumObjavePoziva?: string | null;
  DatumPocetkaZaprimanjaProjektnihPrijava?: string | null;
  RokZaPodnosenjeProjektnihPrijava?: string | null;
  InvesticijskiFondNaziv?: string | null;
  OperativniProgramNaziv?: string | null;
  CiljPoziva?: string | null;
  Predmet?: string | null;
  Status?: string | null;
  UkupnaBespovratnaSredstva?: number | null;
  NajnizaVrijednostPotpore?: number | null;
  NajvisaVrijednostPotpore?: number | null;
  Prijavitelji?: string | null;
  Sazetak?: string | null;
  Podrucja?: string | null;
  UputeZaPrijavitelje?: Doc[] | null;
  Obrasci?: Doc[] | null;
  Prilozi?: Doc[] | null;
}

const text = (s: string | null | undefined): string => (s ?? "").replace(/\r/g, "").replace(/[ \t ]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const positive = (v: unknown): number | null => { const n = num(v); return n !== null && n > 0 ? n : null; };
// "2026-12-18T12:00:00Z" as "18.12.2026. 12:00".
const hrDate = (iso: string | null): string => (iso ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}. ${iso.slice(11, 16)}` : "");

function beneficiaryTypes(s: string): Grant["beneficiary_types"] {
  const t = s.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/mikro|mali poduzetni|srednji poduzetni|msp/.test(t)) out.add("sme");
  if (/veliki poduzetni|trgovačka društva|zadruge|obrt/.test(t)) out.add("company");
  if (/samouprave|ministarstva|državne upravne|ustanove|javnopravna/.test(t)) out.add("public_body");
  if (/civilnog društva|udruge|zaklade/.test(t)) out.add("ngo");
  if (/znanstveno|visoka učilišta|sveučilišt/.test(t)) out.add("research_org");
  if (/komore|klasteri/.test(t)) out.add("other");
  return [...out];
}

// The newest documents first within each group; the API returns every version of every file in no fixed order.
function documents(d: Row | null): Grant["documents"] {
  if (!d) return [];
  const seen = new Set<string>();
  const out: Grant["documents"] = [];
  for (const group of [d.UputeZaPrijavitelje, d.Obrasci, d.Prilozi]) {
    const docs = (group ?? []).filter((x) => x.DocumentVersionID && (x.Naslov || x.FileName)).sort((a, b) => `${a.Naslov ?? ""}|${a.FileName ?? ""}|${a.DocumentVersionID}`.localeCompare(`${b.Naslov ?? ""}|${b.FileName ?? ""}|${b.DocumentVersionID}`, "hr"));
    for (const x of docs) {
      if (seen.has(x.DocumentVersionID as string)) continue;
      seen.add(x.DocumentVersionID as string);
      out.push({ title: text(x.FileName || x.Naslov), url: `${API}/download/${x.DocumentVersionID}` });
    }
  }
  return out.slice(0, MAX_DOCUMENTS);
}

function normalize(r: Row, d: Row | null): Grant {
  const opens = toIso(r.DatumPocetkaZaprimanjaProjektnihPrijava);
  const closes = toIso(r.RokZaPodnosenjeProjektnihPrijava);
  const now = new Date().toISOString();
  const status: Grant["status"] = r.Status === "Završen" || (closes !== null && closes < now) ? "closed" : r.Status === "U najavi" || (opens !== null && opens > now) ? "forthcoming" : "open";
  const min = positive(r.NajnizaVrijednostPotpore);
  const max = positive(r.NajvisaVrijednostPotpore);
  const budget = positive(r.UkupnaBespovratnaSredstva);
  const applicants = text(r.Prijavitelji);
  const body = text(r.Sazetak);
  const summary = [
    r.Oznaka && `Kod poziva: ${r.Oznaka}`,
    r.OperativniProgramNaziv && `Program: ${r.OperativniProgramNaziv}`,
    r.InvesticijskiFondNaziv && `Fond: ${r.InvesticijskiFondNaziv}`,
    r.NadleznoTijeloNaziv && `Nadležno tijelo: ${r.NadleznoTijeloNaziv}`,
    r.VrstaPostupkaDodjeleNaziv && `Vrsta postupka dodjele: ${r.VrstaPostupkaDodjeleNaziv}`,
    r.Status && `Status: ${r.Status}`,
    r.Podrucja && `Područja: ${text(r.Podrucja)}`,
    applicants && `Prijavitelji: ${applicants}`,
    budget !== null && `Ukupna bespovratna sredstva: ${budget} EUR`,
    min !== null && `Najniža vrijednost potpore: ${min} EUR`,
    max !== null && `Najviša vrijednost potpore: ${max} EUR`,
    opens && `Početak zaprimanja projektnih prijava: ${hrDate(opens)}`,
    closes && `Rok za podnošenje projektnih prijava: ${hrDate(closes)}`,
    text(r.CiljPoziva) && `Cilj poziva: ${text(r.CiljPoziva)}`,
    text(r.Predmet) && `Predmet poziva: ${text(r.Predmet)}`,
    body && `Sažetak poziva:\n${body}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `hr_ekohezija:${r.ID}`,
    source: "hr_ekohezija",
    source_id: r.ID,
    source_url: `https://eufondovi.gov.hr/poziv/?id=${r.ID}`,
    source_license: LICENSE,
    title: text(r.Naziv).replace(/\n/g, " "),
    title_lang: "hr",
    summary,
    funder_name: r.NadleznoTijeloNaziv ?? null,
    funder_level: "national",
    country: "HR",
    regions: [],
    funding_types: /vaučer/i.test(r.Naziv) ? ["grant", "voucher"] : ["grant"],
    // The applicant categories when the call lists them, else the eligibility section of the summary text.
    beneficiary_types: beneficiaryTypes(applicants || (body.match(/Prihvatljivi prijavitelji[\s\S]{0,1500}/i)?.[0] ?? "")),
    sectors: [],
    amount_min: min,
    amount_max: max,
    budget_total: budget,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: documents(d),
    source_updated_at: null,
  };
}

export const hrEkohezija: Source = {
  id: "hr_ekohezija",
  license: LICENSE,
  start() {
    return JSON.stringify({ status: STATUSES[0], skip: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const status = encodeURIComponent(c.status);
    const { TotalCount, Records } = await fetchJson<{ TotalCount: number; Records: Row[] }>(`${API}/browse/?status=${status}&op=kk&top=${TOP}&skip=${c.skip}&fond=&vpd=&podrucje=&tijelo&statusIds[]=${status}`, { headers: HEADERS });
    if (c.status === "Otvoren" && c.skip === 0 && !Records?.length) throw new Error("eKohezija returned no open calls (API change?)");
    const rows = (Records ?? []).filter((r) => r.ID && r.Naziv && !/^Izravna dodjela/i.test(r.VrstaPostupkaDodjeleNaziv ?? ""));
    const details = await mapLimit(rows, 2, (r) => fetchJson<Row>(`${API}/${r.ID}`, { headers: HEADERS }));
    const grants = rows.map((r, i) => normalize(r, details[i] ?? null));
    const nextStatus = STATUSES[STATUSES.indexOf(c.status) + 1];
    const next: Cursor | null = (Records?.length ?? 0) > 0 && c.skip + TOP < TotalCount ? { status: c.status, skip: c.skip + TOP } : nextStatus ? { status: nextStatus, skip: 0 } : null;
    return {
      grants,
      raws: rows.map((r) => ({ source_id: r.ID, payload: r })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
