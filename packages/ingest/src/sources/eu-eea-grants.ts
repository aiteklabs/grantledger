import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// EEA and Norway Grants (Financial Mechanism Office): open calls for proposals in the beneficiary states, from the
// server-rendered list at /en/fmo/funding/calls (a Drupal view, 12 calls per page, ?page=N from 0, open calls only
// by default; closed calls sit behind status=2 and are not read). Each row gives title, beneficiary country,
// programme, call type, status and the submission deadline or "Rolling call"; the call page adds the description,
// eligible applicants, partnerships, amounts and the downloads. The deadline is a real UTC time in the markup
// (22:59Z is 23:59 in Central Europe); its seconds are editing noise and are dropped. Cloudflare sits in front of
// the site. robots.txt: Allow / with Content-Signal search=yes, ai-train=no for general agents.
const SITE = "https://eeagrants.org";
const LIST_URL = `${SITE}/en/fmo/funding/calls`;
const LICENSE = "EEA and Norway Grants public call information (eeagrants.org, Financial Mechanism Office)";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const MAX_PAGES = 10;
const COUNTRIES: Record<string, string> = {
  Bulgaria: "BG", Croatia: "HR", Cyprus: "CY", Czechia: "CZ", "Czech Republic": "CZ", Estonia: "EE", Greece: "GR", Hungary: "HU", Latvia: "LV",
  Lithuania: "LT", Malta: "MT", Poland: "PL", Portugal: "PT", Romania: "RO", Slovakia: "SK", Slovenia: "SI",
};

interface Row { path: string; title: string; countries: string[]; programmes: string[]; deadline: string | null; rolling: boolean; type: string; state: string }

const clean = (html: string): string => stripHtml(html.replace(/\s+/g, " ")).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();

function parseList(page: string): { rows: Row[]; hasNext: boolean } {
  const html = page.replace(/\s+/g, " ");
  const rows: Row[] = [];
  // The card's tag carries more than these three classes since November 2026 (a "teaser" class and a component id).
  for (const m of html.matchAll(/<article class="node node--type-call node--view-mode-teaser[^"]*"[^>]*>([\s\S]*?)<\/article>/g)) {
    const a = m[1] as string;
    const link = a.match(/<a href="(\/en\/[^"]+)" rel="bookmark">([\s\S]*?)<\/a>/);
    if (!link) continue;
    // Each field is a <dt> label and a <dd> value; a value with several entries is a list. The country carries its
    // code ("Poland (PL)"), dropped here.
    const value = (name: string) => a.match(new RegExp(`field--name-field-${name}\\b[\\s\\S]*?<dd>([\\s\\S]*?)<\\/dd>`))?.[1] ?? "";
    const items = (name: string) => (value(name).includes("<li>") ? [...value(name).matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1] as string) : [value(name)]).map((x) => clean(x).replace(/ \([A-Z]{2}\)$/, "")).filter(Boolean);
    rows.push({
      path: link[1] as string,
      title: clean(link[2] as string),
      countries: items("countries"),
      programmes: items("programmes"),
      deadline: a.match(/field--name-field-date[\s\S]*?<time datetime="([^"]+)"/)?.[1] ?? null,
      rolling: /field--name-field-rolling-call/.test(a),
      type: clean(value("is-bilateral")),
      state: clean(value("open-for-applications")),
    });
  }
  return { rows, hasNext: /pager__item--next/.test(html) };
}

// "2027-01-22T22:59:13Z" to "2027-01-22T22:59:00.000Z".
const deadlineIso = (value: string | null): string | null => { const m = value?.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/); return m ? `${m[1]}:00.000Z` : null; };

function status(row: Row): Grant["status"] {
  const closes = deadlineIso(row.deadline);
  if (closes !== null && closes < new Date().toISOString()) return "closed";
  return /^open$/i.test(row.state) ? "open" : "closed";
}

function beneficiaryTypes(s: string): Grant["beneficiary_types"] {
  const t = s.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/\bsmes?\b|small and medium|micro[- ]enterprise/.test(t)) out.add("sme");
  if (/enterprise|compan|private (entit|sector)|commercial|business/.test(t)) out.add("company");
  if (/municipal|public (entit|bod|institution|authorit|sector)|local government|cities|counties|ministr|state institution|regional authorit/.test(t)) out.add("public_body");
  if (/\bngos?\b|non-governmental|civil[- ]society|\bcsos?\b|association|foundation|non-profit|informal group/.test(t)) out.add("ngo");
  if (/universit|research (organisation|organization|institut|entit)|higher education|academ/.test(t)) out.add("research_org");
  if (/natural person|individual|activist|journalist/.test(t)) out.add("individual");
  return [...out];
}

function normalize(row: Row, page: string): Grant {
  const html = page.replace(/\s+/g, " ");
  const node = html.match(/"currentPath":"node\\\/(\d+)"/)?.[1];
  if (!node) throw new Error(`EEA Grants: no node id on ${row.path} (bot challenge or changed markup?)`);
  const full = html.slice(html.indexOf("node--view-mode-full"), html.indexOf("</main>") === -1 ? undefined : html.indexOf("</main>"));
  // The page body in groups: main (description), applicants, details (labelled fields), partnership, downloads.
  const groups = new Map<string, string>();
  for (const part of full.split(/<div class="field-group-(?=[a-z-]+--view-mode-full")/).slice(1)) groups.set(part.slice(0, part.indexOf("--")), part.slice(part.indexOf(">") + 1));
  const labelled = (group: string) => clean((groups.get(group) ?? "").replace(/<div class="field__label">\s*([^<]*?)\s*<\/div>/g, "<p>$1: ").replace(/<h2 class="field__label">([^<]*)<\/h2>/g, "<p>$1: "));
  const content = (field: string) => { const n = num(full.match(new RegExp(`field--name-${field}[\\s\\S]*?<div content="([\\d.]+)"`))?.[1]); return n !== null && n > 0 ? n : null; };
  const published = full.match(/field--name-field-simple-date[\s\S]*?<time datetime="(\d{4}-\d{2}-\d{2})/)?.[1];
  const applicants = labelled("applicants");
  const closes = row.rolling ? null : deadlineIso(row.deadline);
  const documents: Grant["documents"] = [];
  for (const m of (groups.get("downloads") ?? "").matchAll(/<h4 class="file-title">([\s\S]*?)<\/h4>[\s\S]*?<a href="(\/sites\/[^"]+)"/g)) {
    const url = `${SITE}${(m[2] as string).replace(/ /g, "%20")}`;
    if (!documents.some((d) => d.url === url)) documents.push({ title: clean(m[1] as string), url });
  }
  const summary = [
    row.countries.length > 0 && `Beneficiary country: ${row.countries.join(", ")}`,
    row.programmes.length > 0 && `Programme: ${row.programmes.join(", ")}`,
    row.type && `Call type: ${row.type}`,
    row.state && `Status: ${row.state}`,
    row.rolling && "Submission deadline: rolling call",
    labelled("main"),
    applicants,
    labelled("details"),
    labelled("partnership"),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  const codes = [...new Set(row.countries.map((c) => COUNTRIES[c] ?? "XX"))];
  return {
    id: `eu_eea_grants:${node}`,
    source: "eu_eea_grants",
    source_id: node,
    source_url: `${SITE}${row.path}`,
    source_license: LICENSE,
    title: row.title,
    title_lang: "en",
    summary,
    funder_name: "EEA and Norway Grants",
    funder_level: "supranational",
    country: codes.length === 1 ? (codes[0] as string) : codes.length > 1 ? "EU" : "XX",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(`${applicants} ${row.programmes.join(" ")} ${row.path}`),
    sectors: [],
    amount_min: content("field-grant-from"),
    amount_max: content("field-grant-to"),
    budget_total: content("field-budget"),
    currency: "EUR",
    status: status(row),
    opens_at: published ? `${published}T00:00:00.000Z` : null,
    closes_at: closes,
    documents,
    source_updated_at: null,
  };
}

export const euEeaGrants: Source = {
  id: "eu_eea_grants",
  license: LICENSE,
  start() {
    return "0";
  },
  // The cursor is the list page number (from 0): one list page and the call pages of its rows.
  async fetchPage(cursor): Promise<Page> {
    const pageNo = Number(cursor);
    const { rows, hasNext } = parseList(await fetchHtml(`${LIST_URL}?page=${pageNo}`, UA));
    if (pageNo === 0 && rows.length === 0) throw new Error("EEA Grants: no calls on the list page (bot challenge or changed markup?)");
    const current = rows.filter((r) => status(r) !== "closed");
    const pages = await mapLimit(current, 2, (r) => fetchHtml(`${SITE}${r.path}`, UA));
    const grants = current.map((r, i) => normalize(r, pages[i] as string));
    return {
      grants,
      raws: grants.map((g, i) => ({ source_id: g.source_id, payload: { ...current[i], summary: g.summary } })),
      next: hasNext && rows.length > 0 && pageNo + 1 < MAX_PAGES ? String(pageNo + 1) : null,
    };
  },
};
