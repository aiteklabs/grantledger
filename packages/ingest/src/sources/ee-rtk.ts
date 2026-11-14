import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, num, statusFromDates, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Estonia, Riigi Tugiteenuste Keskus (State Shared Service Centre, RTK): application rounds for EU structural funds,
// the recovery facility, the modernisation fund and national programmes that RTK runs. One server-rendered page
// lists the rounds in three hand-edited blocks (open, opening soon, closed), each entry a button link to the
// measure page followed by a short list: application period, target group, purpose, field. The measure page adds
// what is funded, who can apply, amounts and the budget; it is read for open and upcoming rounds only. Cloudflare
// sits in front of the site; robots.txt allows these paths and sets no crawl delay.
const SITE = "https://www.rtk.ee";
const LIST_URL = `${SITE}/toetused-taotlemine/taotlusvoorud/avatud-ja-suletud-taotlusvoorud`;
const LICENSE = "Riigi Tugiteenuste Keskus public application round information (rtk.ee)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PER_PAGE = 20;

type Section = "open" | "soon" | "closed";
interface Item { id: string; url: string; title: string; section: Section; fields: string[]; opens: string | null; closes: string | null }

const clean = (text: string) => text.replace(/\u200b/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

// "alates 03.08.2026 kuni 18.11.2026 kell 16.00": the first date opens the round, the last of several closes it.
function period(text: string): { opens: string | null; closes: string | null } {
  const dates = [...text.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
  const first = dates[0];
  const last = dates.length > 1 ? dates.at(-1) : undefined;
  if (!first) return { opens: null, closes: null };
  const time = last ? text.slice((last.index ?? 0) + 10).match(/^[\s,]*kell\s*(\d{1,2})[.:](\d{2})/) : null;
  return {
    opens: `${first[3]}-${first[2]}-${first[1]}T00:00:00.000Z`,
    closes: last ? `${last[3]}-${last[2]}-${last[1]}T${time ? `${(time[1] as string).padStart(2, "0")}:${time[2]}:00` : "23:59:59"}.000Z` : null,
  };
}

function parseList(html: string): Item[] {
  const marks: [Section, number][] = [["open", html.indexOf('id="Avatud_taotlusvoorud"')], ["soon", html.indexOf('id="Peagi_avanevad_taotlusvoorud"')], ["closed", html.indexOf('id="Suletud_taotlusvoorud"')]];
  if (marks.some(([, at]) => at === -1)) return [];
  const end = html.indexOf("</article>", marks[2]![1]);
  const items: Item[] = [];
  const seen = new Set<string>();
  marks.forEach(([section, from], s) => {
    const part = html.slice(from, marks[s + 1]?.[1] ?? (end === -1 ? html.length : end));
    const links = [...part.matchAll(/<a\b([^>]*\bclass="btn btn-secondary"[^>]*)>([\s\S]*?)<\/a>/g)];
    links.forEach((m, i) => {
      const href = (m[1] as string).match(/href="([^"#]+)"/)?.[1];
      const path = href?.replace(/^https?:\/\/(www\.)?rtk\.ee/, "");
      const title = clean(stripHtml(m[2] as string)).replace(/\n/g, " ");
      if (!path || !path.startsWith("/") || !title) return;
      const id = path.replace(/^\/+|\/+$/g, "").toLowerCase();
      if (!id || seen.has(id)) return;
      seen.add(id);
      // The entry's own list ends at the first </ul>; the next button starts the next entry.
      const after = (m.index ?? 0) + m[0].length;
      const listEnd = part.indexOf("</ul>", after);
      const next = links[i + 1]?.index ?? part.length;
      const lines = clean(stripHtml(part.slice(after, listEnd === -1 ? next : Math.min(next, listEnd)))).split("\n");
      // "Label:" opens a field, the lines after it belong to that field.
      const fields: string[] = [];
      for (const line of lines) {
        if (/^[A-ZÕÄÖÜ][^:.]{2,40}:/.test(line) || fields.length === 0) fields.push(line);
        else fields[fields.length - 1] = `${fields.at(-1)} ${line}`.replace(/: +/, ": ");
      }
      const apply = fields.find((f) => /^Taotlemine/i.test(f)) ?? "";
      items.push({ id, url: `${SITE}${path}`, title, section, fields: fields.filter((f) => f.includes(":")), ...period(apply) });
    });
  });
  return items;
}

// The measure page without the contact cards: the article components up to the contacts block.
function body(html: string): string {
  const from = html.indexOf("field--name-field-article-components");
  if (from === -1) return "";
  const contacts = html.indexOf("paragraph--type--contacts", from);
  const end = html.indexOf("</article>", from);
  const to = contacts !== -1 ? contacts : end !== -1 ? end : html.length;
  return clean(stripHtml(html.slice(html.indexOf(">", from) + 1, html.lastIndexOf("<", to)))).replace(/\n(Ava kõik|Sulge kõik)(?=\n|$)/g, "");
}

const euros = (value: string | undefined) => (value ? num(value.replace(/\s/g, "")) : null);

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/mikro- ja väike|väikeettevõt|väikese ja keskmise|vke\b/.test(t)) out.add("sme");
  if (/ettevõt|äriühing/.test(t)) out.add("company");
  if (/omavalitsus|kov\b|kovid|riigiasutus|riigivara|keskvalitsus|avalik-õiguslik|valitsussektor|kooli pidaja|üldhariduskool/.test(t)) out.add("public_body");
  if (/mittetulundus|sihtasutus|vabaühendus/.test(t)) out.add("ngo");
  if (/teadusasutus|ülikool|kõrgkool/.test(t)) out.add("research_org");
  return [...out];
}

function grant(item: Item, text: string): Grant {
  const fallback: Grant["status"] = item.section === "soon" ? "forthcoming" : "open";
  const dated = statusFromDates(item.opens, item.closes);
  const status: Grant["status"] = item.section === "closed" ? "closed" : dated === "unknown" ? fallback : dated;
  const target = item.fields.find((f) => /^Sihtgrupp/i.test(f)) ?? "";
  const max = text.match(/maksimaalne (?:summa|suurus) on ([\d\s]+) eurot(?! ruutmeetri)/i)?.[1];
  const budget = text.match(/(?:eelarve|mahuks)(?: kokku)? on ([\d\s]+) eurot/i)?.[1];
  const summary = [item.fields.join("\n"), text].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `ee_rtk:${item.id}`,
    source: "ee_rtk",
    source_id: item.id,
    source_url: item.url,
    source_license: LICENSE,
    title: item.title,
    title_lang: "et",
    summary: summary || null,
    funder_name: "Riigi Tugiteenuste Keskus",
    funder_level: "national",
    country: "EE",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaries(target),
    sectors: [],
    amount_min: null,
    amount_max: euros(max),
    budget_total: euros(budget),
    currency: "EUR",
    status,
    opens_at: item.opens,
    closes_at: item.closes,
    documents: [],
    source_updated_at: null,
  };
}

async function build(items: Item[]): Promise<Pick<Page, "grants" | "raws">> {
  const texts = await mapLimit(items, 2, (item) => (item.section === "closed" ? Promise.resolve("") : fetchHtml(item.url, UA).then(body).catch(() => "")));
  return {
    grants: items.map((item, i) => grant(item, texts[i] ?? "")),
    raws: items.map((item, i) => ({ source_id: item.id, payload: { ...item, text: texts[i] ?? "" } })),
  };
}

export const eeRtk: Source = {
  id: "ee_rtk",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": the list page, the closed rounds (no detail request) and the first open or upcoming rounds with
  // their measure pages. If more than PER_PAGE rounds are current, the cursor carries the rest as a JSON list.
  async fetchPage(cursor): Promise<Page> {
    let items: Item[];
    if (cursor === "start") {
      const all = parseList(await fetchHtml(LIST_URL, UA));
      if (!all.some((i) => i.section !== "closed")) throw new Error("RTK returned no open or upcoming application rounds (bot challenge or layout change?)");
      items = [...all.filter((i) => i.section === "closed"), ...all.filter((i) => i.section !== "closed")];
    } else {
      items = JSON.parse(cursor) as Item[];
    }
    const closed = items.filter((i) => i.section === "closed");
    const current = items.filter((i) => i.section !== "closed");
    const rest = current.slice(PER_PAGE);
    return { ...(await build([...closed, ...current.slice(0, PER_PAGE)])), next: rest.length ? JSON.stringify(rest) : null };
  },
};
