import type { Grant } from "@grantledger/schema";
import { decodeEntities, dmyToIso, fetchHtml, fetchJson, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Cyprus, Funding Programmes Portal (Directorate General Growth, Ministry of Finance): calls of the national grant
// schemes, the EU co-financed programmes, the Recovery and Resilience Plan, the financial instruments and the EEA and
// Norway Grants. The "EU Competitive Programmes" category (about 1,270 calls copied from the EU portal) is left out.
// The WordPress REST list (/wp-json/wp/v2/calls filtered by program-major-category, about 40 calls per language)
// gives only id, title, link and modification time: the status badge, the dates, the budget and the beneficiaries
// are on the server-rendered call page, so every listed call needs its page to learn whether it is open. English
// pages are read first; a Greek call is read only when no English page points at it (hreflang), so each call gives
// one record, in English when a translation exists. robots.txt asks for Crawl-delay 20: after the two list requests
// every fetchPage call makes one page request, with the pause before it (about 45 requests, 15 minutes per crawl).
const SITE = "https://www.fundingprogrammesportal.gov.cy";
const LICENSE = "Funding Programmes Portal public call information (Republic of Cyprus, Directorate General Growth, Ministry of Finance)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CRAWL_DELAY_MS = 20_000;
// program-major-category term ids, per language: co-financed, national schemes, recovery plan, financial
// instruments, EEA and Norway Grants. SKIP holds the EU competitive programmes term of each language.
const CATEGORIES = { en: "118,119,410,120,442", el: "113,116,409,114,443" } as const;
const SKIP = [117, 112];
const FIELDS = "id,link,modified_gmt,title,program-major-category";

type Lang = keyof typeof CATEGORIES;
interface Item { id: number; lang: Lang; link: string; title: string; modified: string | null }
interface Post { id: number; link: string; modified_gmt?: string; title?: { rendered?: string }; "program-major-category"?: number[] }
interface Block { label: string; html: string; text: string }

// Field labels of the call page in both languages.
const LABELS = {
  opens: /^(Call Opening Date|Έναρξη Υποβολής Προτάσεων)/i,
  closes: /^(Call Closing Date|Λήξη Υποβολής Προτάσεων)/i,
  budget: /^(Call Total Budget|Συνολικός Προϋπολογισμός)/i,
  eligible: /^(Eligibility for Participation|Δικαιούχοι)/i,
  programme: /^(Programme Description|Περιγραφή Προγράμματος)/i,
  contact: /^(National Contact Point|Εθνικό Σημείο Επαφής)/i,
  call: /^(Call|Πρόσκληση\/Προκήρυξη)$/i,
};

const ORGANISATION = /Ministry|Department|Foundation|Authority|Service|Directorate|Agency|Unit|Fund|Organisation|Υπουργείο|Υφυπουργείο|Τμήμα|Ίδρυμα|Αρχή|Υπηρεσία|Διεύθυνση|Μονάδα|Οργανισμός|Ταμείο/;

const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
const clean = (html: string): string => stripHtml(html.replace(/\s+/g, " ")).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();
const key = (url: string): string => url.toLowerCase().replace(/\/+$/, "");

async function list(lang: Lang): Promise<Item[]> {
  const posts = await fetchJson<Post[]>(`${SITE}${lang === "en" ? "/en" : ""}/wp-json/wp/v2/calls?program-major-category=${CATEGORIES[lang]}&per_page=100&_fields=${FIELDS}`, { headers: UA });
  return posts
    .filter((p) => p.id && p.link && !(p["program-major-category"] ?? []).some((c) => SKIP.includes(c)))
    .map((p) => ({ id: p.id, lang, link: p.link, title: decodeEntities(p.title?.rendered ?? "").replace(/\s+/g, " ").trim(), modified: toIso(p.modified_gmt ? `${p.modified_gmt}Z` : null) }));
}

function blocks(html: string): Block[] {
  const out: Block[] = [];
  for (const m of html.matchAll(/<div class="item_programs">\s*<h3 class="heading_calls">([\s\S]*?)<\/h3>([\s\S]*?)(?=<div class="item_programs">|<!-- mfn_hook_content_after|<footer)/g)) {
    // Links keep their address: "Website (https://...)".
    const body = (m[2] as string).replace(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_all, href: string, label: string) => `${label} (${href}) `);
    out.push({ label: clean(m[1] as string), html: m[2] as string, text: clean(body) });
  }
  return out;
}

// "€2.400.000", "2.400.000,00", "€ 1,5 million", "€600 χιλ.".
function money(text: string): number | null {
  const m = text.match(/\d[\d.,]*/);
  if (!m) return null;
  let s = m[0].replace(/[.,]+$/, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else if (/[.,]\d{1,2}$/.test(s)) s = s.slice(0, s.search(/[.,]\d{1,2}$/)).replace(/[.,]/g, "") + "." + s.slice(s.search(/[.,]\d{1,2}$/) + 1);
  else s = s.replace(/[.,]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 14).toLowerCase();
  return Math.round(n * (/^\s*(million|mio|εκατ|εκ\.)/.test(unit) ? 1_000_000 : /^\s*(thousand|χιλ)/.test(unit) ? 1_000 : 1));
}

function beneficiaryTypes(s: string): Grant["beneficiary_types"] {
  const t = s.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/small and medium|smes|μικρομεσαί|μμε/.test(t)) out.add("sme");
  if (/businesses|large enterprises|private bodies|legal entities(?! under)|state-owned|services providers|financial institutions|farmers, |fishermen|επιχειρήσεις|ιδιωτικοί φορείς|νομικά πρόσωπα(?! δημοσίου)|γεωργοί|αλιείς/.test(t)) out.add("company");
  if (/central government|local authorit|public law|semi-governmental|parliamentary|κεντρική κυβέρνηση|τοπικές αρχές|τοπικών αρχών|δημοσίου δικαίου|ημικρατικ/.test(t)) out.add("public_body");
  if (/ngos|non profit|associations|trade unions|consumer organisations|μκο|μη κερδοσκοπικ|σύνδεσμοι|συντεχνίες/.test(t)) out.add("ngo");
  if (/research|educational institutions|ερευν|εκπαιδευτικά ιδρύματα/.test(t)) out.add("research_org");
  if (/natual person|natural person|citizen|unemployed|employees|youth|disabled|women|vulnerable|φυσικ(ά|ό) πρόσωπ|πολίτ|άνεργ|εργοδοτούμεν|νέοι/.test(t)) out.add("individual");
  if (/chambers|training centres|other beneficiaries|international organisations|επιμελητήρια|άλλοι δικαιούχοι/.test(t)) out.add("other");
  return [...out];
}

function normalize(item: Item, html: string): Grant {
  const badge = html.match(/<div class="call_status_badge (\w+)">([\s\S]*?)<\/div>/);
  const all = blocks(html);
  const find = (re: RegExp) => all.find((b) => re.test(b.label));
  const opens = dmyToIso(find(LABELS.opens)?.text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0]);
  const closeDay = dmyToIso(find(LABELS.closes)?.text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0]);
  const closes = closeDay ? closeDay.replace("T00:00:00.000Z", "T23:59:59.000Z") : null;
  const now = new Date().toISOString();
  const status: Grant["status"] = badge?.[1] === "closed" || (closes !== null && closes < now) ? "closed" : badge?.[1] === "future" || (opens !== null && opens > now) ? "forthcoming" : badge?.[1] === "open" ? "open" : "unknown";
  const summary = [
    badge && `Status: ${clean(badge[2] as string)}`,
    ...all.filter((b) => b.text && !LABELS.call.test(b.label)).map((b) => `${b.label}: ${LABELS.programme.test(b.label) ? b.text.slice(0, 800) : b.text}`),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  // An English page can still carry a Greek text: the language follows the letters.
  const greek = (summary.match(/[Ͱ-Ͽ]/g) ?? []).length;
  const latin = (summary.match(/[A-Za-z]/g) ?? []).length;
  const documents: Grant["documents"] = [];
  for (const b of all) {
    for (const m of b.html.matchAll(/<a\b[^>]*href="(https:\/\/[^"]+\.(?:pdf|docx?|xlsx?|zip))"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = (m[1] as string).replace(/ /g, "%20");
      if (!documents.some((d) => d.url === url)) documents.push({ title: clean(m[2] as string) || b.label, url });
    }
  }
  // The contact point names the managing body in bold, but sometimes a person or an address: only a bold text that
  // reads as an organisation is taken as the funder.
  const contact = [...(find(LABELS.contact)?.html ?? "").matchAll(/<strong>([^<:@]{3,120})<\/strong>/g)].map((m) => m[1] as string).find((s) => ORGANISATION.test(s));
  const title = item.title || find(LABELS.call)?.text || String(item.id);
  return {
    id: `cy_funding_portal:${item.id}`,
    source: "cy_funding_portal",
    source_id: String(item.id),
    source_url: item.link,
    source_license: LICENSE,
    title,
    title_lang: greek > latin ? "el" : "en",
    summary: summary || null,
    funder_name: contact ? clean(contact) : null,
    funder_level: "national",
    country: "CY",
    regions: [],
    // The first field is the programme category; the financial instruments are loans, guarantees or equity.
    funding_types: /financial instruments|χρηματοοικονομικά εργαλεία/i.test(all[0]?.text ?? "") ? ["other"] : ["grant"],
    beneficiary_types: beneficiaryTypes(find(LABELS.eligible)?.text ?? ""),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: money(find(LABELS.budget)?.text ?? ""),
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents,
    source_updated_at: item.modified,
  };
}

export const cyFundingPortal: Source = {
  id: "cy_funding_portal",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the two REST lists, no records yet. After that the cursor is the JSON queue of calls still to
  // read (English first, then Greek) and each call reads one page.
  async fetchPage(cursor): Promise<Page> {
    if (cursor === "start") {
      const english = await list("en");
      if (english.length === 0) throw new Error("Cyprus Funding Programmes Portal: the REST list returned no calls (changed categories or blocked?)");
      await pause();
      const greek = await list("el");
      return { grants: [], raws: [], next: JSON.stringify([...english, ...greek]) };
    }
    const [item, ...rest] = JSON.parse(cursor) as Item[];
    if (!item) return { grants: [], raws: [], next: null };
    await pause();
    const html = await fetchHtml(item.link, UA);
    if (!/class="item_programs"/.test(html)) throw new Error(`Cyprus Funding Programmes Portal: no call fields on ${item.link} (bot challenge or changed markup?)`);
    // The Greek version of an English call is taken off the queue.
    const greekUrl = item.lang === "en" ? html.match(/<link rel="alternate" hreflang="el" href="([^"]+)"/)?.[1] : undefined;
    const queue = greekUrl ? rest.filter((r) => !(r.lang === "el" && key(r.link) === key(greekUrl))) : rest;
    const grant = normalize(item, html);
    return { grants: [grant], raws: [{ source_id: grant.source_id, payload: { ...item, summary: grant.summary } }], next: queue.length ? JSON.stringify(queue) : null };
  },
};
