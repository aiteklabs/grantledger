import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Lithuania, Aplinkos projektų valdymo agentūra (APVA, Environmental Projects Management Agency): the calls published
// in its application system APVIS (climate change programme, modernisation fund, building renovation, electric
// vehicles, forestry). The front page is server-rendered with three tabs (natural persons, legal persons, investment
// plans), each a table of the calls that take applications: start date, code, title, budget. A call can sit in more
// than one tab. The detail page gives the measure, the exact window with hours, the maximum compensation, the budget
// and the full conditions.
// Left out on purpose because they change daily: the "funds left" column, the "days left" counter and the
// "Atnaujinimo data" line of the detail page (it prints the day of the request, not a modification date).
const SITE = "https://apvis.apva.lt";
const LICENSE = "APVA public call information (apvis.apva.lt)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PER_PAGE = 20;
const TABS = ["individual", "legal", "investment-plans"] as const;

interface Row { slug: string; code: string; title: string; starts: string; budget: string; tabs: string[] }
interface Detail { measure: string; opens: string | null; closes: string | null; compensation: number | null; budget: number | null; text: string; documents: Grant["documents"] }

const clean = (s: string) => stripHtml(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();

function parseRows(html: string): Row[] {
  const rows = new Map<string, Row>();
  for (const tab of TABS) {
    const from = html.indexOf(`id="${tab}"`);
    if (from < 0) continue;
    const pane = html.slice(from, html.indexOf("</table>", from));
    for (const m of pane.matchAll(/<tr>\s*<td>(\d{4}-\d{2}-\d{2})<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td[^>]*>([^<]*)<\/td>/g)) {
      const link = m[2]!.match(/<a href="[^"]*\/paskelbti_kvietimai\/([^"/]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) continue;
      const row = rows.get(link[1]!) ?? { slug: link[1]!, code: clean(m[2]!.replace(/<span class="badge[\s\S]*?<\/span>/g, "").replace(/<a [\s\S]*$/, "")), title: clean(link[2]!), starts: m[1]!, budget: clean(m[3]!), tabs: [] };
      row.tabs.push(tab);
      rows.set(row.slug, row);
    }
  }
  return [...rows.values()];
}

// "2026-11-23 13:00" in Lithuanian local time, stored as-is with a Z suffix like the other Lithuanian adapters.
function toIsoLt(value: string | undefined): string | null {
  const m = value?.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00.000Z` : null;
}

async function detail(slug: string): Promise<Detail> {
  const html = await fetchHtml(`${SITE}/paskelbti_kvietimai/${slug}`, UA);
  const from = html.indexOf('class="info_block"');
  const to = html.indexOf("Atnaujinimo data", from);
  const body = from < 0 ? "" : html.slice(html.indexOf(">", from) + 1, to < 0 ? html.indexOf("</main>", from) : html.lastIndexOf("<", to)).replace(/<a\b[^>]*>\s*Pildyti formą\s*<\/a>/g, " ");
  const documents: Grant["documents"] = [];
  for (const m of body.matchAll(/<a\b[^>]*href="([^"]*\/uploads\/documents\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    let url: URL;
    try { url = new URL(decodeEntities(m[1]!), SITE); } catch { continue; }
    const text = clean(m[2]!);
    // Many links are just "čia" (here): the file name is the better title then.
    const title = text.length > 5 ? text : decodeURIComponent(url.pathname.split("/").pop() ?? "");
    if (title && url.protocol === "https:" && !documents.some((d) => d.url === url.href)) documents.push({ title, url: url.href });
  }
  return {
    measure: clean(html.match(/Priemonė:([\s\S]*?)<\/h4>/)?.[1] ?? ""),
    opens: toIsoLt(html.match(/Paraiškos priimamos nuo\s*:\s*([^<]*)</)?.[1]),
    closes: toIsoLt(html.match(/Paraiškos priimamos iki:\s*([^<]*)</)?.[1]),
    compensation: num(html.match(/Kompensacinė išmoka:\s*<span[^>]*>\s*([\d.]+)\s*Eur/)?.[1]),
    budget: num(html.match(/Kvietimui numatytas finansavimas:\s*([\d.]+)\s*Eur/)?.[1]),
    // Table cells get a separator, otherwise their figures run together.
    text: stripHtml(body.replace(/<\/t[dh]>/gi, " | ")).replace(/ /g, " ").split("\n").map((l) => l.replace(/\s+/g, " ").replace(/( \|)+ ?$/, "").trim()).filter(Boolean).join("\n"),
    documents: documents.slice(0, 40),
  };
}

function beneficiaries(r: Row, d: Detail): Grant["beneficiary_types"] {
  const t = `${r.title} ${d.measure}`.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (r.tabs.includes("individual") || /fiziniams asmenims|fizinių asmenų/.test(t)) out.add("individual");
  if (r.tabs.includes("legal")) out.add("company");
  if (/savivaldyb|viešiesiems|viešųjų|biudžetin/.test(t)) out.add("public_body");
  if (/bendruomenin|asociacij|nevyriausybin/.test(t)) out.add("ngo");
  return [...out];
}

function normalize(r: Row, d: Detail): Grant {
  const opens = d.opens ?? toIsoLt(r.starts);
  const closes = d.closes;
  const budget = d.budget ?? num(r.budget);
  const audience = r.tabs.map((t) => (t === "individual" ? "fiziniams asmenims" : t === "legal" ? "juridiniams asmenims" : "investicijų planams")).join(", ");
  return {
    id: `lt_apva:${r.slug}`,
    source: "lt_apva",
    source_id: r.slug,
    source_url: `${SITE}/paskelbti_kvietimai/${r.slug}`,
    source_license: LICENSE,
    title: r.title,
    title_lang: "lt",
    summary: [
      r.code ? `Kvietimo kodas: ${r.code}` : "",
      d.measure ? `Priemonė: ${d.measure}` : "",
      audience ? `Kvietimas skirtas: ${audience}` : "",
      opens ? `Paraiškos priimamos nuo: ${opens.slice(0, 16).replace("T", " ")}` : "",
      closes ? `Paraiškos priimamos iki: ${closes.slice(0, 16).replace("T", " ")}` : "",
      d.compensation !== null ? `Kompensacinė išmoka: ${d.compensation} Eur` : "",
      budget !== null ? `Kvietimui numatytas finansavimas: ${budget} Eur` : "",
      d.text,
    ].filter(Boolean).join("\n").slice(0, 20000),
    funder_name: "Aplinkos projektų valdymo agentūra",
    funder_level: "national",
    country: "LT",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(r, d),
    sectors: [],
    amount_min: null,
    amount_max: d.compensation,
    budget_total: budget,
    currency: "EUR",
    status: statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: d.documents,
    source_updated_at: null,
  };
}

export const ltApva: Source = {
  id: "lt_apva",
  license: LICENSE,
  start() {
    return "0";
  },
  // The cursor is the offset into the list of calls, read again on every page.
  async fetchPage(cursor): Promise<Page> {
    const offset = Number(cursor);
    const rows = parseRows(await fetchHtml(`${SITE}/`, UA));
    if (rows.length === 0) throw new Error("APVIS front page returned no calls (layout change?)");
    const slice = rows.slice(offset, offset + PER_PAGE);
    const details = await mapLimit(slice, 2, (r) => detail(r.slug));
    return {
      grants: slice.map((r, i) => normalize(r, details[i]!)),
      raws: slice.map((r, i) => ({ source_id: r.slug, payload: { row: r, detail: { ...details[i]!, text: details[i]!.text.slice(0, 20000) } } })),
      next: offset + PER_PAGE < rows.length ? String(offset + PER_PAGE) : null,
    };
  },
};
