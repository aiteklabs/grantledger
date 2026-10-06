import type { Grant } from "@grantledger/schema";
import { decodeEntities, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Romania, Ministry of European Investments and Projects (mfe.gov.ro): Atom feed of call announcements, 300 per page.
// The HTML site sits behind a browser challenge; the feed is open. Announcements carry no structured dates or budgets.
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

function normalize(en: Entry): Grant {
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
    status: "unknown",
    opens_at: en.published,
    closes_at: null,
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
