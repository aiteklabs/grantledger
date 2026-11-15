import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Greece, agrotikianaptixi.gr (Ministry of Rural Development and Food): the calls of the CAP Strategic Plan 2023-2027
// interventions, including the LEADER calls of the Local Action Groups. The archive page is server-rendered, 21 calls
// per page (/page/N/), last updated first. Each card carries the publisher's status label (ΕΝΕΡΓΗ = active,
// ΕΧΕΙ ΛΗΞΕΙ = expired), the last update date, start, end and extension dates, and the beneficiary taxonomy as CSS
// classes. The WP REST API answers 401, so the HTML is read. The detail page of an active call adds the text, the
// geographic scope, the interventions and the attached documents; expired cards are listed from the card alone.
// Cards without a status label are pre-announcements and consultations without dates: they are left out.
// The source states no budget or grant amount in a structured way (they are in the attached PDF).
const SITE = "https://www.agrotikianaptixi.gr";
const LIST_URL = `${SITE}/prosklisi/paremvasi-sskap/paremvaseis-sskap-2023-2027/`;
const LICENSE = "agrotikianaptixi.gr public call notices (Υπουργείο Αγροτικής Ανάπτυξης και Τροφίμων)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const MAX_PAGES = 30;
// Beneficiary taxonomy slugs: public bodies, legal entities, collective bodies, natural persons, farmers.
const BENEFICIARIES: Record<string, Grant["beneficiary_types"][number]> = { "dimosioi-foreis": "public_body", "nomiko-prosopo": "company", "syllogikoi-foreis": "ngo", "fysiko-prosopo": "individual", georgos: "individual" };

interface Card { id: string; url: string; title: string; active: boolean; updated: string; start: string; end: string; extension: string; beneficiaries: string[] }
interface Detail { text: string; info: [string, string][]; documents: Grant["documents"] }

const clean = (s: string) => stripHtml(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();

function parseCards(html: string): Card[] {
  const out: Card[] = [];
  for (const block of html.split('data-elementor-type="loop-item"').slice(1)) {
    const id = block.slice(0, 600).match(/\bpost-(\d+)\b/)?.[1];
    const head = block.match(/<h2[^>]*><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const label = block.match(/class="(active|expired)-label"/)?.[1];
    if (!id || !head || !label) continue;
    const dates = [...block.matchAll(/elementor-post-info__item--type-custom">([\s\S]*?)<\/span>/g)].map((m) => clean(m[1]!));
    const date = (prefix: string) => dates.find((d) => d.startsWith(prefix))?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? "";
    out.push({
      id,
      url: head[1]!,
      title: clean(head[2]!),
      active: label === "active",
      updated: date("Τελευταία επικαιροποίηση"),
      start: date("Έναρξη"),
      end: date("Λήξη"),
      extension: date("Παράταση"),
      beneficiaries: [...(block.match(/class="([^"]*)"/)?.[1] ?? "").matchAll(/\bbeneficiary-([a-z-]+)/g)].map((m) => m[1]!),
    });
  }
  return out;
}

// "28/05/2026", Greek local time.
function grDate(v: string, time: string): string | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${time}.000Z` : null;
}

async function detail(url: string): Promise<Detail> {
  const html = await fetchHtml(url, UA);
  const from = html.indexOf('data-widget_type="theme-post-content.default"');
  const heading = html.indexOf(">Πληροφορίες</h2>", from);
  const body = from < 0 || heading < 0 ? "" : html.slice(html.indexOf(">", from) + 1, html.lastIndexOf("<div", heading));
  const info: [string, string][] = [];
  for (const m of html.slice(Math.max(heading, 0)).matchAll(/<span class="elementor-post-info__item-prefix">([\s\S]*?)<\/span>([\s\S]*?)<\/li>/g)) {
    const label = clean(m[1]!).replace(/:$/, "");
    const value = clean(m[2]!).replace(/\s+,/g, ",");
    if (label && value) info.push([label, value]);
  }
  const documents: Grant["documents"] = [];
  for (const m of html.matchAll(/class="filesMainDiv"[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const title = clean(m[2]!);
    let file: string;
    try { file = new URL(decodeEntities(m[1]!), SITE).href; } catch { continue; }
    if (title && file.startsWith("https://") && !documents.some((d) => d.url === file)) documents.push({ title, url: file });
  }
  return {
    text: stripHtml(body).replace(/ /g, " ").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"),
    info,
    documents: documents.slice(0, 40),
  };
}

function normalize(c: Card, d: Detail | null): Grant {
  const opens = grDate(c.start, "00:00:00");
  const closes = grDate(c.extension || c.end, "23:59:00");
  const now = new Date().toISOString();
  // The label is the publisher's status; an active call that has not started yet is upcoming.
  const status: Grant["status"] = !c.active || (closes !== null && closes < now) ? "closed" : opens !== null && opens > now ? "forthcoming" : "open";
  const scope = d?.info.find(([label]) => label.startsWith("Γεωγραφική"))?.[1] ?? "";
  return {
    id: `gr_agro:${c.id}`,
    source: "gr_agro",
    source_id: c.id,
    source_url: c.url,
    source_license: LICENSE,
    title: c.title,
    title_lang: "el",
    summary: [
      ...(d?.info ?? []).map(([label, value]) => `${label}: ${value}`),
      c.start ? `Ημερομηνία έναρξης: ${c.start}` : "",
      c.end ? `Ημερομηνία λήξης: ${c.end}` : "",
      c.extension ? `Νέα ημερομηνία λήξης: ${c.extension}` : "",
      d?.text ?? "",
    ].filter(Boolean).join("\n").slice(0, 20000) || null,
    funder_name: "Υπουργείο Αγροτικής Ανάπτυξης και Τροφίμων (ΣΣ ΚΑΠ 2023-2027)",
    funder_level: "national",
    country: "GR",
    // Free text: the Local Action Group or region of a LEADER call; empty for nationwide calls.
    regions: scope && !/ΕΠΙΚΡΑΤΕΙΑ/i.test(scope) ? scope.split(/,\s*/) : [],
    funding_types: ["grant"],
    beneficiary_types: [...new Set(c.beneficiaries.map((b) => BENEFICIARIES[b]).filter((b) => b !== undefined))],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents: d?.documents ?? [],
    source_updated_at: grDate(c.updated, "00:00:00"),
  };
}

export const grAgro: Source = {
  id: "gr_agro",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const html = await fetchHtml(page > 1 ? `${LIST_URL}page/${page}/` : LIST_URL, UA);
    const cards = parseCards(html);
    if (page === 1 && cards.length === 0) throw new Error("agrotikianaptixi.gr call list returned no calls (layout change?)");
    const now = new Date().toISOString();
    const details = await mapLimit(cards, 2, (c) => (c.active && !((grDate(c.extension || c.end, "23:59:00") ?? now) < now) ? detail(c.url) : Promise.resolve(null)));
    const last = Math.min(Math.max(1, ...[...html.matchAll(/class="page-numbers" href="[^"]*\/page\/(\d+)\/"/g)].map((m) => Number(m[1]))), MAX_PAGES);
    return {
      grants: cards.map((c, i) => normalize(c, details[i] ?? null)),
      raws: cards.map((c, i) => ({ source_id: c.id, payload: { card: c, detail: details[i] ? { info: details[i]!.info, text: details[i]!.text } : null } })),
      next: page < last ? String(page + 1) : null,
    };
  },
};
