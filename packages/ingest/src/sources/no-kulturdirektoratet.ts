import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Norway, Kulturdirektoratet (Arts and Culture Norway): the grant schemes it runs for Kulturrådet (Arts Council
// Norway), Fond for lyd og bilde, Statens kunstnerstipend and the ministry: project grants, purchasing schemes for
// literature, artist stipends, museum and minority programmes. The list page is server-rendered (Craft CMS) and
// holds every scheme (about 70) as a card: status chip (Åpen or Lukket) and either the next deadline, the time the
// application form opens, or "Løpende frist" (rolling). Open schemes and schemes with an announced opening get
// their scheme page (deadlines as <time datetime>, managing body, purpose, what and who is funded, assessment,
// documents); schemes that are closed without a date are taken from the card alone. Many of these schemes are also
// in the state register read by no_tilskudd; the two sources are kept apart. Cloudflare sits in front of the site.
const SITE = "https://www.kulturdirektoratet.no";
const LIST_URL = `${SITE}/tilskuddsordninger`;
const LICENSE = "Kulturdirektoratet public grant scheme information (kulturdirektoratet.no)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "text/html,application/xhtml+xml", "accept-language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7" };
const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
// robots.txt sets no crawl delay, but the site answers 429 after about ten requests in twenty seconds (seen
// 2026-11-14 at one request per two seconds; one per seven seconds passed). So one scheme page per fetchPage call,
// with this pause before it.
const PAUSE_MS = 6000;

interface Card { slug: string; lang: string; chip: string; when: string; title: string; teaser: string }

interface Detail { deadlines: string[]; manager: string; body: string; documents: Grant["documents"]; modified: string | null }

// Tailwind class names hold ">" ("[&>*:first-child]"), which breaks tag stripping, and the icon font prints its
// ligature names ("arrow_forward") as text: both go before the text is taken.
const text = (html: string | undefined) => stripHtml((html ?? "").replace(/<span class="material-symbols-sharp[^"]*">[^<]*<\/span>/g, "").replace(/\sclass="[^"]*"/g, "")).replace(/\u00ad/g, "").replace(/[\u00a0\r]/g, " ");
const line = (html: string | undefined) => text(html).replace(/\s+/g, " ").trim();

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const m of html.matchAll(/<li>\s*<div lang=["']?([a-z]{2})["']? class="flex flex-col[^"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
    const inner = m[2] as string;
    const link = inner.match(/<a[^>]*href="https:\/\/www\.kulturdirektoratet\.no\/tilskuddsordninger\/([^"/]+)\/?"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const labels = [...inner.matchAll(/<span class="text-sm font-medium">([\s\S]*?)<\/span>/g)].map((s) => line(s[1]));
    cards.push({ slug: link[1] as string, lang: m[1] as string, chip: labels[0] ?? "", when: labels.slice(1).join(" "), title: line(link[2]), teaser: line(inner.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]) });
  }
  return cards;
}

function parseDetail(html: string): Detail {
  const start = html.indexOf("<h1");
  const main = html.slice(start === -1 ? 0 : start, html.indexOf("</main>", start) === -1 ? undefined : html.indexOf("</main>", start));
  const bodyStart = main.indexOf("<div data-chunks");
  const contact = main.search(/<h2[^>]*>\s*Kontakt\s*<\/h2>/);
  const bodyEnds = [contact, main.indexOf('<span class="text-base">Publisert', bodyStart)].filter((i) => i > bodyStart);
  const body = bodyStart === -1 ? "" : text(main.slice(bodyStart, bodyEnds.length ? Math.min(...bodyEnds) : undefined)).replace(/[ \t]*\n\s*/g, "\n").trim();
  const sidebar = bodyStart === -1 ? main : main.slice(0, bodyStart);
  const documents: Grant["documents"] = [];
  for (const m of main.matchAll(/<a[^>]+href="(https:\/\/[^"]+\.(?:pdf|docx?|xlsx?))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decodeEntities(m[1] as string);
    const title = line(m[2]);
    if (title && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  const changed = line(main.slice(Math.max(0, main.lastIndexOf("Sist endret")))).match(/Sist endret (\d{1,2})\. ([a-zæøå]+) (\d{4}) kl\. (\d{2}):(\d{2})/);
  return {
    deadlines: [...sidebar.matchAll(/<time datetime="([^"]+)"/g)].map((m) => toIso(m[1])).filter((d): d is string => d !== null).sort(),
    manager: line(sidebar).match(/Ordningen forvaltes av ([^.]+)\./)?.[1] ?? "",
    body,
    documents,
    modified: changed ? oslo(`${changed[1]}. ${changed[2]} ${changed[3]} kl. ${changed[4]}:${changed[5]}`) : null,
  };
}

// "2. desember 2026 kl. 13:00" (Norwegian time) as a UTC instant.
function oslo(value: string | undefined): string | null {
  const m = value?.match(/(\d{1,2})\. ([a-zæøå]+) (\d{4}) kl\. (\d{2}):(\d{2})/);
  const month = m ? MONTHS.indexOf(m[2] as string) : -1;
  if (!m || month === -1) return null;
  const year = Number(m[3]);
  const day = Number(m[1]);
  // Norway is UTC+1 in winter and UTC+2 in summer (last Sunday of March to last Sunday of October).
  const lastSunday = (mo: number) => { const end = new Date(Date.UTC(year, mo + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
  const summer = (month > 2 && month < 9) || (month === 2 && day >= lastSunday(2)) || (month === 9 && day < lastSunday(9));
  return new Date(Date.UTC(year, month, day, Number(m[4]) - (summer ? 2 : 1), Number(m[5]))).toISOString();
}

function beneficiaryTypes(who: string): Grant["beneficiary_types"] {
  const t = who.toLowerCase();
  const out: Grant["beneficiary_types"] = [];
  if (/privatperson|enkeltperson|kunstner|forfatter|oversetter|skribent|student|forsker|utøver/.test(t)) out.push("individual");
  if (/foretak|selskap|forlag|virksomhet|bedrift|arrangør/.test(t)) out.push("company");
  if (/organisasjon|forening|frivillig|stiftelse|lag\b/.test(t)) out.push("ngo");
  if (/kommune|offentlig|bibliotek|museum|museer|institusjon/.test(t)) out.push("public_body");
  return out;
}

function normalize(card: Card, d: Detail | null): Grant {
  const now = new Date().toISOString();
  const opening = card.chip === "Lukket" ? oslo(card.when.match(/åpner (.+)/)?.[1]) : null;
  const status: Grant["status"] = card.chip === "Åpen" ? "open" : opening && opening > now ? "forthcoming" : "closed";
  // An open scheme closes at the deadline on its card. For an announced round the scheme page lists the deadlines:
  // the first one after the form opens.
  const closes = status === "open" ? oslo(card.when.match(/Søknadsfrist (.+)/)?.[1]) : status === "forthcoming" ? (d?.deadlines.find((t) => t > (opening as string)) ?? null) : null;
  const who = d?.body.match(/Hvem kan søke\?\s*([\s\S]{0,800})/)?.[1] ?? "";
  const summary = [
    card.teaser,
    card.chip && `Status: ${card.chip}`,
    card.when,
    d?.manager && `Ordningen forvaltes av ${d.manager}.`,
    d && d.deadlines.length > 1 && `Søknadsfrister: ${d.deadlines.map((t) => t.slice(0, 10)).join(", ")}`,
    d?.body,
  ].filter(Boolean).join("\n").slice(0, 20000);
  return {
    id: `no_kulturdirektoratet:${card.slug}`,
    source: "no_kulturdirektoratet",
    source_id: card.slug,
    source_url: `${LIST_URL}/${card.slug}`,
    source_license: LICENSE,
    title: card.title,
    title_lang: /^(nb|nn|no|se|en)$/.test(card.lang) ? card.lang : "no",
    summary: summary || null,
    funder_name: d?.manager || "Kulturdirektoratet",
    funder_level: "national",
    country: "NO",
    regions: [],
    // The purchasing schemes ("innkjøpsordning") buy copies of new books for the public libraries.
    funding_types: [/innkjøpsordning/i.test(card.title) ? "other" : "grant"],
    beneficiary_types: beneficiaryTypes(who),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "NOK",
    status,
    opens_at: status === "forthcoming" ? opening : null,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: d?.modified ?? null,
  };
}

export const noKulturdirektoratet: Source = {
  id: "no_kulturdirektoratet",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the list page; it yields the schemes that are closed without a date. After that the cursor is the
  // JSON list of open and announced schemes still to read, one scheme page per call.
  async fetchPage(cursor): Promise<Page> {
    if (cursor === "start") {
      const cards = parseCards(await fetchHtml(LIST_URL, UA));
      if (cards.length === 0) throw new Error("Kulturdirektoratet lists no grant schemes (bot challenge or layout change?)");
      const now = new Date().toISOString();
      const isCurrent = (c: Card) => c.chip === "Åpen" || (oslo(c.when.match(/åpner (.+)/)?.[1]) ?? "") > now;
      const closed = cards.filter((c) => !isCurrent(c));
      const current = cards.filter(isCurrent);
      return { grants: closed.map((card) => normalize(card, null)), raws: closed.map((card) => ({ source_id: card.slug, payload: { card } })), next: current.length ? JSON.stringify(current) : null };
    }
    const [card, ...rest] = JSON.parse(cursor) as Card[];
    if (!card) return { grants: [], raws: [], next: null };
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    const detail = parseDetail(await fetchHtml(`${LIST_URL}/${card.slug}`, UA));
    return { grants: [normalize(card, detail)], raws: [{ source_id: card.slug, payload: { card, detail } }], next: rest.length ? JSON.stringify(rest) : null };
  },
};
