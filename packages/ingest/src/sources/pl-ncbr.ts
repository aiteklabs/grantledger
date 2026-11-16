import type { Grant } from "@grantledger/schema";
import { fetchJson, mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Poland, Narodowe Centrum Badań i Rozwoju (National Centre for Research and Development): R&D funding competitions.
// The competition search of the NCBR pages on gov.pl is backed by a public JSON endpoint (/api/data/competition-search)
// with name, path, budget, status, applicant types and dates. The `page` parameter is 1-based (0 and 1 both return the
// first page). Sorted by the end of the application period, newest first, the open and announced competitions fill the
// first page, so the crawl stops after the first page without any current competition (about 370 rows in total, most
// of them finished). The detail page (server-rendered) adds who can apply, what is funded, rates, schedule and the
// call documents; it is read only for open and announced competitions. Rows whose budget field says that no funding is
// granted (calls for research topic proposals) are left out.
const SITE = "https://www.gov.pl";
const LIST = `${SITE}/api/data/competition-search?type=NCBR&language=pl&sort=applicationsEndDate,desc`;
const PAGE_SIZE = 20;
const LICENSE = "CC BY-SA 4.0 (gov.pl text content, Narodowe Centrum Badań i Rozwoju)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

interface Row {
  name: string;
  path: string;
  publishDate?: string | null;
  description?: string | null;
  budget?: string | null;
  status: string;
  typesOfApplicant?: string | null;
  dates?: string | null;
  applicationsStartDate?: string | null;
  applicationsEndDate?: string | null;
}
interface ListResponse { content: Row[]; last: boolean }
interface Detail { sections: string[]; apply: string | null; documents: Grant["documents"] }

const APPLICANTS: Record<string, Grant["beneficiary_types"][number]> = {
  sme: "sme",
  micro: "sme",
  large_enterprise: "company",
  research_unit: "research_org",
  university: "research_org",
  scientist: "research_org",
  ngo: "ngo",
  public_institution: "public_body",
  individual: "individual",
  others: "other",
};

const current = (r: Row) => r.status === "APPLICATIONS_IN_PROGRESS" || r.status === "ANNOUNCED";

function plain(html: string | null | undefined): string {
  return html ? stripHtml(html).replace(/[\u00a0\u200b\u202f]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim() : "";
}

function list<T>(json: string | null | undefined): T[] {
  try {
    const v = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

// A Polish wall-clock time as ISO in UTC. Poland is UTC+2 from the last Sunday of March to the last Sunday of October.
function warsawIso(year: number, month: number, day: number, hour: number, minute: number, second = 0): string {
  const lastSunday = (m: number) => { const end = new Date(Date.UTC(year, m + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
  const summer = (month > 2 && month < 9) || (month === 2 && day >= lastSunday(2)) || (month === 9 && day < lastSunday(9));
  return new Date(Date.UTC(year, month, day, hour - (summer ? 2 : 1), minute, second)).toISOString();
}

// "2027-05-25T14:00:00" is Polish local time. Midnight means that only the day is given: the day is kept as it is,
// a closing day runs to its end.
function localIso(value: string | null | undefined, endOfDay = false): string | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  if (m[4] === "00" && m[5] === "00") return `${m[1]}-${m[2]}-${m[3]}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z`;
  return warsawIso(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

// "25 000 000 zł", "1 100 000 euro", "296 982 000 PLN (70 000 000 EUR)", "80 mln zł", "419 489 205,40 zł".
function budget(text: string | null | undefined): { total: number | null; currency: string } {
  const m = (text ?? "").replace(/[\u00a0\u202f]/g, " ").match(/^\s*(\d[\d ]*)(?:,(\d{1,2}))?\s*(mln|mld|tys)?\.?\s*(zł|pln|eur)?/i);
  if (!m) return { total: null, currency: "PLN" };
  const scale = { mln: 1e6, mld: 1e9, tys: 1e3 }[(m[3] ?? "").toLowerCase()] ?? 1;
  const value = num(`${(m[1] as string).replace(/ /g, "")}.${m[2] ?? "0"}`);
  return { total: value === null ? null : Math.round(value * scale * 100) / 100, currency: /eur/i.test(m[4] ?? "") ? "EUR" : "PLN" };
}

// The detail page: accordion sections (title and text) and the downloadable files. A page that is gone (404) gives
// null and the record keeps the list data.
async function detail(path: string): Promise<Detail | null> {
  const url = `${SITE}${path}`;
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const article = (await res.text()).match(/<article class="article-area__article competition"[\s\S]*?<!-- c_e -->/)?.[0];
  if (!article) return null;
  const sections: string[] = [];
  for (const chunk of article.split(/<h[34]>\s*<button type="button" class="expand"/).slice(1)) {
    const title = plain(chunk.match(/<span class="accordion-title">([\s\S]*?)<\/span>/)?.[1]);
    // File lists carry a second class ("competition__attachments") and are read as documents below.
    const body = chunk.match(/<div class="info js-scenario-content">([\s\S]*)/)?.[1];
    if (!title || !body) continue;
    const text = plain(body.split(/<h3 class="competition__attachments__header"|<ul class="competition__contacts"/)[0]);
    if (text) sections.push(text.includes("\n") ? `${title}:\n${text}` : `${title}: ${text}`);
  }
  const documents: Grant["documents"] = [];
  for (const m of article.matchAll(/<a class="file-download" href="(\/attachment\/[^"]+)"[^>]*>([\s\S]*?)<br/g)) {
    const title = plain(m[2]).replace(/\n/g, " ");
    const href = `${SITE}${m[1]}`;
    if (title && !documents.some((d) => d.url === href)) documents.push({ title, url: href });
  }
  const apply = article.match(/<div class="competition__buttons">\s*<a[^>]*href="(https?:\/\/[^"]+)"/)?.[1] ?? null;
  return { sections, apply, documents };
}

function normalize(r: Row, d: Detail | null): Grant {
  const slug = r.path.replace(/\/+$/, "").split("/").pop() as string;
  const dates = list<{ name?: string; value?: string }>(r.dates).filter((x) => x.name && x.value);
  const ends = dates.filter((x) => /^\s*Zakończenie naboru/i.test(x.name as string)).map((x) => x.value as string).sort();
  const opens = localIso(r.applicationsStartDate);
  const closes = localIso(r.applicationsEndDate ?? ends.at(-1), true);
  const now = new Date().toISOString();
  const status: Grant["status"] = closes && closes < now ? "closed" : r.status === "APPLICATIONS_IN_PROGRESS" ? "open" : r.status === "ANNOUNCED" ? "forthcoming" : "closed";
  const money = budget(r.budget);
  const summary = [
    plain(r.description),
    ...(d?.sections ?? []),
    // Without the detail page the list data stands in for the budget and schedule sections.
    !d?.sections.length && plain(r.budget) && `Budżet konkursu: ${plain(r.budget)}`,
    !d?.sections.length && dates.length > 0 && `Harmonogram konkursu:\n${dates.map((x) => `${(x.name as string).trim()}: ${(x.value as string).replace("T", " ").replace(/ 00:00:00$/, "").replace(/:00$/, "")}`).join("\n")}`,
    d?.apply && `Złóż wniosek: ${d.apply}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  const published = r.publishDate?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  return {
    id: `pl_ncbr:${slug}`,
    source: "pl_ncbr",
    source_id: slug,
    source_url: `${SITE}${r.path}`,
    source_license: LICENSE,
    title: r.name.replace(/\s+/g, " ").trim(),
    title_lang: "pl",
    summary: summary || null,
    funder_name: "Narodowe Centrum Badań i Rozwoju (NCBR)",
    funder_level: "national",
    country: "PL",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: [...new Set(list<string>(r.typesOfApplicant).map((t) => APPLICANTS[t]).filter((t) => t !== undefined))].sort(),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: money.total,
    currency: money.currency,
    status,
    opens_at: opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: published ? warsawIso(Number(published[1]), Number(published[2]) - 1, Number(published[3]), Number(published[4]), Number(published[5]), Number(published[6])) : null,
  };
}

export const plNcbr: Source = {
  id: "pl_ncbr",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetchJson<ListResponse>(`${LIST}&page=${page}&size=${PAGE_SIZE}`, { headers: UA });
    const content = res.content ?? [];
    if (page === 1 && content.length === 0) throw new Error("NCBR competition search returned no rows (changed endpoint?)");
    const rows = content.filter((r) => r.path && r.name && !/nie jest przyznawane dofinansowanie/i.test(r.budget ?? ""));
    const details = await mapLimit(rows, 2, (r) => (current(r) ? detail(r.path) : Promise.resolve(null)));
    const grants = rows.map((r, i) => normalize(r, details[i] ?? null));
    return {
      grants,
      raws: rows.map((r, i) => ({ source_id: grants[i]!.source_id, payload: r })),
      // Ordered by closing date, newest first: a page without a current competition means that only finished ones follow.
      next: !res.last && content.some(current) ? String(page + 1) : null,
    };
  },
};
