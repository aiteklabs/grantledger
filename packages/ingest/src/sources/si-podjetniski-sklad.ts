import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, mapLimit, num, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Slovenia, Slovenski podjetniški sklad (Slovene Enterprise Fund): vouchers, grants, loans, guarantees and equity for
// small and medium-sized enterprises. The page /javni-razpisi-pozivi-programi/ fills its list from the theme's own
// endpoint, POST /wp-admin/admin-ajax.php action=sps_razpisi_live_search, which returns {html, has_more} with 10
// cards per page: "code | title", type, status (Odprto or Zaprto) and deadline. All statuses are read, because the
// fund closes a call early when its money runs out and the card is the only place that says so; open calls get
// their detail page (amounts, eligibility, documents, modification time), closed ones keep the card data only.
// The list also holds invitations to join the fund's registers of experts and mentors, which are not funding and
// are left out by title. robots.txt allows everything ("Disallow:" is empty).
const SITE = "https://www.podjetniskisklad.si";
const AJAX = `${SITE}/wp-admin/admin-ajax.php`;
const LICENSE = "Slovenski podjetniški sklad public call information (podjetniskisklad.si)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const NOT_FUNDING = /strokovnjak|mentor/i;

interface Card { slug: string; url: string; title: string; type: string; state: string; due: string }

const clean = (html: string) => stripHtml(html).replace(/ /g, " ").replace(/\s+/g, " ").trim();
// "5.000,00" or "500.000": Slovenian number format.
const siNum = (s: string | undefined) => (s ? num(s.replace(/\./g, "").replace(",", ".")) : null);

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const li of html.split(/<li class="/).slice(1)) {
    const url = li.match(/<a class="fusion-column-anchor" href="([^"]+)"/)?.[1] ?? li.match(/href="([^"]+)"/)?.[1];
    const title = clean(li.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const slug = url?.replace(/\/+$/, "").split("/").pop();
    if (!url || !slug || !title) continue;
    const lines = stripHtml(li.slice(li.indexOf("</h3>"))).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const at = lines.findIndex((l) => /^(Odprto|Zaprto)$/i.test(l));
    cards.push({ slug, url, title, type: at > 0 ? lines[at - 1]! : "", state: at >= 0 ? lines[at]! : "", due: lines.find((l) => /^(do )?\d{2}\.\d{2}\.\d{4}$/.test(l))?.replace(/^do /, "") ?? "" });
  }
  return cards;
}

function fundingTypes(c: Card): Grant["funding_types"] {
  const out = new Set<Grant["funding_types"][number]>();
  if (/vavčer/i.test(c.title)) out.add("voucher");
  else if (/subvencij/i.test(c.type)) out.add("grant");
  // "Garancije Sklada za bančne kredite" is a guarantee for a bank loan, not a loan of the fund.
  if (/garancij/i.test(`${c.type} ${c.title}`)) out.add("guarantee");
  else if (/kredit/i.test(`${c.type} ${c.title}`)) out.add("loan");
  if (/lastnišk/i.test(c.type)) out.add("equity");
  if (out.size === 0) out.add(/vsebinska podpora/i.test(c.type) ? "other" : "grant");
  return [...out];
}

function normalize(c: Card, html: string | null): Grant {
  const from = html ? html.indexOf('<div class="post-content">') : -1;
  const content = html && from !== -1 ? html.slice(from, html.indexOf("</main>", from)).replace(/<nav[\s\S]*?<\/nav>/, "") : "";
  const body = stripHtml(content)
    .replace(/ /g, " ")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  // The box under the title: "Nepovratna sredstva / od 500,00 do 5.000,00 EUR / Razpisana sredstva / 0,5 mio EUR za
  // obdobje od 2025-2028". The line above "Razpisana sredstva" is the amount per applicant: a range, a ceiling
  // ("do") or one flat amount.
  const box = body.replace(/\n+/g, "\n").match(/\n([^\n]+)\nRazpisana sredstva\n([^\n]+)/);
  const range = box?.[1]!.match(/(?:od ([\d.]+(?:,\d+)?)(?: EUR)? )?(do )?([\d.]+(?:,\d+)?) EUR/);
  const max = siNum(range?.[3]);
  const min = range?.[1] ? siNum(range[1]) : range?.[2] ? null : max;
  const pool = box?.[2]!.match(/^([\d.]+(?:,\d+)?) (mio )?EUR/);
  const budget = pool ? (pool[2] ? Math.round((siNum(pool[1]) ?? 0) * 1e6) : siNum(pool[1])) : null;
  const m = c.due.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const closes = m ? `${m[3]}-${m[2]}-${m[1]}T23:59:59.000Z` : null;
  // "Objava javnega poziva [v Ur. l. RS. št. 56/2025] z dne 25. 7. 2025 [in spremembe ...]": the first publication.
  const pub = body.match(/Objava javnega (?:poziva|razpisa)[^\n]*?z dne (\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  const opens = pub ? `${pub[3]}-${pub[2]!.padStart(2, "0")}-${pub[1]!.padStart(2, "0")}T00:00:00.000Z` : null;
  const documents: Grant["documents"] = [];
  for (const a of content.matchAll(/<a[^>]*href="([^"]+\.(?:pdf|docx?|xlsx?|odt|ods|zip|rtf))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(decodeEntities(a[1]!), SITE).href;
    const title = clean(a[2]!);
    if (url.startsWith("https://") && title && !documents.some((d) => d.url === url)) documents.push({ title, url });
  }
  const eligible = body.match(/\nUpravičenci\n+([^\n]+)/)?.[1] ?? "";
  const summary = [[c.type && `Vrsta: ${c.type}`, c.state && `Status: ${c.state}`, c.due && `Rok: do ${c.due}`].filter(Boolean).join("\n"), body].filter(Boolean).join("\n\n").slice(0, 20000);
  const open = /^odprto$/i.test(c.state);
  return {
    id: `si_podjetniski_sklad:${c.slug}`,
    source: "si_podjetniski_sklad",
    source_id: c.slug,
    source_url: c.url,
    source_license: LICENSE,
    title: c.title,
    title_lang: "sl",
    summary: summary || null,
    funder_name: "Slovenski podjetniški sklad",
    funder_level: "national",
    country: "SI",
    regions: [],
    funding_types: fundingTypes(c),
    // The fund's mandate is micro, small and medium-sized enterprises; start-ups are added when the call names them.
    beneficiary_types: /zagonsk|start-?up|zagon /i.test(`${c.title}\n${eligible}`) ? ["sme", "startup"] : ["sme"],
    sectors: [],
    amount_min: min,
    amount_max: max,
    budget_total: budget,
    currency: "EUR",
    status: /^zaprto$/i.test(c.state) || (open && closes !== null && closes < new Date().toISOString()) ? "closed" : open ? "open" : "unknown",
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents,
    source_updated_at: toIso(html?.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1]),
  };
}

export const siPodjetniskiSklad: Source = {
  id: "si_podjetniski_sklad",
  license: LICENSE,
  start() {
    return "1";
  },
  // The cursor is the list page number: one list request and the detail pages of its open calls per call.
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetch(AJAX, {
      method: "POST",
      headers: { ...UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" },
      body: `action=sps_razpisi_live_search&status%5B%5D=__all__&razpis__poziv%5B%5D=__all__&page=${page}`,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Slovenski podjetniški sklad list (page ${page})`);
    const json = (await res.json()) as { success?: boolean; data?: { html?: string; has_more?: boolean } };
    const all = parseCards(json.data?.html ?? "");
    if (all.length === 0 && page === 1) throw new Error("Slovenski podjetniški sklad returned no calls (endpoint or markup change?)");
    const cards = all.filter((c) => !NOT_FUNDING.test(c.title));
    const grants = await mapLimit(cards, 2, async (c) => normalize(c, /^odprto$/i.test(c.state) ? await fetchHtml(c.url, UA) : null));
    return {
      grants,
      raws: cards.map((c, i) => ({ source_id: c.slug, payload: { card: c, summary: grants[i]!.summary } })),
      next: json.data?.has_more && all.length > 0 ? String(page + 1) : null,
    };
  },
};
