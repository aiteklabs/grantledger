import type { Grant } from "@grantledger/schema";
import { fetchHtml, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Belgium, F.R.S.-FNRS (Fonds de la Recherche Scientifique): the research fund of the Wallonia-Brussels Federation.
// The "Appels et Financements" list (Drupal, rendered on the server, 15 cards a page, 114 instruments) is filtered on
// the publication status: upcoming ("A venir"), in_progress ("En cours") and continuous ("En continu", no dates);
// closed instruments are not read. The cards carry no text, so every listed instrument gets its detail page
// (description, amount, eligibility, documents). robots.txt asks for a 10 second crawl delay and does not disallow
// these filter parameters: each fetchPage makes one request, with that pause before it. A full crawl is 2 list pages
// plus about 17 detail pages.
const SITE = "https://www.frs-fnrs.be";
const LIST = `${SITE}/fr/financements?field_publication_status%5Bupcoming%5D=upcoming&field_publication_status%5Bin_progress%5D=in_progress&field_publication_status%5Bcontinuous%5D=continuous`;
const LICENSE = "F.R.S.-FNRS public funding information (frs-fnrs.be)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CRAWL_DELAY_MS = 10_000;

// `list` is the next list page to read, null once the list is done; `queue` holds the slugs still to read.
interface Cursor { list: number | null; queue: string[] }

const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
const plain = (html: string | undefined) => (html ? stripHtml(html).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() : "");

function normalize(slug: string, html: string): Grant {
  const start = html.indexOf('node--type-financing node--view-mode-full');
  const end = html.indexOf("</main>", start);
  if (start === -1) throw new Error(`F.R.S.-FNRS page without a financing block: ${slug}`);
  const node = html.slice(start, end === -1 ? undefined : end).replace(/<!--[\s\S]*?-->/g, "");
  const title = plain(node.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]);
  const badges = (kind: string) => [...node.matchAll(new RegExp(`class="badge badge__${kind}">([\\s\\S]*?)</a>`, "g"))].map((m) => plain(m[1])).filter(Boolean);
  const state = node.match(/badge__status-([a-z_]+)/)?.[1] ?? "";
  const stateLabel = plain(node.match(/class="badge badge__status-[a-z_]+">([\s\S]*?)<\/a>/)?.[1]);
  const slot = (label: string) => node.match(new RegExp(`financing--date-label">\\s*${label}\\s*</div>\\s*<div class="financing--date-content">([\\s\\S]*?)</div>`))?.[1] ?? "";
  const opens = toIso(slot("Ouverture").match(/datetime="([^"]+)"/)?.[1]);
  const closes = toIso(slot("Clôture").match(/datetime="([^"]+)"/)?.[1]);
  const description = plain(node.match(/<div class="financing--description">([\s\S]*?)<div class="financing--data-table">/)?.[1]);
  const table = node.match(/<div class="financing--data-table">([\s\S]*?)<div class="financing--content">/)?.[1] ?? "";
  const facts = [...table.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map((m) => ({ label: plain(m[1]), value: plain(m[2]).replace(/,?\n/g, ", ") })).filter((f) => f.label && f.value);
  // The three sections of the page (details, applications, rules) without the contact block (names, phone numbers).
  const contentHtml = (node.split('<div class="financing--content-wrapper">')[1] ?? "").replace(/<h3>Contact<\/h3>[\s\S]*?(?=<h3>Documents utiles<\/h3>|<div class="applications--btn-wrapper">|<div id="rules">|$)/, " ");
  const content = plain(contentHtml);
  const documents: Grant["documents"] = [];
  for (const m of contentHtml.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = (m[1] as string).replace(/&amp;/g, "&").trim();
    if (!/\.pdf(?:$|[?#])|\/docs\//i.test(href)) continue;
    let url: string;
    try { url = new URL(href, SITE).href; } catch { continue; }
    if (url.startsWith("https://") && !documents.some((d) => d.url === url)) documents.push({ title: plain(m[2]).replace(/\n/g, " ") || "Document", url });
  }
  // "300 000 €": the amount one application can ask for.
  const money = facts.find((f) => f.label === "Montant")?.value.match(/(\d[\d\s.]*)\s*€/)?.[1];
  const max = money ? Number(money.replace(/[\s.]/g, "")) : null;
  const types = badges("financing-type");
  const fields = badges("scientific-field");
  const summary = [
    description,
    types.length > 0 && `Type de financement: ${types.join(", ")}`,
    fields.length > 0 && `Domaine scientifique: ${fields.join(", ")}`,
    stateLabel && `Statut: ${stateLabel}`,
    opens && `Ouverture: ${plain(slot("Ouverture")).replace(/\n/g, " ")}`,
    closes && `Clôture: ${plain(slot("Clôture")).replace(/\n/g, " ")}`,
    ...facts.map((f) => `${f.label}: ${f.value}`),
    content,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  const now = new Date().toISOString();
  return {
    id: `be_fnrs:${slug}`,
    source: "be_fnrs",
    source_id: slug,
    source_url: `${SITE}/fr/financements/${slug}`,
    source_license: LICENSE,
    title: title || slug,
    title_lang: "fr",
    summary: summary || null,
    funder_name: "F.R.S.-FNRS",
    funder_level: "regional",
    country: "BE",
    regions: ["BE1", "BE3"],
    funding_types: /\bprix\b/i.test(`${title} ${types.join(" ")}`) ? ["prize"] : ["grant"],
    beneficiary_types: ["research_org", "individual"],
    sectors: fields,
    amount_min: null,
    amount_max: max && Number.isFinite(max) && max > 0 ? max : null,
    budget_total: null,
    currency: "EUR",
    status: state === "closed" || (closes !== null && closes < now) ? "closed" : state === "upcoming" || (opens !== null && opens > now) ? "forthcoming" : state === "in_progress" || state === "continuous" ? "open" : "unknown",
    opens_at: opens,
    closes_at: closes,
    documents,
    source_updated_at: null,
  };
}

export const beFnrs: Source = {
  id: "be_fnrs",
  license: LICENSE,
  start() {
    return JSON.stringify({ list: 0, queue: [] } satisfies Cursor);
  },
  // One request per call: a list page while `list` is set (no records yet), then one instrument page per call.
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    if (c.list !== null) {
      if (c.list > 0) await pause();
      const html = await fetchHtml(`${LIST}&page=${c.list}`, UA);
      const slugs = [...new Set([...html.matchAll(/class="node-readmore"><a href="\/fr\/financements\/([^"/?#]+)"/g)].map((m) => m[1] as string))];
      if (slugs.length === 0 && c.list === 0) throw new Error("F.R.S.-FNRS returned no open or upcoming instruments (bot challenge or changed markup?)");
      const queue = [...new Set([...c.queue, ...slugs])];
      const more = slugs.length > 0 && new RegExp(`class="pager__item">\\s*<a href="[^"]*page=${c.list + 1}"`).test(html);
      return { grants: [], raws: [], next: more ? JSON.stringify({ list: c.list + 1, queue }) : queue.length ? JSON.stringify({ list: null, queue }) : null };
    }
    const [slug, ...rest] = c.queue;
    if (!slug) return { grants: [], raws: [], next: null };
    await pause();
    const grant = normalize(slug, await fetchHtml(`${SITE}/fr/financements/${slug}`, UA));
    return { grants: [grant], raws: [{ source_id: slug, payload: { slug, summary: grant.summary } }], next: rest.length ? JSON.stringify({ list: null, queue: rest }) : null };
  },
};
