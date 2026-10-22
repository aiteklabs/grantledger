import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Portugal, Fundo Ambiental (national environmental fund, run by Agência para o Clima): two server-rendered hub pages,
// the current-year register (apoios-<year>.aspx) and the PRR register (apoios-prr.aspx), one card per call with
// reference, status label, deadline, budget and a one-line purpose. Each card links to a detail page whose upper-case
// headings (BENEFICIÁRIOS, DOTAÇÃO, PRAZO) carry the eligibility text. No API, RSS or current sitemap exists.
const SITE = "https://www.fundoambiental.pt";
const LICENSE = "Fundo Ambiental public call notices (Agência para o Clima, I.P.)";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml", "accept-language": "pt-PT,pt;q=0.9,en;q=0.8" };
const HUBS = [`apoios-${new Date().getUTCFullYear()}`, "apoios-prr"];
const PER_PAGE = 10;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

interface Cursor { hub: number; offset: number }
interface Card { slug: string; path: string; category: string; title: string; ref: string; label: string; deadline: string; budget: string; purpose: string }
interface Detail { opens: string | null; amountMax: number | null; beneficiaries: string; funding: string; timing: string }

// "18h00 de 10 de agosto 2026", "17h00 de dia 28 abril de 2023", "15 de setembro de 2026". Times are Lisbon local.
function ptDate(v: string, fallbackTime = "23:59"): string | null {
  const m = v.match(/(\d{1,2})\s+(?:de\s+)?([a-zç]+)\s+(?:de\s+)?(\d{4})/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.toLowerCase());
  if (month < 0) return null;
  const t = v.match(/(\d{1,2})h(\d{2})/);
  const time = t ? `${t[1]!.padStart(2, "0")}:${t[2]}` : fallbackTime;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${time}:00.000Z`;
}

// "30 000 000,00 €", "2.000.000 €", "180.000,00 €". Per-unit amounts ("13 500,00 € por MVA") are not a budget.
function euros(v: string): number | null {
  if (/\bpor\b/i.test(v)) return null;
  const m = v.match(/(\d[\d\s.]*(?:,\d+)?)\s*€/);
  return m ? num(m[1]!.replace(/[\s.]/g, "").replace(",", ".")) : null;
}

function parseCards(html: string): Card[] {
  const out: Card[] = [];
  const body = html.slice(html.indexOf('class="breadcrumb"'), html.indexOf('id="clearFooter"'));
  for (const section of body.split(/<section\b/).slice(1)) {
    const category = stripHtml(section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "").replace(/\s+/g, " ").trim();
    for (const block of section.split(/<div style="margin:\s?20px 0;/).slice(1)) {
      const path = block.match(/href="\/?([^"#]+\.aspx)"[^>]*>\s*Consultar/)?.[1];
      const title = stripHtml(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "").replace(/\s+/g, " ").trim();
      // Cards without a deadline line are not calls (the PRR hub lists its general documentation the same way).
      if (!path || !title || !/Candidaturas at[ée]:/.test(block)) continue;
      const spans = [...block.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => stripHtml(m[1]!).replace(/\s+/g, " ").trim());
      const label = spans.find((s) => /^[A-ZÇÃÉ ]{5,}$/.test(s)) ?? "";
      out.push({
        slug: path.split("/").pop()!.replace(/\.aspx$/, ""),
        path,
        category,
        title,
        // The reference badge is the call number ("AAC N.º 06/2025"); some cards only carry the year there.
        ref: spans.find((s) => s && s !== label && !/^\d{4}$/.test(s)) ?? "",
        label,
        deadline: stripHtml(block.match(/Candidaturas at[ée]:\s*([\s\S]*?)<br/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
        budget: stripHtml(block.match(/Dota[çc][ãa]o do aviso:\s*([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
        purpose: stripHtml(block.match(/<div style="margin-bottom:\s?12px;?">([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
      });
    }
  }
  return out;
}

// Text under an upper-case heading, up to the next upper-case heading line.
function section(text: string, heading: RegExp): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => heading.test(l) && l.length < 80);
  if (start < 0) return "";
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^[A-ZÁÂÃÀÇÉÊÍÓÔÕÚ][A-ZÁÂÃÀÇÉÊÍÓÔÕÚ\s,/-]{4,}$/.test(l)) break;
    out.push(l);
  }
  return out.join("\n").slice(0, 2000);
}

async function detail(path: string): Promise<Detail> {
  const html = await fetchHtml(`${SITE}/${path}`, UA);
  const text = stripHtml(html.slice(html.indexOf('id="ctAreaConteudo"'), html.indexOf('id="clearFooter"')));
  const opens = text.match(/In[ií]cio da rece[çc][ãa]o de candidaturas?:?\s*([^\n]+)/i)?.[1];
  const max = text.match(/Apoio m[áa]ximo por candidatura:?\s*([^\n]+)/i)?.[1];
  return {
    opens: opens ? ptDate(opens, "00:00") : null,
    amountMax: max ? euros(max) : null,
    beneficiaries: section(text, /^BENEFICI[ÁA]RIOS/),
    funding: section(text, /^(DOTA[ÇC][ÃA]O|FINANCIAMENTO)/),
    timing: section(text, /^(PRAZO DE SUBMISS[ÃA]O|CALENDARIZA[ÇC][ÃA]O|APRESENTA[ÇC][ÃA]O DE CANDIDATURAS)/),
  };
}

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/munic[íi]pio|autarqui|freguesia|entidades p[úu]blicas|administra[çc][ãa]o p[úu]blica|comunidades intermunicipais|entidades gestoras|institutos p[úu]blicos|setor p[úu]blico/.test(t)) out.add("public_body");
  if (/\bpme\b|pequenas e m[ée]dias|microempresa/.test(t)) out.add("sme");
  if (/empresa|operador|sociedades comerciais|pessoas coletivas de direito privado|instala[çc][õo]es abrangidas/.test(t)) out.add("company");
  if (/ensino superior|centros de investiga|universidade|unidades de i&d|institui[çc][õo]es cient|sistema cient/.test(t)) out.add("research_org");
  if (/sem fins lucrativos|associa[çc][õo]es|n[ãa]o governamentais|\bong\b|cooperativa|\bipss\b|economia social/.test(t)) out.add("ngo");
  if (/pessoas singulares|particulares|cidad[ãa]os|fam[íi]lias|propriet[áa]rios|consumidores|pessoas f[íi]sicas/.test(t)) out.add("individual");
  return [...out];
}

function normalize(c: Card, d: Detail | null): Grant {
  const closes = ptDate(c.deadline);
  const opens = d?.opens ?? null;
  const status: Grant["status"] = /ENCERRAD/.test(c.label) ? "closed" : /BREVE/.test(c.label) ? "forthcoming" : /ABERT|CURSO/.test(c.label) ? "open" : statusFromDates(opens, closes);
  return {
    id: `pt_fundo_ambiental:${c.slug}`,
    source: "pt_fundo_ambiental",
    source_id: c.slug,
    source_url: `${SITE}/${c.path}`,
    source_license: LICENSE,
    title: c.title,
    title_lang: "pt",
    summary: [
      c.purpose,
      c.ref ? `Referência: ${c.ref}` : "",
      c.category ? `Área: ${c.category}` : "",
      c.deadline ? `Candidaturas até: ${c.deadline}` : "",
      c.budget ? `Dotação do aviso: ${c.budget}` : "",
      d?.beneficiaries ? `Beneficiários:\n${d.beneficiaries}` : "",
      d?.funding ? `Dotação e financiamento:\n${d.funding}` : "",
      d?.timing ? `Prazo:\n${d.timing}` : "",
    ].filter(Boolean).join("\n\n").slice(0, 8000) || null,
    funder_name: "Fundo Ambiental",
    funder_level: "national",
    country: "PT",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(d?.beneficiaries || `${c.title} ${c.purpose} ${d?.funding ?? ""}`),
    sectors: [],
    amount_min: null,
    amount_max: d?.amountMax ?? null,
    budget_total: euros(c.budget),
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const ptFundoAmbiental: Source = {
  id: "pt_fundo_ambiental",
  license: LICENSE,
  start() {
    return JSON.stringify({ hub: 0, offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const hub = HUBS[c.hub]!;
    // A year hub that does not exist yet (early January) redirects to the site's error page and yields no cards.
    const html = await fetchHtml(`${SITE}/${hub}.aspx`, UA);
    const cards = html.includes('class="breadcrumb"') ? parseCards(html) : [];
    if (cards.length === 0 && hub === "apoios-prr") throw new Error("Fundo Ambiental PRR hub returned no call cards");
    const slice = cards.slice(c.offset, c.offset + PER_PAGE);
    const details = await mapLimit(slice, 3, (card) => detail(card.path).catch(() => null));
    const more = c.offset + PER_PAGE < cards.length;
    const next: Cursor | null = more ? { hub: c.hub, offset: c.offset + PER_PAGE } : c.hub + 1 < HUBS.length ? { hub: c.hub + 1, offset: 0 } : null;
    return {
      grants: slice.map((card, i) => normalize(card, details[i] ?? null)),
      raws: slice.map((card, i) => ({ source_id: card.slug, payload: { card, detail: details[i] } })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
