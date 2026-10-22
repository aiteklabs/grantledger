import type { Grant } from "@grantledger/schema";
import { mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Greece, ESPA 2021-2027 proclamations (espa.gr): server-rendered list, 10 per page, one detail page per call.
const SITE = "https://www.espa.gr";
const PAGE_SIZE = 10;
const LICENSE = "ESPA (Partnership Agreement 2021-2027) public proclamations, espa.gr";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

function grDate(v: string): string | null {
  const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T12:00:00.000Z` : null;
}

function field(text: string, label: string): string {
  const m = text.match(new RegExp(`${label}\\s*:?\\s*\\|\\s*([^|]{1,300})`));
  return m?.[1]?.trim() ?? "";
}

async function detail(id: string) {
  const res = await fetch(`${SITE}/el/Pages/ProclamationsFS.aspx?item=${id}`, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "|").replace(/\s*\|\s*(\|\s*)+/g, "|").replace(/\s+/g, " ");
  return {
    title: stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ""),
    beneficiaries: field(text, "Σε ποιους απευθύνεται"),
    budget: field(text, "Προϋπολογισμός"),
    period: field(text, "Περίοδος υποβολής"),
    region: field(text, "Περιοχή εφαρμογής"),
    programme: field(text, "Επιχειρησιακό πρόγραμμα"),
    summary: stripHtml(html.match(/<div[^>]*class="[^"]*(?:content|main)[^"]*"[\s\S]*?<\/div>/i)?.[0] ?? "").slice(0, 6000),
  };
}

function normalize(id: string, listTitle: string, listSummary: string, d: Awaited<ReturnType<typeof detail>>): Grant {
  const dates = [...d.period.matchAll(/\d{1,2}\/\d{1,2}\/\d{4}/g)].map((m) => grDate(m[0]));
  const opens = dates[0] ?? null;
  const closes = dates.length > 1 ? dates[1]! : null;
  const now = new Date().toISOString();
  const who = d.beneficiaries.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (/επιχειρ/.test(who)) bens.add("company");
  if (/μμε|μικρ/.test(who)) bens.add("sme");
  if (/δήμ|περιφέρει|δημόσι|υπουργ|φορείς/.test(who)) bens.add("public_body");
  if (/πανεπιστ|ερευν/.test(who)) bens.add("research_org");
  if (/ιδιώτ|φυσικά πρόσωπα/.test(who)) bens.add("individual");
  return {
    id: `gr_espa:${id}`,
    source: "gr_espa",
    source_id: id,
    source_url: `${SITE}/el/Pages/ProclamationsFS.aspx?item=${id}`,
    source_license: LICENSE,
    title: d.title || listTitle || id,
    title_lang: "el",
    summary: [listSummary, d.programme ? `Επιχειρησιακό πρόγραμμα: ${d.programme}` : "", d.beneficiaries ? `Σε ποιους απευθύνεται: ${d.beneficiaries}` : "", d.region ? `Περιοχή εφαρμογής: ${d.region}` : "", d.period ? `Περίοδος υποβολής: ${d.period}` : ""].filter(Boolean).join("\n"),
    funder_name: d.programme || "ΕΣΠΑ 2021-2027",
    funder_level: /όλη η ελλάδα/i.test(d.region) || !d.region ? "national" : "regional",
    country: "GR",
    regions: /όλη η ελλάδα/i.test(d.region) || !d.region ? [] : [d.region],
    funding_types: ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: num(d.budget.replace(/\./g, "").replace(",", ".")),
    currency: "EUR",
    status: closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : opens ? "open" : "unknown",
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const grEspa: Source = {
  id: "gr_espa",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const start = Number(cursor);
    const res = await fetch(`${SITE}/el/Pages/Proclamations.aspx?start=${start}`, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ESPA list start ${start}`);
    const html = await res.text();
    const items = [...html.matchAll(/<div class="item">([\s\S]*?)<div class="more">([\s\S]*?)<\/div>/g)]
      .map((m) => ({ id: m[2]!.match(/item=(\d+)/)?.[1] ?? "", title: stripHtml(m[1]!.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? ""), summary: stripHtml(m[1]!.match(/<\/h3>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? "") }))
      .filter((x) => x.id);
    const details = await mapLimit(items, 4, (x) => detail(x.id).catch(() => null));
    const kept = items.map((x, i) => [x, details[i]] as const).filter((p): p is readonly [typeof items[number], Awaited<ReturnType<typeof detail>>] => !!p[1]);
    return {
      grants: kept.map(([x, d]) => normalize(x.id, x.title, x.summary, d)),
      raws: kept.map(([x, d]) => ({ source_id: x.id, payload: { list: x, detail: { ...d, summary: d.summary.slice(0, 1500) } } })),
      next: items.length === PAGE_SIZE ? String(start + PAGE_SIZE) : null,
    };
  },
};
