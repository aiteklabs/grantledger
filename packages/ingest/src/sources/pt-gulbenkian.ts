import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Portugal, Fundação Calouste Gulbenkian: scholarships ("Bolsas") and grants to organisations ("Apoios"). The archive
// /bolsas-lista/ is server-rendered and filtered by grant type; each filter is one list of cards (type, title, teaser,
// application window, "Candidatura aberta" badge), 24 per page, open calls first. The WP REST route behind the
// archive (/wp/v2/grant) answers 401, so the HTML is read. The detail page of an open or upcoming call adds the exact
// window as epoch milliseconds (the "Application" component), the conditions, eligibility and how-to-apply sections,
// the regulation documents and a modification date. Closed cards are listed from the card alone.
// Cloudflare sits in front of the site; the grantledger user agent passed on 2026-11-14.
const SITE = "https://gulbenkian.pt";
const LICENSE = "Fundação Calouste Gulbenkian public grant and scholarship information (gulbenkian.pt)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", "accept-language": "pt-PT,pt;q=0.9" };
// grant_type term ids of the two archive filters.
const TYPES = [{ id: 34450, name: "Bolsas" }, { id: 34449, name: "Apoios" }] as const;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MAX_PAGES = 10;

interface Cursor { type: number; page: number }
interface Card { slug: string; url: string; title: string; teaser: string; when: string; open: boolean }
interface Detail { opens: string | null; closes: string | null; lead: string; text: string; documents: Grant["documents"]; updated: string | null }

const clean = (s: string) => stripHtml(s).replace(/[ ﻿]/g, " ").replace(/\s+/g, " ").trim();
const pad = (n: number | string) => String(n).padStart(2, "0");

function parseCards(html: string): Card[] {
  const out: Card[] = [];
  for (const m of html.matchAll(/<a\s+href="(https:\/\/gulbenkian\.pt\/bolsas-lista\/([^"/]+)\/?)"\s+target="_self"[\s\S]*?<\/article>/g)) {
    const block = m[0];
    const title = clean(block.match(/fcg-card__title">([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (!title) continue;
    out.push({
      slug: m[2]!,
      url: m[1]!,
      title,
      teaser: clean(block.match(/fcg-card__description">([\s\S]*?)<\/p>/)?.[1] ?? ""),
      when: clean(block.match(/<time>([\s\S]*?)<\/time>/)?.[1] ?? ""),
      open: /class="badge[^"]*">\s*Candidatura aberta/i.test(block),
    });
  }
  return out;
}

// Card windows: "até 04 dez 2026", "01 jul to 30 set 2026", "03 nov 2025 to 30 jan 2026", "01 to 30 set 2026" (the site
// prints an en dash where "to" stands here). A part
// without month or year takes them from the closing date. Lisbon local time.
function cardWindow(when: string): { opens: string | null; closes: string | null } {
  const parts = [...when.matchAll(/(\d{1,2})(?:\s+([a-zç]{3})[a-zç]*)?(?:\s+(\d{4}))?/gi)].map((m) => ({ day: Number(m[1]), month: m[2] ? MONTHS.indexOf(m[2].toLowerCase()) : -1, year: m[3] ? Number(m[3]) : 0 }));
  const last = parts.at(-1);
  if (!last || last.month < 0 || !last.year) return { opens: null, closes: null };
  const closes = `${last.year}-${pad(last.month + 1)}-${pad(last.day)}T23:59:00.000Z`;
  if (parts.length < 2) return /^at[ée]/i.test(when) ? { opens: null, closes } : { opens: `${closes.slice(0, 10)}T00:00:00.000Z`, closes: null };
  const first = parts[0]!;
  const month = first.month < 0 ? last.month : first.month;
  const year = first.year || (month > last.month ? last.year - 1 : last.year);
  return { opens: `${year}-${pad(month + 1)}-${pad(first.day)}T00:00:00.000Z`, closes };
}

async function detail(url: string): Promise<Detail> {
  const html = await fetchHtml(url, UA);
  // One Application component per call round, with the window in epoch milliseconds: first opening, last deadline.
  const rounds = [...html.matchAll(/Application\(\{&quot;start&quot;:(\d+),&quot;end&quot;:(\d+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));
  const from = html.indexOf('class="fcg-section-group"');
  const to = html.indexOf('class="page-meta"', from);
  const body = from < 0 ? "" : html.slice(html.lastIndexOf("<", from), to < 0 ? html.indexOf("</main>", from) : to).replace(/<button[\s\S]*?<\/button>/g, " ");
  const documents: Grant["documents"] = [];
  for (const m of html.matchAll(/class="fcg-related-documents__link"\s+href="([^"]+)"\s+title="([^"]*)"/g)) {
    const title = clean(m[2]!);
    let file: string;
    try { file = new URL(decodeEntities(m[1]!), SITE).href; } catch { continue; }
    if (title && file.startsWith("https://") && !documents.some((d) => d.url === file)) documents.push({ title, url: file });
  }
  // "Atualização em 21 julho 2026"
  const mod = html.match(/fcg-modification-date">\s*Atualização em (\d{1,2}) ([a-zç]+) (\d{4})/i);
  const modMonth = mod ? MONTHS.indexOf(mod[2]!.slice(0, 3).toLowerCase()) : -1;
  return {
    opens: rounds.length ? new Date(Math.min(...rounds.map((r) => r.start))).toISOString() : null,
    closes: rounds.length ? new Date(Math.max(...rounds.map((r) => r.end))).toISOString() : null,
    lead: clean(html.match(/fcg-entry-header__lead">([\s\S]*?)<\/div>/)?.[1] ?? ""),
    text: stripHtml(body).replace(/[ ﻿]/g, " ").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"),
    documents: documents.slice(0, 40),
    updated: mod && modMonth >= 0 ? `${mod[3]}-${pad(modMonth + 1)}-${pad(mod[1]!)}T00:00:00.000Z` : null,
  };
}

function beneficiaries(text: string, scholarship: boolean): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/estudantes|investigador|bolseir|artistas|alunos|docentes|professores|jovens|candidatos individuais|pessoas singulares/.test(t)) out.add("individual");
  if (/instituições de ensino superior|universidades|centros de investigação|unidades de investigação|instituições científicas/.test(t)) out.add("research_org");
  if (/sem fins lucrativos|sociedade civil|não governamentais|associações|\bongs?\b|\bipss\b|think tanks|organizações ambientais|economia social|cooperativas/.test(t)) out.add("ngo");
  if (/municípios|autarquias|entidades públicas|escolas|agrupamentos escolares/.test(t)) out.add("public_body");
  if (/empresas|startups/.test(t)) out.add("company");
  if (out.size === 0 && scholarship) out.add("individual");
  return [...out];
}

function normalize(type: (typeof TYPES)[number], c: Card, d: Detail | null): Grant {
  const card = cardWindow(c.when);
  const opens = d?.opens ?? card.opens;
  const closes = d?.closes ?? card.closes;
  // The badge is the publisher's status; cards without it are upcoming or closed by their dates.
  const dated = statusFromDates(opens, closes);
  const status: Grant["status"] = c.open && dated !== "closed" ? "open" : dated;
  const lead = d?.lead || c.teaser;
  return {
    id: `pt_gulbenkian:${c.slug}`,
    source: "pt_gulbenkian",
    source_id: c.slug,
    source_url: c.url,
    source_license: LICENSE,
    title: c.title,
    title_lang: "pt",
    summary: [`Tipo: ${type.name}`, lead, c.when ? `Candidaturas: ${c.when}` : "", d?.text ?? ""].filter(Boolean).join("\n").slice(0, 20000),
    funder_name: "Fundação Calouste Gulbenkian",
    funder_level: "national",
    country: "PT",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(`${c.title} ${lead}`, type.name === "Bolsas"),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: d?.updated ?? null,
  };
}

export const ptGulbenkian: Source = {
  id: "pt_gulbenkian",
  license: LICENSE,
  start() {
    return JSON.stringify({ type: 0, page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const type = TYPES[c.type]!;
    const html = await fetchHtml(`${SITE}/bolsas-lista/${c.page > 1 ? `page/${c.page}/` : ""}?filter%5Btax%5D%5Bgrant_type%5D%5B%5D=${type.id}`, UA);
    const cards = parseCards(html);
    if (c.page === 1 && cards.length === 0) throw new Error(`Gulbenkian ${type.name} list returned no cards (bot challenge or layout change?)`);
    const totalPages = Math.min(Number(html.match(/Archive\(\s*\{&quot;page&quot;:\d+,&quot;totalPages&quot;:(\d+)/)?.[1] ?? 1), MAX_PAGES);
    const details = await mapLimit(cards, 2, (card) => {
      const dated = statusFromDates(cardWindow(card.when).opens, cardWindow(card.when).closes);
      return card.open || dated === "forthcoming" ? detail(card.url) : Promise.resolve(null);
    });
    const next: Cursor | null = c.page < totalPages ? { type: c.type, page: c.page + 1 } : c.type + 1 < TYPES.length ? { type: c.type + 1, page: 1 } : null;
    return {
      grants: cards.map((card, i) => normalize(type, card, details[i] ?? null)),
      raws: cards.map((card, i) => ({ source_id: card.slug, payload: { type: type.name, card, detail: details[i] ?? null } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
