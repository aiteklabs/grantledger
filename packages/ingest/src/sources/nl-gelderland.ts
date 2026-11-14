import type { Grant } from "@grantledger/schema";
import { fetchJson, mapLimit, num, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Netherlands, Province of Gelderland: provincial subsidy schemes (gelderland.nl/subsidies).
// The site is a Next.js frontend over Strapi. The overview page only embeds its first 15 rows and pages through a
// search index in the browser, but the Strapi REST API behind it is public: GET strapi.gelderland.nl/api/subsidies
// returns every scheme (about 80 shown in the overview) with status (open, closed, almost_opened), end date,
// subsidy ceiling flag, target groups, kinds and modification time. The API row holds no body text, so each scheme
// that is not closed gets its page, whose __NEXT_DATA__ holds the full content modules (texts, accordions, downloads).
// 20 rows per fetchPage: 1 list request and at most 20 pages. Neither host sets a crawl delay or a Disallow rule.
// Rows with hideFromOverview are general information pages (how to report, kinds of subsidies), not schemes.
const SITE = "https://www.gelderland.nl";
const API = "https://strapi.gelderland.nl/api/subsidies?filters[hideFromOverview][$eq]=false&sort=title:asc&pagination[pageSize]=20&populate[0]=header&populate[1]=target_groups&populate[2]=subsidy_kinds&populate[3]=subsidy_scales&populate[4]=themes";
const LICENSE = "Provincie Gelderland public subsidy information (gelderland.nl)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
// Keys of a content module that hold text, in the order the page shows them.
const TEXT_KEYS = new Set(["value", "accordeonSectionName", "itemTitle", "title", "bodyText", "description", "text"]);

interface Named { name?: string; title?: string }
interface Row {
  documentId: string;
  title: string;
  slug: string;
  endDate: string | null;
  subsidyCeiling: string | null;
  targetGroupText: string | null;
  subsidystatus: string;
  updatedAt: string;
  header?: { excerpt?: string | null } | null;
  target_groups?: Named[];
  subsidy_kinds?: Named[];
  subsidy_scales?: Named[];
  themes?: Named[];
}
interface Detail { text: string; documents: Grant["documents"] }

const clean = (html: string) => stripHtml(html.replace(/<\/t[dh]>(?=\s*<t[dh])/gi, " | ")).replace(/ /g, " ").replace(/[ \t]*\n\s*/g, "\n").trim();

// Collects the texts of the content modules in page order, and the files and links of "Documenten en links".
function walk(node: unknown, texts: string[], documents: Grant["documents"]): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, texts, documents);
    return;
  }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const add = (title: unknown, href: unknown) => {
    const url = typeof href === "string" ? href.trim().replace(/^\//, `${SITE}/`).replace(/ /g, "%20") : "";
    if (/^https:\/\//.test(url) && URL.canParse(url) && documents.length < 30 && !documents.some((d) => d.url === url)) documents.push({ title: (typeof title === "string" && title.trim()) || url, url });
  };
  if (o.__typename === "UploadFile") {
    const file = ((o.data as Record<string, unknown> | undefined)?.attributes ?? o.attributes ?? o) as Record<string, unknown>;
    add(file.caption || file.name, file.url);
    return;
  }
  if (o.__typename === "ComponentComponentsLink") {
    add(o.title, (o.href as Record<string, unknown> | null)?.linkUrl);
    return;
  }
  for (const [key, value] of Object.entries(o)) {
    if (typeof value === "string") {
      const text = TEXT_KEYS.has(key) ? clean(value) : "";
      if (text) texts.push(text);
    } else walk(value, texts, documents);
  }
}

async function detail(slug: string): Promise<Detail | null> {
  const res = await fetch(`${SITE}${slug}`, { headers: UA, redirect: "follow" });
  if (!res.ok) return null;
  const json = (await res.text()).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!json) return null;
  const modules = (JSON.parse(json) as { props?: { pageProps?: { subsidyBySlug?: { modules?: unknown } } } }).props?.pageProps?.subsidyBySlug?.modules;
  if (!modules) return null;
  const texts: string[] = [];
  const documents: Grant["documents"] = [];
  walk(modules, texts, documents);
  return { text: texts.join("\n"), documents };
}

// "€20.000,-", "€ 700.000", "€ 2,5 miljoen". A number with broken thousands groups ("€ 9.9000.000") is a typo on
// the page and gives null rather than a wrong amount.
function euros(text: string | undefined): number | null {
  const m = text?.match(/€\s*(\d[\d.]*(?:,\d+)?)\s*(miljoen|mln|miljard)?/i);
  if (!m || !/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(m[1] as string)) return null;
  const base = num((m[1] as string).replace(/\./g, "").replace(",", "."));
  const unit = (m[2] ?? "").toLowerCase();
  return base === null ? null : base * (unit === "miljard" ? 1e9 : unit ? 1e6 : 1);
}

// The most one applicant can get: the largest "maximaal € ..." of the text. Rates per unit ("maximaal € 500 per
// kilo", "€ 15.000 per hectare") are not amounts per application and are skipped.
function maxAmount(text: string): number | null {
  const found = [...text.matchAll(/(?:maxim(?:um|aal|ale)[^€\n.]{0,25}|ten hoogste )(€\s*\d[\d.,]*(?: miljoen)?)(\s*per (?!aanvra|project|initiatief|onderzoek|gemeente|regio|werkregio|deelnemer)\w+)?/gi)]
    .filter((m) => !m[2])
    .map((m) => euros((m[1] as string).replace(/[.,]+$/, "")))
    .filter((n): n is number => n !== null);
  return found.length ? Math.max(...found) : null;
}

// The scheme budget: "in totaal € 700.000", "een totaalbedrag van € 8 miljoen", "het subsidieplafond € 4.912.000",
// "is € 6.500.000 beschikbaar".
function budget(text: string): number | null {
  const m = text.match(/(?:in totaal|totaalbedrag van|subsidieplafond[^€\n.]{0,30})\s*(€\s*\d[\d.,]*(?: miljoen)?)|(€\s*\d[\d.,]*(?: miljoen)?)\s+beschikbaar/i);
  return m ? euros(((m[1] ?? m[2]) as string).replace(/[.,]+$/, "")) : null;
}

const names = (list: Named[] | undefined) => (list ?? []).map((x) => (x.name ?? x.title ?? "").trim()).filter(Boolean);

function normalize(r: Row, d: Detail | null): Grant {
  const groups = names(r.target_groups);
  const kinds = names(r.subsidy_kinds);
  const beneficiaries = new Set<Grant["beneficiary_types"][number]>();
  if (groups.some((g) => /inwoner/i.test(g))) beneficiaries.add("individual");
  if (groups.some((g) => /ondernemer/i.test(g))) beneficiaries.add("company");
  if (groups.some((g) => /overheid/i.test(g))) beneficiaries.add("public_body");
  if (groups.some((g) => /stichting|vereniging/i.test(g))) beneficiaries.add("ngo");
  const funding = new Set<Grant["funding_types"][number]>();
  if (kinds.some((k) => /lening/i.test(k))) funding.add("loan");
  if (kinds.some((k) => /voucher/i.test(k))) funding.add("voucher");
  if (funding.size === 0 || kinds.some((k) => /project|financiering/i.test(k))) funding.add("grant");
  const state = r.subsidystatus;
  const end = toIso(r.endDate);
  const past = !!end && end < new Date().toISOString();
  const status: Grant["status"] = state === "closed" ? "closed" : state === "almost_opened" ? "forthcoming" : state === "open" ? "open" : "unknown";
  const ceiling = r.subsidyCeiling === "met" ? "Het subsidieplafond is bereikt" : r.subsidyCeiling === "almost_met" ? "Het subsidieplafond is bijna bereikt" : "";
  const text = d?.text ?? "";
  const summary = [
    clean(r.header?.excerpt ?? ""),
    [
      r.targetGroupText && `Voor wie: ${r.targetGroupText.trim()}`,
      groups.length && `Doelgroepen: ${groups.join(", ")}`,
      kinds.length && `Soort subsidie: ${kinds.join(", ")}`,
      names(r.subsidy_scales).length && `Schaal: ${names(r.subsidy_scales).join(", ")}`,
      names(r.themes).length && `Thema's: ${names(r.themes).join(", ")}`,
      `Status: ${state}`,
      end && `Deze subsidie loopt tot: ${end}`,
      ceiling,
    ].filter(Boolean).join("\n"),
    text,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `nl_gelderland:${r.documentId}`,
    source: "nl_gelderland",
    source_id: r.documentId,
    source_url: `${SITE}${r.slug}`,
    source_license: LICENSE,
    title: r.title.trim(),
    title_lang: "nl",
    summary: summary || null,
    funder_name: "Provincie Gelderland",
    funder_level: "regional",
    country: "NL",
    regions: ["NL22"],
    funding_types: [...funding],
    beneficiary_types: [...beneficiaries],
    sectors: [],
    amount_min: null,
    amount_max: maxAmount(text),
    budget_total: budget(text),
    currency: "EUR",
    status,
    opens_at: null,
    // A scheme the province still lists as open after its end date has no usable deadline: the date stays in the summary.
    closes_at: status === "open" && past ? null : end,
    documents: d?.documents ?? [],
    source_updated_at: toIso(r.updatedAt),
  };
}

export const nlGelderland: Source = {
  id: "nl_gelderland",
  license: LICENSE,
  start() {
    return "1";
  },
  // The cursor is the API page number. Closed schemes keep their list data only.
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const { data, meta } = await fetchJson<{ data: Row[]; meta: { pagination: { pageCount: number } } }>(`${API}&pagination[page]=${page}`, { headers: UA });
    const rows = data.filter((r) => r.documentId && r.slug && r.title);
    if (page === 1 && rows.length === 0) throw new Error("Gelderland subsidies API returned no schemes");
    const details = await mapLimit(rows, 2, (r) => (r.subsidystatus === "closed" ? Promise.resolve(null) : detail(r.slug).catch(() => null)));
    const grants = rows.map((r, i) => normalize(r, details[i] ?? null));
    return {
      grants,
      raws: rows.map((r, i) => ({ source_id: r.documentId, payload: { row: r, text: details[i]?.text ?? null } })),
      next: rows.length > 0 && page < meta.pagination.pageCount ? String(page + 1) : null,
    };
  },
};
