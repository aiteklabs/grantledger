import type { Grant } from "@grantledger/schema";
import { fetchJson, statusFromDates, toIso } from "../util";
import type { Page, Source } from "./types";

// Iceland, Ísland.is Styrkjatorg (Grants Plaza): the government portal that lists the funds run by Rannís (the
// Icelandic Centre for Research) and other state agencies. The site is a Next.js frontend over a public GraphQL
// API; the getGrants query returns every grant in English with the publisher's own status, the application period,
// the fund and its agency, category and type tags, attached files and the rich-text sections (emphasis, who can
// apply, how to apply, hints, contact). One request holds the whole list, so no detail request is needed.
// Introspection is disabled; the field list was probed from the validation errors. There is no robots.txt.
const SITE = "https://island.is";
const API = `${SITE}/api/graphql`;
const LICENSE = "Ísland.is public grant information (Stafrænt Ísland, island.is)";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", "content-type": "application/json", accept: "application/json" };
const SIZE = 100;
const SECTIONS = ["specialEmphasis", "whoCanApply", "howToApply", "applicationHints", "answeringQuestions"] as const;
const QUERY = `query($i:GetGrantsInput!){getGrants(input:$i){total items{id name description applicationId applicationUrl{slug} dateFrom dateTo status statusText files{title url} supportLinks{text url} categoryTags{title} typeTag{title} fund{title parentOrganization{title}} ${SECTIONS.map((s) => `${s}{... on Html{document}}`).join(" ")}}}}`;

interface Node { nodeType?: string; value?: string; content?: Node[] }
type Slices = { document?: Node }[] | null;
interface Item {
  id: string;
  name: string;
  description?: string | null;
  applicationId?: string | null;
  applicationUrl?: { slug?: string | null } | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
  statusText?: string | null;
  files?: { title?: string | null; url?: string | null }[] | null;
  supportLinks?: { text?: string | null; url?: string | null }[] | null;
  categoryTags?: { title: string }[] | null;
  typeTag?: { title?: string | null } | null;
  fund?: { title?: string | null; parentOrganization?: { title?: string | null } | null } | null;
  specialEmphasis?: Slices;
  whoCanApply?: Slices;
  howToApply?: Slices;
  applicationHints?: Slices;
  answeringQuestions?: Slices;
}

// Contentful rich text to plain text: one line per paragraph, heading and list item.
function rich(node: Node): string {
  if (node.nodeType === "text") return node.value ?? "";
  const inner = (node.content ?? []).map(rich).join("");
  if (node.nodeType === "list-item") return `- ${inner.replace(/\s+/g, " ").trim()}\n`;
  return /^(paragraph|heading-\d|table-row|hr)$/.test(node.nodeType ?? "") ? `${inner}\n` : inner;
}
const section = (slices: Slices | undefined) => (slices ?? []).map((s) => (s.document ? rich(s.document) : "")).join("").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

// Dates come either as a day ("2026-11-02") or as a UTC instant.
const iso = (value: string | null | undefined, endOfDay: boolean) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z` : toIso(value));
const absolute = (url: string) => (url.startsWith("//") ? `https:${url}` : url.startsWith("/") ? `${SITE}${url}` : url);

function beneficiaries(text: string): Grant["beneficiary_types"] {
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/\bSMEs?\b|small (and|to) medium/i.test(text)) out.add("sme");
  if (/start-?ups?\b/i.test(text)) out.add("startup");
  if (/compan(y|ies)|enterprises?|business(es)?\b|legal entit/i.test(text)) out.add("company");
  if (/individuals?\b|artists?\b|scholars?\b|authors?\b|self-employed/i.test(text)) out.add("individual");
  if (/universit(y|ies)|research (institut|organi[sz]ation)|institutes?\b/i.test(text)) out.add("research_org");
  if (/municipalit|public (institution|bod(y|ies)|organi[sz]ation|entit)|state institution|schools?\b/i.test(text)) out.add("public_body");
  if (/associations?\b|non-profit|non-governmental|NGOs?\b/i.test(text)) out.add("ngo");
  return [...out];
}

function normalize(x: Item): Grant {
  const id = x.applicationId as string;
  const state = x.status ?? "";
  const from = iso(x.dateFrom, false);
  const to = iso(x.dateTo, true);
  const now = new Date().toISOString();
  const status: Grant["status"] = /OPENING_SOON/.test(state) ? "forthcoming" : /^(ALWAYS_)?OPEN/.test(state) ? "open" : /^CLOSED/.test(state) ? "closed" : statusFromDates(from, to);
  // An open grant with an end date in the past carries the dates of an earlier round: the status text has the rest.
  const stale = status === "open" && to !== null && to < now;
  const opens = stale || state.startsWith("ALWAYS_OPEN") ? null : from;
  const closes = stale || state.startsWith("ALWAYS_OPEN") ? null : to;
  const who = section(x.whoCanApply);
  const type = x.typeTag?.title ?? "";
  const tags = (x.categoryTags ?? []).map((t) => t.title);
  const apply = x.applicationUrl?.slug ? absolute(x.applicationUrl.slug) : "";
  const links = (x.supportLinks ?? []).filter((l) => l.url && l.url !== "/").map((l) => (l.text ? `${l.text}: ${absolute(l.url as string)}` : absolute(l.url as string)));
  const part = (label: string, text: string) => text && `${label}:\n${text}`;
  const summary = [
    x.description?.trim(),
    [
      x.fund?.title && `Fund: ${x.fund.title.trim()}`,
      x.fund?.parentOrganization?.title && `Agency: ${x.fund.parentOrganization.title.trim()}`,
      type && `Type: ${type}`,
      tags.length > 0 && `Categories: ${tags.join(", ")}`,
      state && `Status: ${state.replace(/_/g, " ").toLowerCase()}`,
      x.statusText?.trim() && `Status note: ${x.statusText.trim()}`,
      (x.dateFrom || x.dateTo) && `Application period: ${x.dateFrom ?? ""} to ${x.dateTo ?? ""}`,
    ].filter(Boolean).join("\n"),
    part("What is funded", section(x.specialEmphasis)),
    part("Who can apply", who),
    part("How to apply", section(x.howToApply)),
    part("Application hints", section(x.applicationHints)),
    part("Questions and contact", section(x.answeringQuestions)),
    apply && `Application portal: ${apply}`,
    links.length > 0 && `More information:\n${links.join("\n")}`,
  ].filter(Boolean).join("\n\n").slice(0, 20000);
  return {
    id: `is_island:${id}`,
    source: "is_island",
    source_id: id,
    source_url: `${SITE}/en/grants-plaza/grant/${id}`,
    source_license: LICENSE,
    title: x.name.trim(),
    title_lang: "en",
    summary: summary || null,
    funder_name: x.fund?.parentOrganization?.title?.trim() || x.fund?.title?.trim() || null,
    funder_level: "national",
    country: "IS",
    regions: [],
    funding_types: /tax/i.test(type) ? ["tax_credit"] : ["grant"],
    beneficiary_types: beneficiaries(`${x.name} ${who}`),
    sectors: tags.filter((t) => !/^(Within Iceland|International|Financing)$/.test(t)),
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "ISK",
    status,
    opens_at: opens && closes && opens > closes ? null : opens,
    closes_at: closes,
    documents: (x.files ?? []).filter((f) => f.title && f.url && /^(https:)?\/\//.test(f.url)).map((f) => ({ title: (f.title as string).trim(), url: absolute(f.url as string) })),
    source_updated_at: null,
  };
}

export const isIsland: Source = {
  id: "is_island",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(cursor): Promise<Page> {
    const page = Number(cursor);
    const res = await fetchJson<{ data?: { getGrants?: { total: number; items: Item[] } }; errors?: { message: string }[] }>(API, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ query: QUERY, variables: { i: { lang: "en", size: SIZE, page } } }),
    });
    const list = res.data?.getGrants;
    if (!list) throw new Error(`island.is getGrants failed: ${res.errors?.[0]?.message ?? "no data"}`);
    if (page === 1 && list.items.length === 0) throw new Error("island.is returned no grants");
    // Advice desks and contact services ("Consulting and contacts") are not funding.
    const rows = list.items.filter((x) => x.applicationId && x.name && !/consulting/i.test(x.typeTag?.title ?? ""));
    const grants = rows.map(normalize);
    return {
      grants,
      raws: rows.map((x) => ({ source_id: x.applicationId as string, payload: x })),
      next: list.items.length > 0 && page * SIZE < list.total ? String(page + 1) : null,
    };
  },
};
