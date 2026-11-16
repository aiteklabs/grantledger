import type { Grant } from "@grantledger/schema";
import { stripHtml } from "../util";
import type { Page, Source } from "./types";

// Belgium, Brussels: the subsidy directory of hub.brussels (info.hub.brussels/outils/subsides), the Brussels
// counterpart of 1890.be: about 107 permanent aid schemes for Brussels businesses (regional, federal, community,
// municipal and one European), without dates. robots.txt disallows every URL with a query string except the sitemap
// ("Disallow: /*?*", "Allow: /sitemap.xml?*"), so the paged list (?page=N) is off limits: the scheme pages are found
// through the sitemap instead (/subsides/<slug>, French) and each one is read for its text. robots.txt also asks for
// a 10 second crawl delay: each fetchPage makes one request, with that pause before it. A full crawl is the sitemap
// index, its 2 pages and one request per scheme, about 110 requests and 18 minutes.
const SITE = "https://info.hub.brussels";
const SITEMAP = `${SITE}/sitemap.xml`;
const LICENSE = "hub.brussels public subsidy directory (info.hub.brussels)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const CRAWL_DELAY_MS = 10_000;
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const LEVELS: Record<string, Grant["funder_level"]> = { "communal": "local", "communautaire": "regional", "régional": "regional", "fédéral": "national", "européen": "supranational" };

// `maps` is null before the sitemap index is read, then the sitemap pages still to read; `queue` holds the scheme
// slugs still to read.
interface Cursor { maps: string[] | null; queue: string[] }

const pause = () => new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
const plain = (html: string | undefined) => (html ? stripHtml(html).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() : "");
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => (m[1] as string).replace(/&amp;/g, "&").trim());
const schemes = (xml: string) => locs(xml).filter((u) => u.startsWith(`${SITE}/subsides/`)).map((u) => u.slice(`${SITE}/subsides/`.length)).filter((s) => s && !/[/?#]/.test(s));

// Null for a page that is gone (the sitemap is rebuilt once a day and can name a scheme that was just removed).
async function get(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// "Type d'aide" has four values: Primes, Incitants fiscaux, Financements (loans, guarantees, equity, but also the
// Innoviris research programmes) and Aides à l'emploi (premiums, reductions of charges, subsidised contracts). The
// last two are narrowed with the words of the scheme text.
function fundingTypes(types: string[], text: string): Grant["funding_types"] {
  const out = new Set<Grant["funding_types"][number]>();
  const t = text.toLowerCase();
  for (const type of types.map((x) => x.toLowerCase())) {
    if (/prime|subside|subvention/.test(type)) out.add("grant");
    else if (/fiscal|fiscaux/.test(type)) out.add("tax_credit");
    else if (/financement/.test(type)) {
      const before = out.size;
      if (/prêt|crédit|dette/.test(t)) out.add("loan");
      if (/garantie/.test(t)) out.add("guarantee");
      if (/prise de participation|capital d.amorçage|capital à risque/.test(t)) out.add("equity");
      if (out.size === before) out.add(/subside|subvention/.test(t) ? "grant" : "other");
    } else if (/emploi/.test(type)) out.add(/prime|subside|allocation|intervention financière/.test(t) ? "grant" : /réduction|exonération|dispense/.test(t) ? "tax_credit" : "other");
    else out.add("other");
  }
  return [...out];
}

function normalize(slug: string, html: string): Grant {
  const start = html.indexOf("layout__top--node--grant--full");
  const end = html.indexOf("grant__layout__bottom--full", start);
  if (start === -1) throw new Error(`hub.brussels scheme page without a grant block: ${slug}`);
  const node = html.slice(start, end === -1 ? undefined : end);
  // One field block: from its class name to the next field block or the end of its region.
  const block = (name: string) => node.match(new RegExp(`field--name-${name}\\b[^>]*>([\\s\\S]*?)(?=<div class="field |<div\\s+class="column"|</header>|</footer>|<header |<footer |<div class="layout__region|$)`))?.[1] ?? "";
  const values = (name: string) => [...block(name).matchAll(/<div class="field__item[^"]*">([\s\S]*?)<\/div>/g)].map((m) => plain(m[1])).filter(Boolean);
  const text = (name: string) => plain(block(name).replace(/^\s*<div>[^<]*<\/div>/, "").replace(/<h3[^>]*>[\s\S]*?<\/h3>/, ""));
  const title = plain(node.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]);
  const changed = text("node-changed-date").match(/(\d{1,2})(?:er)? (\S+) (\d{4})/);
  const month = changed ? MONTHS.indexOf((changed[2] as string).toLowerCase()) : -1;
  const goals = values("field-grantprojectcategory");
  const types = values("field-granttype");
  const levels = values("field-grantlevel");
  const institution = plain(block("field-grantinstitution").replace(/<h3[^>]*>[\s\S]*?<\/h3>/, "")).replace(/\n/g, ", ");
  const resume = text("field-summary");
  const description = text("field-contentdescription");
  const links = [...block("field-relatedpages").matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => `${plain(m[2])} (${(m[1] as string).replace(/&amp;/g, "&")})`);
  const summary = [
    resume && `En résumé:\n${resume}`,
    description && `De quoi s'agit-il?\n${description}`,
    goals.length > 0 && `Objectif: ${goals.join(", ")}`,
    types.length > 0 && `Type d'aide: ${types.join(", ")}`,
    levels.length > 0 && `Niveau de compétence: ${levels.join(", ")}`,
    institution && `Institut: ${institution}`,
    links.length > 0 && `Plus d'information: ${links.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  const all = `${title} ${resume} ${description}`;
  return {
    id: `be_hub_brussels:${slug}`,
    source: "be_hub_brussels",
    source_id: slug,
    source_url: `${SITE}/subsides/${slug}`,
    source_license: LICENSE,
    title: title || slug,
    title_lang: "fr",
    summary: summary || null,
    // The body that grants the aid, when the directory names one (it does not for most federal measures).
    funder_name: institution || null,
    funder_level: LEVELS[(levels[0] ?? "").toLowerCase()] ?? "regional",
    country: "BE",
    regions: ["BE10"],
    funding_types: fundingTypes(types, all),
    beneficiary_types: /indépendant|personne physique/i.test(all) ? ["company", "sme", "individual"] : ["company", "sme"],
    sectors: goals,
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    // The directory only lists schemes that are available; they have no opening or closing dates.
    status: "open",
    opens_at: null,
    closes_at: null,
    documents: [],
    source_updated_at: changed && month !== -1 ? `${changed[3]}-${String(month + 1).padStart(2, "0")}-${(changed[1] as string).padStart(2, "0")}T00:00:00.000Z` : null,
  };
}

export const beHubBrussels: Source = {
  id: "be_hub_brussels",
  license: LICENSE,
  start() {
    return JSON.stringify({ maps: null, queue: [] } satisfies Cursor);
  },
  // One request per call: the sitemap index, then each sitemap page (no records yet), then one scheme page per call.
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const step = (next: Cursor): Page => ({ grants: [], raws: [], next: next.maps?.length || next.queue.length ? JSON.stringify(next) : null });
    if (c.maps === null) {
      const xml = await get(SITEMAP);
      if (!xml) throw new Error("hub.brussels sitemap not found");
      // A sitemap index names its pages; a plain sitemap holds the URLs itself.
      const maps = /<sitemapindex/.test(xml) ? locs(xml).filter((u) => u.startsWith(`${SITEMAP}?`)) : [];
      const queue = schemes(xml);
      if (maps.length === 0 && queue.length === 0) throw new Error("hub.brussels sitemap lists no pages (bot challenge or changed sitemap?)");
      return step({ maps, queue });
    }
    if (c.maps.length > 0) {
      const [map, ...maps] = c.maps as [string, ...string[]];
      await pause();
      const xml = await get(map);
      const queue = [...new Set([...c.queue, ...schemes(xml ?? "")])];
      if (maps.length === 0 && queue.length === 0) throw new Error("hub.brussels sitemap lists no subsidy pages (changed URL scheme?)");
      return step({ maps, queue });
    }
    const [slug, ...rest] = c.queue;
    if (!slug) return { grants: [], raws: [], next: null };
    await pause();
    const html = await get(`${SITE}/subsides/${slug}`);
    const grant = html ? normalize(slug, html) : null;
    return { grants: grant ? [grant] : [], raws: grant ? [{ source_id: slug, payload: { slug, summary: grant.summary } }] : [], next: rest.length ? JSON.stringify({ maps: [], queue: rest }) : null };
  },
};
