import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Romania, Agenția pentru Finanțarea Investițiilor Rurale (AFIR): the open application sessions of the CAP Strategic
// Plan interventions. The "Contor fonduri disponibile" page (/finantare/prezentare/ redirects to it) is a
// server-rendered table: one group row per intervention and one row per sector with the allocation, the launch and
// close time and the submission ceiling. One record is made per sector row, since each has its own allocation and
// can close on its own. The intervention page /domenii-de-interventie/detalii-si-anexe-dr-NN/ (address built from
// the code) adds purpose, objectives, beneficiaries, the grant ceiling and the applicant guide with its annexes.
// Left out on purpose because they change daily: the value and number of submitted projects and the funds left.
// Only the "FONDURI EPUIZATE" (funds exhausted) mark is kept, as a closed status.
// The site has no robots.txt (404).
const SITE = "https://www.afir.ro";
const LIST_URL = `${SITE}/finantare/contor-fonduri-disponibile/`;
const LICENSE = "AFIR public session information (afir.ro)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

interface Row { code: string; intervention: string; sector: string; allocation: string; launch: string; close: string; ceiling: string; exhausted: boolean }
interface Detail { url: string; text: string; beneficiaries: string; support: string; documents: Grant["documents"] }

const clean = (s: string) => stripHtml(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();

function parseRows(html: string): Row[] {
  const from = html.indexOf('id="tabel-sesiuni"');
  if (from < 0) return [];
  const out: Row[] = [];
  let intervention = "";
  for (const m of html.slice(from, html.indexOf("</table>", from)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]!));
    if (cells.length === 1) intervention = cells[0]!;
    if (cells.length < 9 || !cells[0]) continue;
    out.push({ code: cells[0], intervention, sector: cells[1]!, allocation: cells[2]!, launch: cells[3]!, close: cells[4]!, ceiling: cells[5]!, exhausted: /EPUIZATE/i.test(cells[8]!) });
  }
  return out;
}

// "06.10.2026 09:00:00" in Romanian local time, stored as-is with a Z suffix.
function roDate(v: string): string | null {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}.000Z` : null;
}

// "84.794.823,50 EUR"
const euros = (v: string) => num(v.replace(/EUR/i, "").replace(/[.\s]/g, "").replace(",", "."));

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// The intervention page; null when the code has no page under the expected address.
async function detail(code: string): Promise<Detail | null> {
  const url = `${SITE}/domenii-de-interventie/detalii-si-anexe-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/`;
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const from = html.indexOf('<h4 class="text-portal-primary">');
  const body = from < 0 ? "" : html.slice(from, html.indexOf("<h3>", from));
  // The last section ends with a boilerplate box on how to fill in the application form.
  const text = stripHtml(body).replace(/ /g, " ").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").split(/\nPentru a completa\b/)[0]!;
  const section = (name: string) => text.match(new RegExp(`(?:^|\\n)${name}\\n([\\s\\S]*?)(?=\\n(?:Scop|Obiective|Beneficiari|Sprijin nerambursabil)\\n|$)`))?.[1] ?? "";
  const documents: Grant["documents"] = [];
  // "/api/file/document?url=/media/<id>/<file>.pdf&filename=...": the media path is the file itself.
  for (const m of html.matchAll(/<a target="_blank" title="([^"]*)" href="\/api\/file\/document\?url=(\/media\/[^"&]+)/g)) {
    const title = clean(decodeEntities(m[1]!));
    let file: string;
    try { file = new URL(decodeEntities(m[2]!), SITE).href; } catch { continue; }
    if (title && !documents.some((d) => d.url === file)) documents.push({ title, url: file });
  }
  return { url, text, beneficiaries: section("Beneficiari"), support: section("Sprijin nerambursabil"), documents: documents.slice(0, 40) };
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/fermier|exploata|întreprinder|societ[ăa]ț|\bpfa\b|cooperativ|grupuri de producători|operatori economici/.test(t)) out.add("company");
  if (/\buat\b|comune|autorit[ăa]ți publice|unit[ăa]ți administrativ|\badi\b|unit[ăa]ți de învățământ/.test(t)) out.add("public_body");
  if (/\bong\b|asocia[țt]i|grupuri de acțiune local/.test(t)) out.add("ngo");
  if (/cercetare|universit/.test(t)) out.add("research_org");
  return [...out];
}

function normalize(r: Row, d: Detail | null): Grant {
  const opens = roDate(r.launch);
  const closes = roDate(r.close);
  const id = [r.code, r.launch.slice(6, 10) + r.launch.slice(3, 5) + r.launch.slice(0, 2), slug(r.sector)].filter(Boolean).join("_");
  // "Valoare maximă a sprijinului public va fi de 200.000 euro/ proiect": with several ceilings the largest wins.
  const ceilings = [...(d?.support ?? "").matchAll(/(\d{1,3}(?:\.\d{3})+)\s*(?:de\s+)?euro/gi)].map((m) => Number(m[1]!.replace(/\./g, "")));
  return {
    id: `ro_afir:${id}`,
    source: "ro_afir",
    source_id: id,
    source_url: d?.url ?? LIST_URL,
    source_license: LICENSE,
    title: [`${r.code} ${r.intervention}`.trim(), r.sector !== r.intervention ? r.sector : ""].filter(Boolean).join(" - "),
    title_lang: "ro",
    summary: [
      `Intervenția: ${r.code} ${r.intervention}`.trim(),
      `Sector: ${r.sector}`,
      `Alocare sesiune/sector: ${r.allocation}`,
      `Dată și oră lansare sesiune: ${r.launch}`,
      `Dată și oră închidere sesiune: ${r.close}`,
      `Plafon depunere proiecte: ${r.ceiling}`,
      r.exhausted ? "Fonduri epuizate" : "",
      d?.text ?? "",
    ].filter(Boolean).join("\n").slice(0, 20000),
    funder_name: "Agenția pentru Finanțarea Investițiilor Rurale (AFIR)",
    funder_level: "national",
    country: "RO",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(d?.beneficiaries ?? ""),
    sectors: [],
    amount_min: null,
    amount_max: ceilings.length ? Math.max(...ceilings) : null,
    budget_total: euros(r.allocation),
    currency: "EUR",
    status: r.exhausted ? "closed" : statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: null,
  };
}

export const roAfir: Source = {
  id: "ro_afir",
  license: LICENSE,
  start() {
    return "start";
  },
  // One call reads the table and the page of each intervention in it (a handful of codes per session round).
  async fetchPage(): Promise<Page> {
    const html = await fetchHtml(LIST_URL, UA);
    if (!html.includes('id="tabel-sesiuni"')) throw new Error("AFIR session table is missing from the page (layout change?)");
    // No open session: the table is empty between session rounds.
    const rows = parseRows(html);
    const codes = [...new Set(rows.map((r) => r.code))].slice(0, 24);
    const details = new Map((await mapLimit(codes, 2, (code) => detail(code))).map((d, i) => [codes[i]!, d]));
    const grants = rows.map((r) => normalize(r, details.get(r.code) ?? null));
    return { grants, raws: rows.map((r, i) => ({ source_id: grants[i]!.source_id, payload: { row: { ...r }, text: details.get(r.code)?.text ?? null } })), next: null };
  },
};
