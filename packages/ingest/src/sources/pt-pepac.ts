import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchJson, statusFromDates, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Portugal, PEPAC no Continente (CAP Strategic Plan 2023-2027, mainland): the calls ("concursos") of the rural
// development interventions run by the managing authority. Three public JSON endpoints, no detail pages needed:
// - WP REST /wp-json/wp/v2/competition: title, link, modification time and the content, which opens with the
//   application window in words and then lists the call documents (notice, technical guidance, regulation);
// - the theme's own list route POST /wp-json/pepac/v1/competitions (the one the "Concursos Disponíveis" page calls):
//   the exact deadline of every call ("15-01-2027 17:00"), which the WP REST output lacks (acf is empty there);
// - WP REST /wp-json/wp/v2/competition_topic: the intervention names.
// About 55 calls exist, so one fetchPage reads everything in three requests. The source states no amounts and no
// applicant types in a structured way; those are in the PDF notices listed under documents.
const SITE = "https://pepacc.pt";
const LICENSE = "PEPAC no Continente public call notices (pepacc.pt)";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "application/json" };
const PER_PAGE = 100;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

interface Row { id: number; date: string; modified_gmt: string; link: string; title: { rendered: string }; content: { rendered: string }; competition_topic?: number[] }
interface Listed { id: number; excerpt?: string; final_date?: string }

const pad = (n: number | string) => String(n).padStart(2, "0");

// "De 30 de outubro de 2026 a 15 de janeiro de 2027", "Candidaturas abertas de 22 de outubro a 22 de dezembro de 2026",
// "de 7 de fevereiro a 21 de abril 2025". A missing year is taken from the other date or from the deadline.
// Times are Lisbon local.
function window(text: string, deadlineYear: number): { opens: string | null; closes: string | null } {
  const m = text.match(/(\d{1,2})\s+de\s+([a-zç]+)(?:\s+(?:de\s+)?(\d{4}))?\s+a\s+(\d{1,2})\s+de\s+([a-zç]+)(?:\s+(?:de\s+)?(\d{4}))?/i);
  if (!m) return { opens: null, closes: null };
  const openMonth = MONTHS.indexOf(m[2]!.toLowerCase());
  const closeMonth = MONTHS.indexOf(m[5]!.toLowerCase());
  if (openMonth < 0 || closeMonth < 0) return { opens: null, closes: null };
  const closeYear = Number(m[6] ?? deadlineYear);
  const openYear = Number(m[3] ?? (openMonth > closeMonth ? closeYear - 1 : closeYear));
  return { opens: `${openYear}-${pad(openMonth + 1)}-${pad(m[1]!)}T00:00:00.000Z`, closes: `${closeYear}-${pad(closeMonth + 1)}-${pad(m[4]!)}T23:59:00.000Z` };
}

// "15-01-2027 17:00"
function deadline(v: string | undefined): string | null {
  const m = v?.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "23"}:${m[5] ?? "59"}:00.000Z` : null;
}

function documents(html: string): Grant["documents"] {
  const out: Grant["documents"] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?<span class="font-bold[^"]*">([\s\S]*?)<\/span>/g)) {
    const title = stripHtml(m[2]!).replace(/\s+/g, " ").trim();
    let url: string;
    try { url = new URL(decodeEntities(m[1]!), SITE).href; } catch { continue; }
    if (title && url.startsWith("https://") && !out.some((d) => d.url === url)) out.push({ title, url });
  }
  return out.slice(0, 40);
}

function normalize(r: Row, listed: Listed | undefined, topics: Map<number, string>): Grant {
  const text = stripHtml(r.content.rendered.replace(/<svg[\s\S]*?<\/svg>/g, " ")).replace(/ /g, " ").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  const exact = deadline(listed?.final_date);
  const range = window(listed?.excerpt || text.slice(0, 300), Number(exact?.slice(0, 4) ?? r.date.slice(0, 4)));
  const closes = exact ?? range.closes;
  const opens = range.opens && closes && range.opens > closes ? null : range.opens;
  const topic = (r.competition_topic ?? []).map((id) => topics.get(id)).filter(Boolean).join("; ");
  return {
    id: `pt_pepac:${r.id}`,
    source: "pt_pepac",
    source_id: String(r.id),
    source_url: r.link,
    source_license: LICENSE,
    title: decodeEntities(r.title.rendered).replace(/\s+/g, " ").trim(),
    title_lang: "pt",
    summary: [
      topic ? `Intervenção: ${topic}` : "",
      listed?.final_date ? `Data limite: ${listed.final_date}` : "",
      text,
    ].filter(Boolean).join("\n").slice(0, 20000) || null,
    funder_name: "Autoridade de Gestão do PEPAC no Continente",
    funder_level: "national",
    country: "PT",
    // Mainland Portugal: the Azores and Madeira have their own CAP managing authorities.
    regions: ["PT1"],
    funding_types: ["grant"],
    beneficiary_types: [],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status: statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: documents(r.content.rendered),
    source_updated_at: toIso(`${r.modified_gmt}Z`),
  };
}

// Every call with its deadline, from the route behind the public list page (any status other than "current" lists all).
async function listed(): Promise<Map<number, Listed>> {
  const out = new Map<number, Listed>();
  for (let page = 1; page <= 5; page++) {
    const res = await fetchJson<{ pages?: number; data?: Listed[] }>(`${SITE}/wp-json/pepac/v1/competitions?page=${page}&per_page=${PER_PAGE}&status=all`, { method: "POST", headers: { ...HEADERS, "content-type": "application/json" } });
    for (const row of res.data ?? []) out.set(Number(row.id), row);
    if (page >= Number(res.pages ?? 1)) break;
  }
  return out;
}

export const ptPepac: Source = {
  id: "pt_pepac",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const rows = await fetchJson<Row[]>(`${SITE}/wp-json/wp/v2/competition?per_page=${PER_PAGE}&page=${page}&_fields=id,date,modified_gmt,link,title,content,competition_topic`, { headers: HEADERS });
    if (page === 1 && rows.length === 0) throw new Error("PEPAC competition list returned no calls");
    const deadlines = await listed();
    if (deadlines.size === 0) throw new Error("PEPAC deadline list returned no calls");
    const topics = new Map((await fetchJson<{ id: number; name: string }[]>(`${SITE}/wp-json/wp/v2/competition_topic?per_page=100&_fields=id,name`, { headers: HEADERS })).map((t) => [t.id, decodeEntities(t.name).replace(/‎/g, "")]));
    const grants = rows.map((r) => normalize(r, deadlines.get(r.id), topics));
    return {
      grants,
      raws: rows.map((r) => ({ source_id: String(r.id), payload: { ...r, listed: deadlines.get(r.id) ?? null } })),
      next: rows.length === PER_PAGE ? String(page + 1) : null,
    };
  },
};
