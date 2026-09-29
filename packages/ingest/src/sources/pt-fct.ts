import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Portugal, FCT (Fundação para a Ciência e a Tecnologia): server-rendered WordPress call list at /concursos, three
// tabs (open, scheduled, closed), 10 cards per page. Each card links to a call page whose sidebar carries the
// opening and closing dates and whose accordion sections hold the objectives, eligibility and funding text.
const SITE = "https://www.fct.pt";
const LICENSE = "FCT public call information";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "pt-PT,pt;q=0.9,en;q=0.8" };
// 4 open, 0 scheduled, 21 pages closed (2026-09-29). Closed pages are capped to keep the crawl bounded.
const TABS: { tab: string; status: Grant["status"]; maxPages: number }[] = [
  { tab: "open", status: "open", maxPages: 20 },
  { tab: "scheduled", status: "forthcoming", maxPages: 20 },
  { tab: "closed", status: "closed", maxPages: 40 },
];
const MONTHS: Record<string, string> = { jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06", jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12" };
// Accordion sections worth keeping in the summary, in this order.
const SECTIONS = ["Visão global e objetivos", "Destinatários", "Quem pode concorrer", "Financiamento", "Tipologias de Acesso"];

interface Cursor { tab: string; page: number }
interface Card { slug: string; title: string; teaser: string; label: string; date: string | null }
interface Detail { opens: string | null; closes: string | null; sections: { name: string; text: string }[] }

// "22 setembro 2026 (17h)" or "22.09.2026"; the month word is matched on its first three letters.
function ptDate(v: string): string | null {
  const m = v.match(/(\d{1,2})\s+([a-zç]{3})[a-zç]*\s+(\d{4})/i) ?? v.match(/(\d{1,2})[./](\d{2})[./](\d{4})/);
  if (!m) return null;
  const month = /^\d+$/.test(m[2]!) ? m[2]! : MONTHS[m[2]!.toLowerCase()];
  return month ? `${m[3]}-${month}-${m[1]!.padStart(2, "0")}T12:00:00.000Z` : null;
}

function parseCards(html: string): Card[] {
  const out: Card[] = [];
  for (const card of html.match(/<article class="calendar">[\s\S]*?<\/article>/g) ?? []) {
    const slug = card.match(/href="\/concursos\/([^"/]+)\/?"/)?.[1];
    if (!slug) continue;
    // The day is drawn as one SVG digit image per figure; the month cell reads "set 2026".
    const day = (card.match(/number-(\d)\.svg/g) ?? []).map((s) => s.replace(/\D/g, "")).join("");
    const month = stripHtml(card.match(/class="month">([\s\S]*?)<\/div>/)?.[1] ?? "").trim();
    out.push({
      slug,
      title: stripHtml(card.match(/calendar__title__link">([\s\S]*?)<\/span>/)?.[1] ?? slug).trim(),
      teaser: stripHtml(card.match(/class="call__description">([\s\S]*?)<\/div>/)?.[1] ?? "").trim(),
      label: stripHtml(card.match(/class="status">([\s\S]*?)<\/div>/)?.[1] ?? "").trim(),
      date: day && month ? ptDate(`${day} ${month}`) : null,
    });
  }
  return out;
}

function parseDetail(html: string): Detail {
  const timeline = html.match(/class="timeline">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const entry = (label: RegExp) => {
    const m = timeline.match(new RegExp(`<b>([^<]+)</b><br>\\s*${label.source}`));
    return m ? ptDate(m[1]!) : null;
  };
  const sections: Detail["sections"] = [];
  for (const item of html.match(/<li class="faq__item[\s\S]*?<\/li>\s*(?=<li class="faq__item|<\/ul>)/g) ?? []) {
    const name = stripHtml(item.match(/faq__item__button__name">([\s\S]*?)<\/span>/)?.[1] ?? "").trim();
    const text = stripHtml(item.match(/single-call_links__content">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? "").trim();
    if (SECTIONS.includes(name) && text) sections.push({ name, text: text.slice(0, 1500) });
  }
  return { opens: entry(/Abertura/), closes: entry(/Encerramento/), sections };
}

function normalize(c: Card, d: Detail, tab: Grant["status"]): Grant {
  const opens = d.opens;
  // The card date is the deadline on open cards ("Data Limite") and the closing date on closed ones ("Encerrado a").
  const closes = d.closes ?? c.date;
  const now = new Date().toISOString();
  const who = `${c.title} ${c.teaser} ${d.sections.map((s) => s.text).join(" ")}`.toLowerCase();
  const bens = new Set<Grant["beneficiary_types"][number]>(["research_org"]);
  if (/investigador|bolsa|prémio|premio|doutor/.test(who)) bens.add("individual");
  if (/empresa/.test(who)) bens.add("company");
  const status: Grant["status"] = closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : /Encerrado/i.test(c.label) ? "closed" : tab;
  return {
    id: `pt_fct:${c.slug}`,
    source: "pt_fct",
    source_id: c.slug,
    source_url: `${SITE}/concursos/${c.slug}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: "pt",
    summary: [c.teaser, ...d.sections.map((s) => `${s.name}: ${s.text}`), c.date || opens ? `Candidaturas: ${opens ? opens.slice(0, 10) : "?"} a ${closes ? closes.slice(0, 10) : "?"}` : ""].filter(Boolean).join("\n\n") || null,
    funder_name: "FCT",
    funder_level: "national",
    country: "PT",
    regions: [],
    funding_types: [/^pr[ée]mio/i.test(c.title) ? "prize" : "grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const ptFct: Source = {
  id: "pt_fct",
  license: LICENSE,
  start() {
    return JSON.stringify({ tab: "open", page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const t = TABS.find((x) => x.tab === c.tab)!;
    const cards = parseCards(await fetchHtml(`${SITE}/concursos?tab=${c.tab}&paged=${c.page}`, UA));
    const details = await mapLimit(cards, 4, async (card) => {
      try {
        return parseDetail(await fetchHtml(`${SITE}/concursos/${card.slug}`, UA));
      } catch {
        return { opens: null, closes: null, sections: [] } satisfies Detail;
      }
    });
    const nextTab = TABS[TABS.indexOf(t) + 1];
    const more = cards.length > 0 && c.page < t.maxPages;
    const next: Cursor | null = more ? { tab: c.tab, page: c.page + 1 } : nextTab ? { tab: nextTab.tab, page: 1 } : null;
    return {
      grants: cards.map((card, i) => normalize(card, details[i]!, t.status)),
      raws: cards.map((card, i) => ({ source_id: card.slug, payload: { card, detail: details[i] } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
