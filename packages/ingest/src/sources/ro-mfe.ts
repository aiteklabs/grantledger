import type { Grant } from "@grantledger/schema";
import { decodeEntities, londonIso, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Romania, Ministry of European Investments and Projects (mfe.gov.ro): Atom feed of call announcements, 300 per page.
// The HTML site sits behind a browser challenge; the feed is open. Announcements carry no structured dates or budgets.
// A call launch states its submission window in one sentence ("Sistemul informatic MySMIS2021 se deschide în data de
// 16.11.2026, ora 16.00, până în data de 15.01.2027, ora 16.00"). Only those announcements get dates; the rest of the
// feed (consultations, result lists, clarifications) stays without dates and so never enters the ledger.
const FEED = "https://mfe.gov.ro/category/ultimele-apeluri-prima-pagina/feed/";
const LICENSE = "MIPE public announcements (mfe.gov.ro)";
const MAX_PAGES = 3;

interface Entry { id: string; title: string; link: string; published: string | null; updated: string | null; categories: string[]; content: string }

function parseAtom(xml: string): Entry[] {
  const out: Entry[] = [];
  for (const e of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const pick = (tag: string) => decodeEntities((e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "").replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")).trim();
    const link = e.match(/<link rel="alternate"[^>]*href="([^"]+)"/)?.[1] ?? "";
    if (!link) continue;
    out.push({
      id: pick("id") || link,
      title: pick("title"),
      link,
      published: pick("published") || null,
      updated: pick("updated") || null,
      categories: [...e.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => decodeEntities(m[1]!)),
      content: stripHtml(decodeEntities(pick("content") || pick("summary"))).slice(0, 8000),
    });
  }
  return out;
}

const DATE = String.raw`(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s*ora\s+(\d{1,2})[.:](\d{2}))?`;
const WINDOW = new RegExp(String.raw`se deschide\s+[îȋi]n\s+data\s+de\s+${DATE}[\s\S]{0,60}?p[âa]n[ăa]\s+[îȋi]n\s+data\s+de\s+${DATE}`, "i");

// Romanian wall-clock time as ISO in UTC. Romania is two hours ahead of the UK all year.
function roIso(day: string, month: string, year: string, hour: string | undefined, minute: string | undefined, fallbackHour: number, fallbackMinute: number): string {
  return londonIso(Number(year), Number(month) - 1, Number(day), (hour ? Number(hour) : fallbackHour) - 2, minute ? Number(minute) : fallbackMinute);
}

function normalize(en: Entry): Grant {
  const w = en.content.match(WINDOW);
  const opens = w ? roIso(w[1]!, w[2]!, w[3]!, w[4], w[5], 0, 0) : en.published;
  const closes = w ? roIso(w[6]!, w[7]!, w[8]!, w[9], w[10], 23, 59) : null;
  const programme = en.categories.find((c) => /Anun.uri (AM)?[A-Z]+ 2021-2027|PNRR/.test(c)) ?? en.categories[0] ?? "";
  const text = `${en.title} ${en.content}`.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (/imm|întreprinderi mici/.test(text)) bens.add("sme");
  if (/întreprinder|societ|firm|operatori economici/.test(text)) bens.add("company");
  if (/autorit|primării|uat|consili/.test(text)) bens.add("public_body");
  if (/ong|asocia/.test(text)) bens.add("ngo");
  if (/universit|cercetare/.test(text)) bens.add("research_org");
  const idBase = en.id.replace(/^https?:\/\//, "").replace(/[^\w.=?-]+/g, "_").slice(0, 120);
  return {
    id: `ro_mfe:${idBase}`,
    source: "ro_mfe",
    source_id: idBase,
    source_url: en.link,
    source_license: LICENSE,
    title: en.title || en.link,
    title_lang: "ro",
    summary: [programme ? `Program: ${programme.replace(/^Anun.uri\s*/, "")}` : "", en.content].filter(Boolean).join("\n\n") || null,
    funder_name: programme.replace(/^Anun.uri\s*/, "") || "MIPE",
    funder_level: "national",
    country: "RO",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "RON",
    status: w ? statusFromDates(opens, closes) : "unknown",
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: en.updated,
  };
}

export const roMfe: Source = {
  id: "ro_mfe",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetch(`${FEED}${page > 1 ? `?paged=${page}` : ""}`, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" } });
    if (res.status === 404) return { grants: [], raws: [], next: null };
    if (!res.ok) throw new Error(`HTTP ${res.status} for MIPE feed page ${page}`);
    const entries = parseAtom(await res.text());
    const grants = entries.map(normalize);
    return { grants, raws: entries.map((e, i) => ({ source_id: grants[i]!.source_id, payload: { ...e, content: e.content.slice(0, 1500) } })), next: entries.length === 300 && page < MAX_PAGES ? String(page + 1) : null };
  },
};
