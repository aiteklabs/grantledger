import type { Grant } from "@grantledger/schema";
import { fetchJson } from "../util";
import type { Page, Source } from "./types";

// Norway, Innovasjon Norge: grants, loans and guarantees for companies. www.innovasjonnorge.no sits behind a
// Cloudflare managed challenge that blocks every non-browser client, but the site is rendered from a public Sanity
// dataset (project loal7n8w, dataset inno-prod), so the service pages are read through the Sanity content API.
const SITE = "https://www.innovasjonnorge.no";
const API = "https://loal7n8w.apicdn.sanity.io/v2023-01-01/data/query/inno-prod";
const LICENSE = "Innovasjon Norge public service information";
const QUERY = `*[_type == "service" && language == "nb" && defined(slug.current)] | order(slug.current asc) {
  _id, title, "slug": slug.current, excerpt, publishedAt, lastPublishedAt, _updatedAt,
  keyPoints[]{title, text},
  "categories": service_categories[]->title, "themes": theme_categories[]->title,
  serviceInfo[]{heading, content}, "extra": additionalInformation[]->{title, content}
}`;

interface Block { _type?: string; style?: string; listItem?: string; children?: { text?: string }[] }
interface Section { heading?: string | null; title?: string | null; content?: Block[] | null }
interface Service {
  _id: string;
  title?: string | null;
  slug: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  lastPublishedAt?: string | null;
  _updatedAt?: string | null;
  keyPoints?: { title?: string | null; text?: string | null }[] | null;
  categories?: (string | null)[] | null;
  themes?: (string | null)[] | null;
  serviceInfo?: Section[] | null;
  extra?: Section[] | null;
}

const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/­/g, "").replace(/\s+/g, " ").trim();
}

// Portable Text to plain text: one line per block, bullets prefixed with "- ".
function plain(blocks: Block[] | null | undefined): string {
  return (blocks ?? [])
    .filter((b) => b._type === "block")
    .map((b) => `${b.listItem ? "- " : ""}${clean((b.children ?? []).map((c) => c.text ?? "").join(""))}`)
    .filter((line) => line !== "- " && line !== "")
    .join("\n");
}

function keyPoint(s: Service, label: RegExp): string {
  return clean(s.keyPoints?.find((k) => label.test(clean(k.title)))?.text);
}

// "26. juni 2026" -> ISO; a date without a year is left unparsed (the text still goes to the summary).
function isoNo(text: string): string | null {
  const m = text.match(/(\d{1,2})\.\s*(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})/i);
  if (!m) return null;
  return `${m[3]}-${String(MONTHS.indexOf(m[2]!.toLowerCase()) + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}T23:59:59.000Z`;
}

// "Inntil 10 millioner kroner", "Maks 150 000 kroner", "Minimum 1 million kroner", "50-500 millioner kroner".
// Percentages ("Inntil 50 % av kostnadene") carry no amount; in a range the "millioner" unit covers both ends.
function amounts(text: string): { min: number | null; max: number | null } {
  const t = text.replace(/\([^)]*\)/g, " ");
  if (/%|prosent/i.test(t) && !/kroner|\bkr\b/i.test(t)) return { min: null, max: null };
  const millions = /million/i.test(t);
  const nums: number[] = [];
  for (const m of t.matchAll(/(\d{1,3}(?:[ \u00a0]\d{3})+|\d+(?:,\d+)?)\s*(%|prosent)?/gi)) {
    if (m[2]) continue;
    const n = Number(m[1]!.replace(/[ \u00a0]/g, "").replace(",", "."));
    if (!Number.isFinite(n)) continue;
    nums.push(millions && n < 1000 ? n * 1_000_000 : n);
  }
  if (!nums.length) return { min: null, max: null };
  if (nums.length >= 2 && /\d\s*(-|–|til)\s*\d/.test(t)) return { min: Math.min(...nums), max: Math.max(...nums) };
  if (/^\s*(minimum|min\.|minst|fra)/i.test(t)) return { min: nums[0]!, max: null };
  return { min: null, max: nums[0]! };
}

function fundingTypes(type: string, categories: string[]): Grant["funding_types"] {
  const t = `${type} ${categories.join(" ")}`.toLowerCase();
  const out = new Set<Grant["funding_types"][number]>();
  if (/lån/.test(t)) out.add("loan");
  if (/garanti/.test(t)) out.add("guarantee");
  if (/egenkapital|investeringsfond/.test(t)) out.add("equity");
  if (/tilskudd|utlysning/.test(t) || out.size === 0) out.add("grant");
  return [...out];
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/oppstart|gründer|grundere|student|etablerer/.test(t)) out.add("startup");
  if (/små og mellomstore|smb\b|1-99 ansatte/.test(t)) out.add("sme");
  if (/bedrift|selskap|foretak|næring|bønder|bonde|landbrukseiendom|skogeier|fisker|reineier|reiselivs|konsern|klynge/.test(t)) out.add("company");
  if (/universitet|høgskole|høyskole|forskningsinstitu|fou-miljø/.test(t)) out.add("research_org");
  if (/kommune|fylkeskommune|offentlig|reisemål/.test(t)) out.add("public_body");
  if (/enkeltperson|privatperson/.test(t)) out.add("individual");
  if (/organisasjon|forening|stiftelse/.test(t)) out.add("ngo");
  return out.size ? [...out] : ["company"];
}

// Only financing services are opportunities; advisory, export programmes and courses on the same listing are not.
function isFinancing(s: Service, type: string): boolean {
  const categories = (s.categories ?? []).map(clean);
  return categories.includes("Finansiering") || (/tilskudd|lån|garanti|utlysning/i.test(type) && !/rådgivning/i.test(type));
}

function normalize(s: Service): Grant {
  const slug = s.slug.replace(/^\/tjeneste\//, "");
  const type = keyPoint(s, /^Type tjeneste/i);
  const audience = keyPoint(s, /^Målgruppe/i);
  const deadline = keyPoint(s, /^(Søknadsfrist|Påmeldingsfrist)/i);
  const howMuch = keyPoint(s, /^Hvor mye/i);
  const categories = (s.categories ?? []).map(clean).filter(Boolean);
  const themes = (s.themes ?? []).map(clean).filter(Boolean);
  const sections = [...(s.serviceInfo ?? []), ...(s.extra ?? [])].map((x) => ({ heading: clean(x.heading ?? x.title), text: plain(x.content) })).filter((x) => x.text);
  const who = sections.find((x) => /^for hvem/i.test(x.heading))?.text ?? "";
  const amountSection = sections.find((x) => /beløp/i.test(x.heading))?.text ?? "";
  const closes = isoNo(deadline);
  const now = new Date().toISOString();
  const status: Grant["status"] = /utløpt|avsluttet|stengt/i.test(deadline) ? "closed" : closes && closes < now ? "closed" : "open";
  const parsed = amounts(howMuch || amountSection.split("\n")[0] || "");
  return {
    id: `no_innovasjonnorge:${slug}`,
    source: "no_innovasjonnorge",
    source_id: slug,
    source_url: `${SITE}${s.slug}`,
    source_license: LICENSE,
    title: clean(s.title) || slug,
    title_lang: "nb",
    summary: [
      clean(s.excerpt),
      (s.keyPoints ?? []).map((k) => `${clean(k.title)}: ${clean(k.text)}`).filter((l) => !l.startsWith(":") && !l.endsWith(": ")).join("\n"),
      ...sections.map((x) => (x.heading ? `${x.heading}\n${x.text}` : x.text)),
    ].filter(Boolean).join("\n\n").slice(0, 20000) || null,
    funder_name: "Innovasjon Norge",
    funder_level: "national",
    country: "NO",
    regions: [],
    funding_types: fundingTypes(type, categories),
    beneficiary_types: beneficiaryTypes(audience || who),
    sectors: themes,
    amount_min: parsed.min,
    amount_max: parsed.max,
    budget_total: null,
    currency: "NOK",
    status,
    opens_at: null,
    closes_at: closes,
    documents: [],
    source_updated_at: s.lastPublishedAt ?? s._updatedAt ?? null,
  };
}

export const noInnovasjonnorge: Source = {
  id: "no_innovasjonnorge",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(): Promise<Page> {
    const data = await fetchJson<{ result?: Service[] }>(`${API}?query=${encodeURIComponent(QUERY)}`, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" },
    });
    const services = (data.result ?? []).filter((s) => isFinancing(s, keyPoint(s, /^Type tjeneste/i)));
    const grants = services.map(normalize);
    return { grants, raws: services.map((s) => ({ source_id: s.slug.replace(/^\/tjeneste\//, ""), payload: s })), next: null };
  },
};
