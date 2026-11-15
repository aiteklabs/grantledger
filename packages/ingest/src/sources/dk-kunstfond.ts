import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Denmark, Statens Kunstfond (Danish Arts Foundation): the "Søg tilskud" list is one server-rendered TYPO3 page with
// every open pool (title, teaser, art form, deadline); each pool page adds eligibility and budget accordions.
// No API, feed or sitemap exists (sitemap.xml and robots.txt answer 404, seen 2026-09-29).
const SITE = "https://www.kunst.dk";
const LIST_URL = `${SITE}/for-ansoegere/soeg-tilskud`;
const LICENSE = "Statens Kunstfond public grant pool information";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "da-DK,da;q=0.9,en;q=0.8" };
// Pool pages fetched per fetchPage call; the list itself is re-read each call.
const BATCH = 15;

interface Cursor { offset: number }

interface ListItem { slug: string; title: string; teaser: string; areas: string; deadline: string }

// "02.02.2027, kl. 14:00" (Copenhagen time) -> ISO; a plain "02.02.2027" is taken as end of day.
function daDate(v: string): string | null {
  const m = v.match(/(\d{2})\.(\d{2})\.(\d{4})(?:,?\s*kl\.?\s*(\d{1,2})[:.](\d{2}))?/);
  if (!m) return null;
  const local = `${m[3]}-${m[2]}-${m[1]}T${m[4] ? `${m[4].padStart(2, "0")}:${m[5]}:00` : "23:59:59"}`;
  const d = new Date(`${local}Z`);
  // Denmark is UTC+1 in winter and UTC+2 in summer (last Sunday of March to last Sunday of October).
  const year = d.getUTCFullYear();
  const lastSunday = (month: number) => { const end = new Date(Date.UTC(year, month + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const summer = (month > 2 && month < 9) || (month === 2 && day >= lastSunday(2)) || (month === 9 && day < lastSunday(9));
  return new Date(d.getTime() - (summer ? 2 : 1) * 3600_000).toISOString();
}

function parseList(html: string): ListItem[] {
  const out: ListItem[] = [];
  for (const row of html.split(/<div class="row zebra-background mb-3">/).slice(1)) {
    const link = row.match(/<h2[^>]*>\s*<a href="\/for-ansoegere\/soeg-tilskud\/([^"]+)">([\s\S]*?)<\/a>/);
    if (!link) continue;
    const text = stripHtml(row);
    out.push({
      slug: link[1] as string,
      title: stripHtml(link[2] as string).trim(),
      teaser: stripHtml(row.match(/<p class="w-sm-70 pb-4">([\s\S]*?)<\/p>\s*<\/p>/)?.[1] ?? "").trim(),
      areas: stripHtml(row.match(/<p class="mb-3 mb-sm-0 w-sm-70 fs-smalltext">([\s\S]*?)<\/p>/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
      deadline: text.match(/Frist:\s*([^\n]+)/)?.[1]?.trim() ?? "",
    });
  }
  return out;
}

interface Detail { note: string; sections: Record<string, string> }

function parseDetail(html: string): Detail {
  const sections: Record<string, string> = {};
  for (const block of html.match(/<div class="accordion__container[\s\S]*?<div class="accordion__content">[\s\S]*?<\/div>\s*<\/div>/g) ?? []) {
    const title = stripHtml(block.match(/<h3 class="accordion__title">([\s\S]*?)<\/h3>/)?.[1] ?? "").trim();
    const content = stripHtml(block.match(/<div class="accordion__content">([\s\S]*?)<\/div>\s*<\/div>$/)?.[1] ?? "").trim();
    if (title && content) sections[title] = content;
  }
  const note = stripHtml(html.match(/<div class="my-4 fs-smalltext underline-anchors">([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/^Note:\s*/, "").trim();
  return { note, sections };
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const who = text.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>();
  if (/kunstner|forfatter|oversætter|komponist|musiker|enkeltperson|privatperson|arkitekt|designer|illustrator|kurator|skabende|udøvende/.test(who)) bens.add("individual");
  if (/forening|organisation|netværk|ensembler|orkestre|musikgrupper|bands|kor\b|festival|kunsthal|udstillingssted/.test(who)) bens.add("ngo");
  if (/virksomhed|forlag|galleri|spillested|producent|tegnestue|arrangør|aktører/.test(who)) bens.add("company");
  if (/kommune|region|skole|dagtilbud|institution|bibliotek|museum|offentlig|uddannelse/.test(who)) bens.add("public_body");
  return [...bens];
}

function normalize(item: ListItem, detail: Detail): Grant {
  const closes = daDate(item.deadline);
  const who = detail.sections["Hvem kan søge?"] ?? "";
  const money = detail.sections["Økonomi"] ?? "";
  // "samlet ramme på 21,8 mio. kr." -> 21 800 000; "op til 100.000 kr." -> 100 000.
  const frame = money.match(/ramme på\s*([\d.,]+)\s*mio\.?\s*kr/i)?.[1];
  const max = money.match(/(?:op til|maksimalt|højst)\s*([\d.]{4,})\s*(?:kr|kroner)/i)?.[1];
  const areas = item.areas.split(/\s*,\s*/).filter(Boolean);
  return {
    id: `dk_kunstfond:${item.slug}`,
    source: "dk_kunstfond",
    source_id: item.slug,
    source_url: `${LIST_URL}/${item.slug}`,
    source_license: LICENSE,
    title: item.title,
    title_lang: "da",
    summary: [item.teaser, areas.length ? `Kunstområde: ${areas.join(", ")}` : "", item.deadline ? `Frist: ${item.deadline}` : "", detail.note, who ? `Hvem kan søge?\n${who}` : "", money ? `Økonomi\n${money}` : ""].filter(Boolean).join("\n\n").replace(/\u00a0/g, " ").replace(/\n[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") || null,
    funder_name: "Statens Kunstfond",
    funder_level: "national",
    country: "DK",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(`${item.teaser} ${who}`),
    sectors: areas,
    amount_min: null,
    amount_max: max ? num(max.replace(/\./g, "")) : null,
    budget_total: frame ? Math.round((num(frame.replace(/\./g, "").replace(",", ".")) ?? 0) * 1_000_000) || null : null,
    currency: "DKK",
    // "Løbende" (rolling) pools have no deadline but are open for applications.
    status: /løbende/i.test(item.deadline) ? "open" : statusFromDates(null, closes),
    opens_at: null,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const dkKunstfond: Source = {
  id: "dk_kunstfond",
  license: LICENSE,
  start() {
    return JSON.stringify({ offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const items = parseList(await fetchHtml(LIST_URL, UA));
    if (items.length === 0) throw new Error("Statens Kunstfond returned no pools (layout change?)");
    const batch = items.slice(c.offset, c.offset + BATCH);
    const details = await mapLimit(batch, 4, async (item) => parseDetail(await fetchHtml(`${LIST_URL}/${item.slug}`, UA)));
    const grants = batch.map((item, i) => normalize(item, details[i] as Detail));
    const next: Cursor | null = c.offset + BATCH < items.length ? { offset: c.offset + BATCH } : null;
    return { grants, raws: batch.map((item, i) => ({ source_id: item.slug, payload: { ...item, ...details[i] } })), next: next ? JSON.stringify(next) : null };
  },
};
