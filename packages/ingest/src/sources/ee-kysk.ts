import type { Grant } from "@grantledger/schema";
import { decodeEntities, fetchHtml, fetchJson, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Estonia, Kodanikuühiskonna Sihtkapital (National Foundation of Civil Society, KÜSK): grant rounds for NGOs and
// scholarships for community leaders. The page "Taotlusvoorud" lists every round in two blocks, running and ended,
// each row with the publisher's own state: "Sulgub 24.02.2027 kell 18:00" (closes), "Jooksvalt avatud" (open until
// the budget runs out) or "Sulgus 11.10.2026" (closed). The call text of the running rounds comes from the WordPress
// REST type "applications", filtered by slug: two requests per crawl. KÜSK is also the Estonian contact point for
// the EU programme CERV and relays its calls in the same list; those are EU calls, not KÜSK rounds, and are left out.
const LIST_URL = "https://kysk.ee/taotlejale/toetused-vabauhendustele/taotlusvoorud/";
const API = "https://kysk.ee/wp-json/wp/v2/applications";
const LICENSE = "Kodanikuühiskonna Sihtkapital public application round information (kysk.ee)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

interface Row { slug: string; url: string; title: string; state: string; ended: boolean }
interface Post { slug: string; modified_gmt?: string; content?: { rendered?: string } }

function parseList(html: string): Row[] {
  const endedFrom = html.search(/<h3[^>]*>\s*Lõppenud/);
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a href="(https:\/\/kysk\.ee\/[^"]*\/taotlusvoorud\/([^"/]+)\/?)" class="application-item[^"]*">([\s\S]*?)<\/a>/g)) {
    const slug = m[2] as string;
    const title = stripHtml((m[3] as string).match(/<h6>([\s\S]*?)<\/h6>/)?.[1] ?? "").replace(/\s+/g, " ").trim();
    if (!title || seen.has(slug) || /CERV/i.test(`${title} ${slug}`)) continue;
    seen.add(slug);
    rows.push({ slug, url: m[1] as string, title, state: stripHtml((m[3] as string).match(/application-item__date[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/\s+/g, " ").trim(), ended: endedFrom !== -1 && (m.index ?? 0) > endedFrom });
  }
  return rows;
}

// "Sulgub 24.02.2027 kell 18:00" -> the Estonian wall-clock time with a Z suffix; without a time, the end of the day.
function stateDate(state: string, endOfDay: boolean): string | null {
  const m = state.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+kell\s+(\d{1,2})[:.](\d{2}))?/);
  if (!m) return null;
  const time = m[4] ? `${m[4].padStart(2, "0")}:${m[5]}:00` : endOfDay ? "23:59:59" : "00:00:00";
  return `${m[3]}-${m[2]}-${m[1]}T${time}.000Z`;
}

const euros = (value: string | undefined) => (value ? num(value.replace(/\s/g, "")) : null);

function grant(row: Row, post: Post | undefined): Grant {
  const upcoming = /^Avaneb/i.test(row.state);
  const text = post?.content?.rendered ? stripHtml(post.content.rendered).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") : "";
  const summary = [row.state && `Taotlusvooru seis: ${row.state}`, text].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `ee_kysk:${row.slug}`,
    source: "ee_kysk",
    source_id: row.slug,
    source_url: row.url,
    source_license: LICENSE,
    title: decodeEntities(row.title),
    title_lang: "et",
    summary: summary || null,
    funder_name: "Kodanikuühiskonna Sihtkapital",
    funder_level: "national",
    country: "EE",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: /stipendium/i.test(row.title) ? ["individual"] : ["ngo"],
    sectors: [],
    amount_min: null,
    amount_max: euros(text.match(/ülemmäär[^.\n]{0,60}? on ([\d\s]+) eurot/i)?.[1]),
    budget_total: euros(text.match(/eelarve(?: on)? ([\d\s]+) eurot/i)?.[1]),
    currency: "EUR",
    status: row.ended ? "closed" : upcoming ? "forthcoming" : "open",
    opens_at: upcoming ? stateDate(row.state, false) : null,
    closes_at: upcoming ? null : stateDate(row.state, true),
    documents: [],
    source_updated_at: post?.modified_gmt ? `${post.modified_gmt}.000Z` : null,
  };
}

export const eeKysk: Source = {
  id: "ee_kysk",
  license: LICENSE,
  start() {
    return "start";
  },
  // One page: the list (every round with its state), then the call text of the running rounds in one REST request.
  // Ended rounds keep their list data only.
  async fetchPage(): Promise<Page> {
    const rows = parseList(await fetchHtml(LIST_URL, UA));
    if (rows.length === 0) throw new Error("KÜSK returned no application rounds (layout change?)");
    const running = rows.filter((r) => !r.ended);
    const posts = running.length ? await fetchJson<Post[]>(`${API}?slug=${running.map((r) => encodeURIComponent(r.slug)).join(",")}&per_page=100&_fields=slug,modified_gmt,content`, { headers: UA }) : [];
    const bySlug = new Map(posts.map((p) => [p.slug, p]));
    const grants = rows.map((r) => grant(r, bySlug.get(r.slug)));
    return { grants, raws: rows.map((r) => ({ source_id: r.slug, payload: { ...r, post: bySlug.get(r.slug) ?? null } })), next: null };
  },
};
