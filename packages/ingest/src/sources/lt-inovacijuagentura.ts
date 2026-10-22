import type { Grant } from "@grantledger/schema";
import { mapLimit, num, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Lithuania, Inovacijų agentūra (Innovation Agency): the agency's own funding calls ("finansavimo kvietimai").
// The site is a Nuxt frontend on Netlify over a headless WordPress (web-prod host). The core WP REST API is locked
// (401) but the theme's own list endpoint is public: POST /wp-json/finansavimas/v1/get_list/ with a status filter,
// 12 rows per page. Details come from the frontend's prerendered Nuxt payload (<page>/_payload.json, devalue format).
// Three statuses: galiojantis (open, includes rows the site labels "sustabdytas" = suspended), planuojamas (planned),
// negaliojantis (expired). Expired rows are listed without a detail fetch: ingest skips closed records anyway.
const SITE = "https://www.inovacijuagentura.lt";
const API = "https://web-prod.inovacijuagentura.lt/wp-json/finansavimas/v1/get_list/?lang=lt";
const LICENSE = "Inovacijų agentūra public call information (inovacijuagentura.lt)";
const HEADERS = {
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "lt-LT,lt;q=0.9,en;q=0.8",
};
const STATUSES = ["galiojantis", "planuojamas", "negaliojantis"] as const;
type Busena = (typeof STATUSES)[number];

interface Cursor { busena: Busena; page: number }

interface Row {
  id: number;
  title: string;
  url: string;
  busena: string;
  galioja_iki?: string | null;
  galiojimo_salyga?: string;
  suma?: string | null;
  redirect_url?: string | null;
  terms?: { slug: string; items: { name: string }[] }[];
}

interface Detail {
  busena?: string;
  galioja_nuo?: string | null;
  galioja_iki?: string | null;
  galiojimo_salyga?: string;
  suma?: string | null;
  min_finansavimas?: number | string | null;
  max_finansavimas?: number | string | null;
  didziausia_galima_finansuojamoji_dalis_proc?: number | string | null;
  didziausia_galima_finansuojamoji_dalis_pastabos?: string;
  finansavimo_tipas?: { name: string }[];
  kvietimo_kodas?: string;
  priemones_kodas?: string;
  priemones_tikslas?: string;
  remiama_veikla?: string;
  finansuojamos_veiklos?: string;
  galimi_pareiskejai?: string;
  tinkami_pareiskejai?: string;
  reikalingi_partneriai?: string;
  tinkami_partneriai?: string;
  tinkamos_islaidos?: string;
  paraisku_pateikimo_budas?: string;
  daugiau_informacijos?: { title?: string; url?: string } | null;
  seo?: { article_modified_time?: string };
}

// Nuxt serializes payloads with devalue: a flat array where objects and arrays hold indexes into that array.
function hydrate(nodes: unknown[]): unknown {
  const cache = new Map<number, unknown>();
  const get = (i: number): unknown => {
    if (i === -1) return undefined;
    if (cache.has(i)) return cache.get(i);
    const n = nodes[i];
    if (Array.isArray(n)) {
      if (typeof n[0] === "string" && /^(ShallowReactive|Reactive|Ref|ShallowRef)$/.test(n[0])) {
        const v = get(n[1] as number);
        cache.set(i, v);
        return v;
      }
      if (typeof n[0] === "string" && /^(Set|Map|Date|NuxtError|EmptyShallowRef|EmptyRef)$/.test(n[0])) {
        cache.set(i, null);
        return null;
      }
      const arr: unknown[] = [];
      cache.set(i, arr);
      for (const j of n as number[]) arr.push(get(j));
      return arr;
    }
    if (n && typeof n === "object") {
      const o: Record<string, unknown> = {};
      cache.set(i, o);
      for (const [k, j] of Object.entries(n as Record<string, number>)) o[k] = get(j);
      return o;
    }
    cache.set(i, n);
    return n;
  };
  return get(0);
}

async function detail(path: string): Promise<Detail | null> {
  const res = await fetch(`${SITE}${path}_payload.json`, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.startsWith("[")) return null;
  const root = hydrate(JSON.parse(text)) as { data?: Record<string, { status?: boolean; data?: Detail }> };
  const entry = Object.values(root.data ?? {})[0];
  return entry?.status && entry.data ? entry.data : null;
}

// "YYYY-MM-DD HH:MM:SS" in Lithuanian local time; stored as-is with a Z suffix like the esinvesticijos adapter.
function toIsoLt(value: string | null | undefined): string | null {
  const m = value?.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00.000Z` : null;
}

function plain(html: string | null | undefined): string {
  return html ? stripHtml(html).replace(/\n{2,}/g, "\n").trim() : "";
}

function fundingTypes(text: string): Grant["funding_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["funding_types"][number]>();
  if (/paskol/.test(t)) out.add("loan");
  if (/garantij/.test(t)) out.add("guarantee");
  if (/rizikos kapital|investicij(a|os) į kapital|akcij/.test(t)) out.add("equity");
  if (/čeki/.test(t)) out.add("voucher");
  if (/ikiprekybin/.test(t)) out.add("procurement");
  if (/dotacij|subsidij|de minimis|kompensuo|finansavim/.test(t) || out.size === 0) out.add("grant");
  return [...out];
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/startuol/.test(t)) out.add("startup");
  if (/mvį|labai maž|smulk|vidutin/.test(t)) out.add("sme");
  if (/įmon|verslo subjekt|juridin|uab|bendrov/.test(t)) out.add("company");
  if (/universitet|moksl|tyrim|kolegij|institut/.test(t)) out.add("research_org");
  if (/viešoji įstaiga|viešasis sektor|savivaldyb|valstybės institucij|perkanči|biudžetin/.test(t)) out.add("public_body");
  if (/asociacij|nevyriausybin/.test(t)) out.add("ngo");
  return [...out];
}

function normalize(r: Row, d: Detail | null): Grant {
  const slug = r.url.replace(/\/+$/, "").split("/").pop() || String(r.id);
  const opens = toIsoLt(d?.galioja_nuo);
  const closes = toIsoLt(d?.galioja_iki ?? r.galioja_iki);
  const now = new Date().toISOString();
  const busena = d?.busena ?? r.busena;
  const status: Grant["status"] = busena === "negaliojantis" || busena === "sustabdytas" ? "closed" : closes && closes < now ? "closed" : busena === "planuojamas" || (opens && opens > now) ? "forthcoming" : busena === "galiojantis" ? "open" : "unknown";
  const types = (d?.finansavimo_tipas ?? []).map((t) => t.name).join(", ");
  const applicants = plain(d?.tinkami_pareiskejai) || plain(d?.galimi_pareiskejai);
  const share = d?.didziausia_galima_finansuojamoji_dalis_proc;
  const min = num(d?.min_finansavimas);
  const max = num(d?.max_finansavimas);
  const budget = num(d?.suma ?? r.suma);
  const more = d?.daugiau_informacijos?.url;
  const source = (r.terms ?? []).find((t) => t.slug === "finansavimo-saltinis")?.items.map((i) => i.name).join(", ") ?? "";
  const summary = [
    d?.kvietimo_kodas && `Kvietimo kodas: ${d.kvietimo_kodas}`,
    d?.priemones_kodas && `Priemonės kodas: ${d.priemones_kodas}`,
    source && `Finansavimo šaltinis: ${source}`,
    types && `Finansavimo tipas: ${types}`,
    plain(d?.priemones_tikslas) && `Tikslas: ${plain(d?.priemones_tikslas)}`,
    plain(d?.remiama_veikla) && `Remiama veikla: ${plain(d?.remiama_veikla)}`,
    plain(d?.finansuojamos_veiklos) && `Finansuojamos veiklos: ${plain(d?.finansuojamos_veiklos)}`,
    applicants && `Tinkami pareiškėjai: ${applicants}`,
    d?.reikalingi_partneriai && `Reikalingi partneriai: ${d.reikalingi_partneriai}`,
    plain(d?.tinkami_partneriai) && `Tinkami partneriai: ${plain(d?.tinkami_partneriai)}`,
    budget !== null && `Kvietimui skirta suma: ${budget} EUR`,
    min !== null && `Min. finansavimas: ${min} EUR`,
    max !== null && `Max. finansavimas: ${max} EUR`,
    (share || d?.didziausia_galima_finansuojamoji_dalis_pastabos) && `Didžiausia finansuojamoji dalis: ${[share && `${share} proc.`, d?.didziausia_galima_finansuojamoji_dalis_pastabos].filter(Boolean).join(" ")}`,
    (opens || closes) && `Galioja: ${d?.galioja_nuo ?? ""} - ${d?.galioja_iki ?? r.galioja_iki ?? ""}`,
    (d?.galiojimo_salyga || r.galiojimo_salyga) && `Galiojimo sąlyga: ${d?.galiojimo_salyga || r.galiojimo_salyga}`,
    plain(d?.tinkamos_islaidos) && `Tinkamos išlaidos: ${plain(d?.tinkamos_islaidos)}`,
    plain(d?.paraisku_pateikimo_budas) && `Paraiškų pateikimo būdas: ${plain(d?.paraisku_pateikimo_budas)}`,
    more && `Daugiau informacijos: ${more}`,
    r.redirect_url && `Kvietimo puslapis: ${r.redirect_url}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `lt_inovacijuagentura:${slug}`,
    source: "lt_inovacijuagentura",
    source_id: slug,
    // Rows with redirect_url have no page of their own on the agency site (the frontend forwards to the target), so
    // the funding list is the closest official page; the target URL stays in the summary.
    source_url: r.redirect_url ? `${SITE}/finansavimas/` : `${SITE}${r.url}`,
    source_license: LICENSE,
    title: r.title.trim(),
    title_lang: "lt",
    summary: summary || null,
    funder_name: "Inovacijų agentūra",
    funder_level: "national",
    country: "LT",
    regions: [],
    funding_types: fundingTypes(`${r.title} ${types}`),
    beneficiary_types: beneficiaryTypes(`${r.title} ${applicants}`),
    sectors: [],
    amount_min: min,
    amount_max: max,
    budget_total: budget,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: toIso(d?.seo?.article_modified_time),
  };
}

export const ltInovacijuagentura: Source = {
  id: "lt_inovacijuagentura",
  license: LICENSE,
  start() {
    return JSON.stringify({ busena: STATUSES[0], page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const res = await fetch(API, {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ zodis: "", rikiavimas: "default", busena: c.busena, puslapis: c.page, kategorijos: [] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Inovacijų agentūra list (${c.busena}, page ${c.page})`);
    const { list, total } = (await res.json()) as { list: Row[]; total: number };
    const rows = list.filter((r) => r.url && r.title);
    // Expired calls keep their list data only; open and planned ones get the detail payload.
    const details = c.busena === "negaliojantis" ? rows.map(() => null) : await mapLimit(rows, 2, (r) => detail(r.url).catch(() => null));
    const grants = rows.map((r, i) => normalize(r, details[i] ?? null));
    const nextStatus = STATUSES[STATUSES.indexOf(c.busena) + 1];
    const next: Cursor | null = rows.length > 0 && c.page * 12 < total ? { busena: c.busena, page: c.page + 1 } : nextStatus ? { busena: nextStatus, page: 1 } : null;
    return {
      grants,
      raws: rows.map((r, i) => ({ source_id: grants[i]!.source_id, payload: { row: r, detail: details[i] ? { ...details[i], seo: undefined } : null } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
