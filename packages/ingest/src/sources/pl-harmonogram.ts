import type { Grant } from "@grantledger/schema";
import * as XLSX from "xlsx";
import { fetchJson, num } from "../util";
import type { Page, Source } from "./types";

// Poland: official call schedules (harmonogramy naborów) published as xlsx on dane.gov.pl (CC0) for the national
// programmes FERS and FERC. The live portal (funduszeeuropejskie.gov.pl) sits behind a captcha; PARP behind a bot wall.
const DATASETS: { id: number; programme: string }[] = [
  { id: 28776, programme: "Fundusze Europejskie dla Rozwoju Społecznego (FERS)" },
  { id: 4761, programme: "Fundusze Europejskie na Rozwój Cyfrowy (FERC)" },
];
const LICENSE = "CC0 1.0 (dane.gov.pl, Ministerstwo Funduszy i Polityki Regionalnej)";
const MONTHS = ["stycz", "lut", "mar", "kwie", "maj", "czerw", "lip", "sierp", "wrze", "paździer", "listopad", "grudz"];

function plDate(v: string | undefined, endOfMonth = false): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T12:00:00.000Z`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}T12:00:00.000Z`;
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
  const mo = MONTHS.findIndex((k) => s.includes(k));
  const y = s.match(/(20\d{2})/)?.[1];
  if (mo >= 0 && y) {
    const last = new Date(Date.UTC(Number(y), mo + 1, 0)).getUTCDate();
    return `${y}-${String(mo + 1).padStart(2, "0")}-${endOfMonth ? String(last) : "01"}T12:00:00.000Z`;
  }
  const q = s.match(/(i{1,3}|iv)\s*kw/);
  if (q && y) {
    const qn = { i: 1, ii: 2, iii: 3, iv: 4 }[q[1]!] ?? 1;
    const mo2 = endOfMonth ? qn * 3 : qn * 3 - 2;
    return `${y}-${String(mo2).padStart(2, "0")}-${endOfMonth ? "28" : "01"}T12:00:00.000Z`;
  }
  return null;
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/mśp|msp|mikro|małe|średnie/.test(t)) out.add("sme");
  if (/przedsiębior|firm|pracodawc/.test(t)) out.add("company");
  if (/uczelni|naukow|badawcz|instytut/.test(t)) out.add("research_org");
  if (/administracj|jst|samorząd|gmin|powiat|ministerstwo|urząd/.test(t)) out.add("public_body");
  if (/pozarządow|ngo|fundacj|stowarzysz/.test(t)) out.add("ngo");
  if (/osoby fizyczne/.test(t)) out.add("individual");
  return [...out];
}

interface Resource { attributes: { format?: string; link?: string; download_url?: string; title?: string } }

async function latestXlsx(datasetId: number): Promise<string | null> {
  const data = await fetchJson<{ data: Resource[] }>(`https://api.dane.gov.pl/1.4/datasets/${datasetId}/resources`);
  const r = data.data.find((x) => (x.attributes.format ?? "").toLowerCase() === "xlsx");
  return r?.attributes.link ?? r?.attributes.download_url ?? null;
}

export const plHarmonogram: Source = {
  id: "pl_harmonogram",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const i = Number(cursor);
    const ds = DATASETS[i];
    if (!ds) return { grants: [], raws: [], next: null };
    const next = i + 1 < DATASETS.length ? String(i + 1) : null;
    const url = await latestXlsx(ds.id);
    if (!url) return { grants: [], raws: [], next };
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const wb = XLSX.read(await res.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: false, defval: "" });
    const headerIdx = rows.findIndex((r) => r.some((c) => /wnioskodawc/i.test(String(c))));
    if (headerIdx < 0) return { grants: [], raws: [], next };
    const header = rows[headerIdx]!.map((h) => String(h).toLowerCase());
    const col = (re: RegExp) => header.findIndex((h) => re.test(h));
    const c = { prio: col(/priorytet/), action: col(/działanie/), title: col(/tytuł/), types: col(/typy projekt/), who: col(/wnioskodawc/), from: col(/początkow/), to: col(/końcow/), amount: col(/kwota/), area: col(/obszar/), inst: col(/instytucja/), mode: col(/sposób/), goal: col(/cel/), extra: col(/dodatkow/) };
    const get = (r: string[], k: number) => (k >= 0 ? String(r[k] ?? "").trim() : "");
    const now = new Date().toISOString();
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    rows.slice(headerIdx + 1).forEach((r, k) => {
      const action = get(r, c.action);
      const title = get(r, c.title) || action;
      if (!title || /^\(/.test(get(r, c.prio))) return;
      const opens = plDate(get(r, c.from));
      const closes = plDate(get(r, c.to), true);
      // Identity from content, never from the row position: the schedule is re-sorted between releases.
      const sourceId = `${ds.id}-${title}-${opens ?? ""}-${closes ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 140);
      const area = get(r, c.area);
      grants.push({
        id: `pl_harmonogram:${sourceId}`,
        source: "pl_harmonogram",
        source_id: sourceId,
        source_url: `https://dane.gov.pl/pl/dataset/${ds.id}`,
        source_license: LICENSE,
        title,
        title_lang: "pl",
        summary: [
          `Program: ${ds.programme}`,
          get(r, c.prio) ? `Priorytet: ${get(r, c.prio)}` : "",
          action ? `Działanie: ${action}` : "",
          get(r, c.types) ? `Typy projektów: ${get(r, c.types)}` : "",
          get(r, c.who) ? `Wnioskodawcy: ${get(r, c.who)}` : "",
          get(r, c.mode) ? `Sposób wyboru: ${get(r, c.mode)}` : "",
          get(r, c.goal) ? `Cel: ${get(r, c.goal)}` : "",
          get(r, c.extra) ? `Informacje dodatkowe: ${get(r, c.extra)}` : "",
          get(r, c.from) || get(r, c.to) ? `Nabór: ${get(r, c.from)} - ${get(r, c.to)}` : "",
        ].filter(Boolean).join("\n"),
        funder_name: get(r, c.inst) || ds.programme,
        funder_level: "national",
        country: "PL",
        regions: area && !/cały kraj|ogólnopolsk/i.test(area) ? [area] : [],
        funding_types: ["grant"],
        beneficiary_types: beneficiaries(get(r, c.who)),
        sectors: [],
        amount_min: null,
        amount_max: null,
        budget_total: num(get(r, c.amount).replace(/,/g, "").replace(/\s/g, "")),
        currency: "PLN",
        status: closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : opens ? "open" : "unknown",
        opens_at: opens,
        closes_at: closes,
        documents: [{ title: "Harmonogram (xlsx)", url }],
        source_updated_at: null,
      });
      raws.push({ source_id: sourceId, payload: Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])) });
    });
    return { grants, raws, next };
  },
};
