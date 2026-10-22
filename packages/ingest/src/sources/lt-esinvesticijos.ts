import type { Grant } from "@grantledger/schema";
import { mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Lithuania, EU funds 2021-2027 portal (esinvesticijos.lt): HTML list of calls, 25 per page, plus one detail page per call.
const SITE = "https://www.esinvesticijos.lt";
const LIST = `${SITE}/kvietimu-sritis/kvietimu-sarasas?page=`;
const LICENSE = "esinvesticijos.lt public information (Ministry of Finance of Lithuania)";
const UA = { "user-agent": "grantledger/0.1 (+https://grantledger.eu)" };

const STATUS: Record<string, Grant["status"]> = { Paskelbtas: "open", Planuojamas: "forthcoming", Pasibaigęs: "closed", Sustabdytas: "closed" };
const REGION: [string, string][] = [
  ["sostinės", "LT01"],
  ["vidurio ir vakarų", "LT02"],
];

interface Row { slug: string; title: string; number: string; status: string; amount: number | null }

function parseList(html: string): Row[] {
  const rows: Row[] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const slug = tr.match(/href="[^"]*\/kvietimai\/([^"?#]+)"/)?.[1];
    if (!slug) continue;
    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map((c) => stripHtml(c).replace(/\s+/g, " ").trim());
    const title = tr.match(/title="([^"]+)"/)?.[1] ?? cells[1]?.replace(/\s*Nr\..*$/, "") ?? slug;
    const number = cells[1]?.match(/Nr\.\s*([\w-]+)/)?.[1] ?? "";
    const status = cells[0]?.match(/(Paskelbtas|Planuojamas|Pasibaigęs|Sustabdytas)/)?.[1] ?? "";
    const amount = num(cells[2]?.replace(/\s/g, "").replace(",", "."));
    rows.push({ slug, title: stripHtml(title), number, status, amount });
  }
  return rows;
}

// Detail pages are label/value tables. After stripping tags we look up the value that follows a label.
function field(text: string, label: string): string {
  const i = text.indexOf(`${label}|`);
  if (i === -1) return "";
  return text.slice(i + label.length + 1).split("|").map((s) => s.trim()).find((s) => s && s !== "Daugiau" && s !== "Mažiau") ?? "";
}

async function detail(slug: string) {
  const res = await fetch(`${SITE}/kvietimai/${slug}`, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/g, " ")
    .replace(/\s*\|\s*(\|\s*)+/g, "|")
    .replace(/\s+/g, " ");
  // Body: from the call number to the documents block; skips navigation and the cookie banner.
  const plain = stripHtml(html).replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n\n");
  const start = plain.search(/Nr\. [\w-]+/);
  const end = plain.indexOf("\nDokumentai", start);
  const body = start >= 0 ? plain.slice(start, end > start ? end : start + 12000) : plain.slice(0, 12000);
  const regionText = ["Sostinės regionas", "Vidurio ir vakarų Lietuvos regionas"].filter((r) => plain.includes(r)).join("; ");
  return {
    opens: field(text, "Teikiama nuo"),
    closes: field(text, "Teikiama iki"),
    applicantType: field(text, "Pareiškėjo tipas"),
    targetGroups: field(text, "Tikslinės grupės"),
    region: regionText,
    form: field(text, "Finansavimo forma"),
    budget: field(text, "Kvietimo finansavimo suma"),
    summary: body.replace(/\n{3,}/g, "\n\n").slice(0, 12000),
  };
}

function toIsoLt(value: string): string | null {
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00.000Z` : null;
}

function normalize(r: Row, d: Awaited<ReturnType<typeof detail>>): Grant {
  const bens = new Set<Grant["beneficiary_types"][number]>();
  const who = `${d.applicantType} ${d.targetGroups}`.toLowerCase();
  if (who.includes("privat")) bens.add("company");
  if (who.includes("mvį")) bens.add("sme");
  if (who.includes("viešas")) bens.add("public_body");
  if (who.includes("nvo") || who.includes("nevyriausyb")) bens.add("ngo");
  if (who.includes("moksl") || who.includes("universitet")) bens.add("research_org");
  const form = d.form.toLowerCase();
  const ft: Grant["funding_types"] = form.includes("paskol") ? ["loan"] : form.includes("garant") ? ["guarantee"] : ["grant"];
  const regions = REGION.filter(([k]) => d.region.toLowerCase().includes(k)).map(([, code]) => code);
  const opens = toIsoLt(d.opens);
  const closes = toIsoLt(d.closes);
  return {
    id: `lt_esinvesticijos:${r.number || r.slug}`,
    source: "lt_esinvesticijos",
    source_id: r.number || r.slug,
    source_url: `${SITE}/kvietimai/${r.slug}`,
    source_license: LICENSE,
    title: r.title,
    title_lang: "lt",
    summary: [d.applicantType && `Pareiškėjo tipas: ${d.applicantType}`, d.targetGroups && `Tikslinės grupės: ${d.targetGroups}`, d.region && `Regionas: ${d.region}`, d.summary].filter(Boolean).join("\n\n") || null,
    funder_name: "ES investicijos 2021-2027 (Lithuania)",
    funder_level: "national",
    country: "LT",
    regions,
    funding_types: ft,
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: r.amount || num(d.budget.replace(/[^\d,]/g, "").replace(",", ".")) || null,
    currency: "EUR",
    status: STATUS[r.status] ?? (closes && new Date(closes) < new Date() ? "closed" : "unknown"),
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const ltEsinvesticijos: Source = {
  id: "lt_esinvesticijos",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetch(`${LIST}${page}`, { headers: UA, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for list page ${page}`);
    const html = await res.text();
    const rows = parseList(html);
    const details = await mapLimit(rows, 4, (r) => detail(r.slug).catch(() => null));
    const kept = rows.map((r, i) => [r, details[i]] as const).filter((x): x is readonly [Row, Awaited<ReturnType<typeof detail>>] => !!x[1]);
    const hasNext = new RegExp(`page=${page + 1}\\b`).test(html);
    return {
      grants: kept.map(([r, d]) => normalize(r, d)),
      raws: kept.map(([r, d]) => ({ source_id: r.number || r.slug, payload: { row: r, detail: { ...d, summary: d.summary.slice(0, 2000) } } })),
      next: hasNext && rows.length > 0 ? String(page + 1) : null,
    };
  },
};
