import type { Grant } from "@grantledger/schema";
import { fetchJson, londonIso, mapLimit, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Italy, Lazio Europa (Regione Lazio): the regional portal for calls funded by EU, state and regional money.
// The WordPress REST API (/wp-json/wp/v2/bandi, about 980 posts) has no status field or filter: the status is a
// private meta value that only the HTML archive exposes (?stati=1 "Aperto", ?stati=2 "Prossima apertura", 12 cards a
// page). So each fetchPage reads one archive page, asks REST for those 12 posts in one request (excerpt, taxonomy
// terms, modification time) and reads the call page of every call that is still current for the text and the
// attached documents. The portal has no date fields: the deadline is taken from the one-line excerpt the editors
// write ("domande entro le ore 17:00 del 3 dicembre 2026"), and a later date in the body wins when the body marks it
// as an extension ("termine prorogato"). Calls the portal still shows as open after that deadline are skipped.
const SITE = "https://www.lazioeuropa.it";
const LICENSE = "Lazio Europa public call information (Regione Lazio, lazioeuropa.it)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const STATES = [1, 2] as const;
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

interface Cursor { state: number; page: number }
interface Term { taxonomy: string; name: string }
interface Post {
  id: number;
  slug: string;
  modified_gmt?: string;
  excerpt?: { rendered?: string };
  _embedded?: { "wp:term"?: Term[][] };
}
interface Card { slug: string; title: string; state: number }
interface TextDate { iso: string; kind: "open" | "close" | null; end: number }

const plain = (html: string | undefined) => (html ? stripHtml(html).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() : "");
// Rome wall-clock time as ISO in UTC: Rome is one hour ahead of London all year.
const romeIso = (year: number, month: number, day: number, hour: number, minute = 0) => londonIso(year, month, day, hour - 1, minute);

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Dates written in prose ("dalle ore 12 del 10 novembre 2026 alle ore 17 del 10 novembre 2027"), each with the kind
// its lead-in words give it. A date without a year takes the year of the next date that has one.
function textDates(text: string): TextDate[] {
  const hits = [...text.matchAll(new RegExp(`(\\d{1,2})°? (${MONTHS.join("|")})(?: (20\\d\\d))?`, "gi"))];
  const out: TextDate[] = [];
  let prev = 0;
  hits.forEach((m, i) => {
    const at = m.index ?? 0;
    const before = text.slice(Math.max(prev, at - 70), at);
    prev = at + m[0].length;
    const month = MONTHS.indexOf((m[2] as string).toLowerCase());
    const donor = m[3] ? m : hits.slice(i + 1).find((n) => n[3]);
    if (!donor) return;
    const year = Number(donor[3]) - (donor !== m && month > MONTHS.indexOf((donor[2] as string).toLowerCase()) ? 1 : 0);
    // The lead-in must run straight into the date: only a time and filler words in between, no punctuation
    // ("dall'art. 18 del D.L. n. 8 del 9 febbraio 2017" is not an opening date).
    const cue = [...before.matchAll(/entro|fino a|non oltre|scadenza|scade|\balle ore|\bal\b|\bdal(?:le|l['’])?\b|a partire/gi)].at(-1);
    const lead = cue ? before.slice(cue.index ?? 0) : "";
    const direct = cue && !/[.;:,()]/.test(lead.slice(cue[0].length).replace(/\d{1,2}[.:]\d{2}/g, ""));
    const kind = !cue || !direct ? null : /^(dal|a partire)/i.test(cue[0]) ? "open" : "close";
    const time = kind ? [...lead.matchAll(/(?:ore|alle|dalle)\s+(\d{1,2})(?:[:.](\d{2}))?(?!\d)/gi)].at(-1) : undefined;
    const hour = time && Number(time[1]) < 24 ? Number(time[1]) : kind === "close" ? 23 : 0;
    const minute = time && Number(time[1]) < 24 ? Number(time[2] ?? 0) : kind === "close" ? 59 : 0;
    out.push({ iso: romeIso(year, month, Number(m[1]), hour, minute), kind, end: prev });
  });
  return out;
}

function dates(excerpt: string, body: string): { opens: string | null; closes: string | null } {
  const short = textDates(excerpt);
  let closes = short.filter((d) => d.kind === "close").at(-1)?.iso ?? null;
  const opens = short.find((d) => d.kind === "open" && (!closes || d.iso <= closes))?.iso ?? null;
  // An extension written into the body after the excerpt was last edited.
  for (const d of textDates(body)) if (d.kind === "close" && closes && d.iso > closes && /^[^.]{0,60}(prorog|differit)/i.test(body.slice(d.end))) closes = d.iso;
  return { opens, closes };
}

// "euro 7.490.079,22", "€ 5.000.000", "343.423,56 euro", "19.5 milioni di euro", "500 mila euro". An amount spelled
// across words ("un milione 242 mila euro", "2 milioni 125.363,20 euro") is left out rather than read wrong.
function amount(text: string): number | null {
  const full = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?`;
  const m = text.match(new RegExp(`(?:euro|€)\\s*(${full})(?!\\s*(?:mila|milion|miliard))|(${full})\\s*(?:euro|€)|(\\d+(?:[.,]\\d{1,2})?)\\s*(mila|milion[ei]|miliard[oi])\\s*(?:di\\s*)?(?:euro|€)`, "i"));
  if (!m || /(?:milion[ei]|miliard[oi])\s*(?:e\s*)?$/i.test(text.slice(0, m.index))) return null;
  const unit = (m[4] ?? "").toLowerCase();
  const n = m[3] ? Number(m[3].replace(",", ".")) * (unit.startsWith("milia") ? 1e9 : unit.startsWith("milion") ? 1e6 : 1e3) : Number((m[1] ?? m[2] ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 1000 ? Math.round(n) : null;
}

// The call budget: a heading that is only an amount ("3 milioni di euro"), else the amount that follows the words
// for the endowment. Free text: a small amount there is more likely a grant ceiling than a budget, so it is dropped.
function budget(contentHtml: string, text: string): number | null {
  for (const h of contentHtml.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/g)) {
    const heading = plain(h[1]);
    if (heading.length < 40 && amount(heading) !== null) return amount(heading);
  }
  const n = amount(text.match(/(?:dotazione finanziaria|risorse finanziarie|risorse disponibili|stanziat[oaie]|stanziamento)[\s\S]{0,300}/i)?.[0] ?? "");
  return n !== null && n >= 50_000 ? n : null;
}

function fundingTypes(names: string[]): Grant["funding_types"] {
  const out = new Set<Grant["funding_types"][number]>();
  for (const n of names.map((x) => x.toLowerCase())) {
    if (/prestit|finanziament|mutu|credito/.test(n)) out.add("loan");
    else if (/garanzi/.test(n)) out.add("guarantee");
    else if (/voucher|buon/.test(n)) out.add("voucher");
    else if (/capitale|equity/.test(n)) out.add("equity");
    else if (/fiscal/.test(n)) out.add("tax_credit");
    else if (/premi/.test(n)) out.add("prize");
    else if (/fondo perduto|contribut|aiuto|sovvenzion/.test(n)) out.add("grant");
    else out.add("other");
  }
  return [...out];
}

function beneficiaryTypes(names: string[]): Grant["beneficiary_types"] {
  const out = new Set<Grant["beneficiary_types"][number]>();
  for (const n of names.map((x) => x.toLowerCase())) {
    if (/start/.test(n)) out.add("startup");
    if (/piccole e medie|pmi/.test(n)) out.add("sme");
    if (/impres|professionist|cooperativ|aziend/.test(n)) out.add("company");
    if (/cittadin|student|famigl|lavorator|disoccupat|giovani|persone/.test(n)) out.add("individual");
    if (/universit|ricerca/.test(n)) out.add("research_org");
    if (/comun|enti locali|enti pubblici|pubblica amministrazione|istituti scolastici|scuol/.test(n)) out.add("public_body");
    if (/terzo settore|associazion|no profit|non profit|onlus/.test(n)) out.add("ngo");
  }
  return [...out];
}

function normalize(card: Card, post: Post | undefined, html: string): Grant {
  const terms = (post?._embedded?.["wp:term"] ?? []).flat();
  const names = (taxonomy: string) => terms.filter((t) => t.taxonomy === taxonomy).map((t) => plain(t.name)).filter(Boolean);
  const excerpt = plain(post?.excerpt?.rendered) || plain(html.match(/<meta name="description" content="([^"]*)"/)?.[1]);
  const entry = html.match(/<div class="entry-content">([\s\S]*?)<\/div><!-- \.entry-content -->/)?.[1] ?? "";
  const attachments = entry.match(/<div class="bandi_attachments">[\s\S]*?<\/ul>\s*<\/div>/)?.[0] ?? "";
  const contentHtml = entry.replace(attachments, "").replace(/<figure[\s\S]*?<\/figure>/g, " ");
  const body = plain(contentHtml);
  const state = Number(html.match(/single-bandi-status-(\d)/)?.[1] ?? card.state);
  const { opens, closes } = dates(excerpt, body);
  const now = new Date().toISOString();
  const documents: Grant["documents"] = [];
  for (const m of attachments.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = (m[1] as string).replace(/&amp;/g, "&").replace(/ /g, "%20");
    if (/^https:\/\/\S+$/.test(url) && !documents.some((d) => d.url === url)) documents.push({ title: plain(m[2]) || "Documento", url });
  }
  const funds = names("fondi");
  const recipients = names("destinatari");
  const kinds = names("tipologie-agevolazioni");
  const bodies = names("enti");
  const areas = names("aree");
  const summary = [
    excerpt,
    `Stato: ${state === 2 ? "Prossima apertura" : state === 0 ? "Chiuso" : "Aperto"}`,
    areas.length > 0 && `Area: ${areas.join(", ")}`,
    funds.length > 0 && `Fondo: ${funds.join(", ")}`,
    kinds.length > 0 && `Tipologia di agevolazione: ${kinds.join(", ")}`,
    recipients.length > 0 && `Destinatari: ${recipients.join(", ")}`,
    bodies.length > 0 && `Ente erogatore: ${bodies.join(", ")}`,
    body,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `it_lazio:${card.slug}`,
    source: "it_lazio",
    source_id: card.slug,
    source_url: `${SITE}/bandi/${card.slug}/`,
    source_license: LICENSE,
    title: card.title,
    title_lang: "it",
    summary: summary || null,
    funder_name: "Regione Lazio",
    funder_level: "regional",
    country: "IT",
    regions: ["ITI4"],
    funding_types: fundingTypes(kinds),
    beneficiary_types: beneficiaryTypes(recipients),
    sectors: areas,
    amount_min: null,
    amount_max: null,
    budget_total: budget(contentHtml, body),
    currency: "EUR",
    status: state === 0 || (closes !== null && closes < now) ? "closed" : state === 2 || (opens !== null && opens > now) ? "forthcoming" : "open",
    opens_at: opens,
    closes_at: closes,
    documents,
    source_updated_at: toIso(post?.modified_gmt ? `${post.modified_gmt}Z` : html.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1]),
  };
}

export const itLazio: Source = {
  id: "it_lazio",
  license: LICENSE,
  start() {
    return JSON.stringify({ state: STATES[0], page: 1 } satisfies Cursor);
  },
  // One archive page, one REST request for its 12 posts, then the call pages: 14 requests at most.
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const list = await get(`${SITE}/bandi/${c.page > 1 ? `page/${c.page}/` : ""}?stati=${c.state}`);
    const cards: Card[] = [];
    for (const a of list.match(/<article class="box-bandi">[\s\S]*?<\/article>/g) ?? []) {
      const m = a.match(/box-bandi-titolo">\s*<a href="[^"]*\/bandi\/([^/"]+)\/?"[^>]*>([\s\S]*?)<\/a>/);
      if (m && !cards.some((x) => x.slug === m[1])) cards.push({ slug: m[1] as string, title: plain(m[2]), state: Number(a.match(/box-bandi-status-(\d)/)?.[1] ?? c.state) });
    }
    // The list of announced calls can be empty; the list of open calls never is.
    if (cards.length === 0 && c.state === STATES[0] && c.page === 1) throw new Error("Lazio Europa returned no open calls (bot challenge or changed markup?)");
    const posts = cards.length === 0 ? [] : await fetchJson<Post[]>(`${SITE}/wp-json/wp/v2/bandi?per_page=100&slug=${cards.map((x) => encodeURIComponent(x.slug)).join(",")}&_embed=wp:term&_fields=id,slug,modified_gmt,excerpt,_links,_embedded`, { headers: UA });
    const bySlug = new Map(posts.map((p) => [p.slug, p]));
    // A call whose excerpt deadline has passed is not worth a request, unless the body may carry an extension.
    const now = new Date().toISOString();
    const current = cards.filter((x) => {
      const closes = dates(plain(bySlug.get(x.slug)?.excerpt?.rendered), "").closes;
      return !closes || closes >= now || /prorog|differit/i.test(plain(bySlug.get(x.slug)?.excerpt?.rendered));
    });
    const pages = await mapLimit(current, 2, (x) => get(`${SITE}/bandi/${x.slug}/`));
    const grants = current.map((x, i) => normalize(x, bySlug.get(x.slug), pages[i] as string)).filter((g) => g.status !== "closed");
    const nextState = STATES[STATES.indexOf(c.state as (typeof STATES)[number]) + 1];
    const next: Cursor | null = cards.length > 0 && /class="next page-numbers"/.test(list) ? { state: c.state, page: c.page + 1 } : nextState ? { state: nextState, page: 1 } : null;
    return {
      grants,
      raws: grants.map((g) => ({ source_id: g.source_id, payload: { post: { ...bySlug.get(g.source_id), _embedded: undefined, _links: undefined }, summary: g.summary } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
