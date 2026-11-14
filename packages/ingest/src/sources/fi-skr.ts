import type { Grant } from "@grantledger/schema";
import { decodeEntities, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Finland, Suomen Kulttuurirahasto (Finnish Cultural Foundation): the foundation's grant types for science and art.
// The site is WordPress with a public REST API: /wp-json/wp/v2/grant lists the grant pages (custom post type) with
// the rendered page content, the themes and the application period (grant_date_info: a text and the end as a Unix
// time that holds the Finnish wall-clock time). Every grant exists in Finnish and most in English (Polylang); the
// Finnish set is the complete one, so only lang=fi is read and each grant gives one record. The API caps a page at
// 15 posts, so the pages are followed with X-WP-TotalPages. The page content embeds the full application guide,
// which is the same long text on most grants: the text is cut where the guide starts, and the contact persons are
// left out. Grants listed under "Muut haut" (other rounds, applied for elsewhere) have no dates and no status.
const API = "https://skr.fi/wp-json/wp/v2/grant?lang=fi&per_page=15&orderby=id&order=asc&_fields=id,slug,link,modified_gmt,title,excerpt,content,grant_date_info,grant_theme_list";
const LICENSE = "Suomen Kulttuurirahasto public grant information (skr.fi)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "application/json" };

interface Post {
  id: number;
  slug: string;
  link: string;
  modified_gmt?: string;
  title: { rendered: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  grant_date_info?: { text?: string; end_date?: number | false | null }[] | null;
  grant_theme_list?: { theme_name?: string }[] | null;
}

function plain(html: string | null | undefined): string {
  return html ? stripHtml(html).replace(/[\u00a0\u200b]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim() : "";
}

// A Finnish wall-clock time as ISO in UTC. Finland is UTC+3 from the last Sunday of March to the last Sunday of
// October, else UTC+2.
function helsinkiIso(year: number, month: number, day: number, hour: number, minute: number): string {
  const lastSunday = (m: number) => { const end = new Date(Date.UTC(year, m + 1, 0)); return end.getUTCDate() - end.getUTCDay(); };
  const summer = (month > 2 && month < 9) || (month === 2 && day >= lastSunday(2)) || (month === 9 && day < lastSunday(9));
  return new Date(Date.UTC(year, month, day, hour - (summer ? 3 : 2), minute)).toISOString();
}

// The application period of one entry: "Kulttuurirahaston haku: 15.–30.10.2026 klo 16 asti" with the end as a Unix
// time, or "Ympäri vuoden 1.10.2026 alkaen" (all year round from a day on).
function period(info: NonNullable<Post["grant_date_info"]>[number]): { opens: string | null; closes: string | null } {
  const text = info.text ?? "";
  const end = typeof info.end_date === "number" ? new Date(info.end_date * 1000) : null;
  const closes = end ? helsinkiIso(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()) : null;
  const range = text.match(/(\d{1,2})\.(?:(\d{1,2})\.)?(\d{4})?\s*[–-]\s*\d{1,2}\.(\d{1,2})\.(\d{4})/);
  const from = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}) alkaen/);
  const day = (y: string, m: string, d: string) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00.000Z`;
  const opens = range ? day(range[3] ?? (range[5] as string), range[2] ?? (range[4] as string), range[1] as string) : from ? day(from[3] as string, from[2] as string, from[1] as string) : null;
  return { opens, closes };
}

function beneficiaryTypes(text: string): Grant["beneficiary_types"] {
  const t = (text.match(/Kuka voi hakea[\s\S]{0,700}/)?.[0] ?? "").toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/yksityishenkilö|työryhm|taiteilij|tutkij|muusiko|opiskelij|tohtor|kirjoittaj|kääntäj/.test(t)) out.add("individual");
  if (/yhteisö|yhdisty|järjestö/.test(t)) out.add("ngo");
  if (/yliopisto|korkeakoul|tutkimuslaito/.test(t)) out.add("research_org");
  if (/kustan|yrity/.test(t)) out.add("company");
  return [...out].sort();
}

function normalize(p: Post): Grant {
  const html = p.content?.rendered ?? "";
  const guide = html.search(/<section[^>]*class="block-guides/);
  const body = plain((guide >= 0 ? html.slice(0, guide) : html).replace(/<section[^>]*class="block-person-lift[\s\S]*?<\/section>/g, " "));
  const infos = (p.grant_date_info ?? []).filter((i) => i.text?.trim());
  const now = new Date().toISOString();
  const periods = infos.map(period).filter((x) => x.opens || x.closes);
  // With several periods the next one that has not ended counts, else the last one.
  const current = periods.filter((x) => !x.closes || x.closes >= now).sort((a, b) => (a.closes ?? "9").localeCompare(b.closes ?? "9"))[0] ?? periods.sort((a, b) => (a.closes ?? "").localeCompare(b.closes ?? "")).at(-1);
  const opens = current?.opens ?? null;
  const closes = current?.closes ?? null;
  const themes = (p.grant_theme_list ?? []).map((t) => t.theme_name ?? "").filter(Boolean);
  const title = decodeEntities(p.title.rendered.replace(/<[^>]+>/g, "")).trim();
  // "Haettavan apurahan suuruus voi olla 3 000–10 000 euroa": the size of one grant, when the page gives a range.
  const range = body.match(/(\d[\d ]*)\s*[–-]\s*(\d[\d ]*)\s*euroa/);
  const summary = [
    plain(p.excerpt?.rendered),
    [themes.length > 0 && `Teemat: ${themes.join(", ")}`, ...infos.map((i) => `Hakuaika: ${(i.text as string).replace(/\s+/g, " ").trim()}`)].filter(Boolean).join("\n"),
    body,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `fi_skr:${p.id}`,
    source: "fi_skr",
    source_id: String(p.id),
    source_url: p.link,
    source_license: LICENSE,
    title,
    title_lang: "fi",
    summary: summary || null,
    funder_name: "Suomen Kulttuurirahasto",
    funder_level: "national",
    country: "FI",
    regions: [],
    // The instrument collection is lent, not granted as money.
    funding_types: /soitinlaina/i.test(title) ? ["other"] : ["grant"],
    beneficiary_types: beneficiaryTypes(body),
    sectors: themes,
    amount_min: range ? num((range[1] as string).replace(/ /g, "")) : null,
    amount_max: range ? num((range[2] as string).replace(/ /g, "")) : null,
    budget_total: null,
    currency: "EUR",
    status: statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: p.modified_gmt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(p.modified_gmt) ? `${p.modified_gmt}.000Z` : null,
  };
}

export const fiSkr: Source = {
  id: "fi_skr",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetch(`${API}&page=${page}`, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for the Suomen Kulttuurirahasto grant list (page ${page})`);
    const posts = (await res.json()) as Post[];
    if (page === 1 && posts.length === 0) throw new Error("Suomen Kulttuurirahasto returned no grants (changed API?)");
    const grants = posts.map(normalize);
    const pages = Number(res.headers.get("x-wp-totalpages") ?? "1");
    return {
      grants,
      // The page content (about 100 kB of HTML each) is not archived; the summary holds its text.
      raws: posts.map((p, i) => ({ source_id: String(p.id), payload: { id: p.id, slug: p.slug, link: p.link, modified_gmt: p.modified_gmt, title: p.title.rendered, grant_date_info: p.grant_date_info, grant_theme_list: p.grant_theme_list, text: grants[i]!.summary } })),
      next: page < pages ? String(page + 1) : null,
    };
  },
};
