import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Ireland, Research Ireland (Taighde Éireann): static Next.js site on S3/CloudFront, no JSON API. The funding page
// embeds its React Server Components payload with all calls in three tabs (open, upcoming, closed); each call page
// embeds its eligibility text and last-updated date the same way.
const SITE = "https://www.researchireland.ie";
const LIST = `${SITE}/funding/`;
const LICENSE = "Research Ireland public funding call information";
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml" };
const PAGE_SIZE = 10;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

interface Cursor { offset: number }

interface Item {
  status: string;
  deadlines?: { label: string; date: string }[] | string;
  programeType?: string;
  careerStage?: string;
  awardAmount?: string;
  duration?: string;
  title: string;
  description?: string;
  tags?: string[];
  href: string;
}

interface Detail { eligibility: string; updated: string | null }

// The RSC payload is split across many self.__next_f.push([1,"..."]) scripts; joined it is one row per line, "id:value".
function rscText(html: string): string {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)].map((m) => JSON.parse(`"${m[1]}"`) as string).join("");
}

// Large strings are moved to their own row ("1f:T108d,<html>") and referenced as "$1f".
function rscRow(text: string, id: string): string {
  const m = text.match(new RegExp(`(?:^|\\n)${id}:(?:T[0-9a-f]+,)?([\\s\\S]*?)(?=\\n[0-9a-f]+:|$)`));
  return m?.[1] ?? "";
}

// Slice the JSON value that follows `key` (a string, object or array), skipping brackets inside strings.
function jsonAfter(text: string, key: string): string | null {
  const start = text.indexOf(key);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start + key.length; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') { inString = false; if (depth === 0) return text.slice(start + key.length, i + 1); }
    } else if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) return text.slice(start + key.length, i + 1); }
  }
  return null;
}

// "6th November 2026, 13:00 (local Irish time)", "Friday 6th November, 2026", "Rolling" (null).
function ieDate(v: string): string | null {
  const m = v.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.toLowerCase());
  if (month === -1) return null;
  const time = v.match(/(\d{1,2}):(\d{2})/);
  const hhmm = time ? `${time[1]!.padStart(2, "0")}:${time[2]}:00` : "23:59:59";
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}T${hhmm}.000Z`;
}

// "€600,000 - €1,500,000 (direct costs)", "Max €500,000", "€2.25M to 3.25M".
function euros(v: string): number[] {
  return [...v.matchAll(/€\s*(\d[\d,]*(?:\.\d+)?)\s*([mMkK])?|(?<=to |and )(\d[\d,]*(?:\.\d+)?)\s*([mMkK])/g)].map((m) => {
    const n = Number((m[1] ?? m[3])!.replace(/,/g, ""));
    const unit = (m[2] ?? m[4] ?? "").toLowerCase();
    return unit === "m" ? n * 1_000_000 : unit === "k" ? n * 1000 : n;
  });
}

function parseDetail(html: string): Detail {
  const text = rscText(html);
  const updated = text.match(/"lastUpdated":"([^"]*)"/)?.[1] ?? "";
  // Call pages title the section "Eligibility" or "Who can apply?"; some (rolling partnerships, upcoming calls) have none.
  const ref = text.match(/"title":"\s*(?:Eligibility|Who can apply)[^"]*","content":"(\$[0-9a-f]+|(?:[^"\\]|\\.)*)"/)?.[1] ?? "";
  const raw = ref.startsWith("$") ? rscRow(text, ref.slice(1)) : (JSON.parse(`"${ref}"`) as string);
  return { eligibility: stripHtml(raw).replace(/\n\s*\n+/g, "\n"), updated: updated ? toIso(updated) : null };
}

function normalize(it: Item, d: Detail): Grant {
  const slug = it.href.split("/").filter(Boolean).pop() ?? it.href;
  const deadlines = Array.isArray(it.deadlines) ? it.deadlines.filter((x) => x.date.trim()) : [];
  const dated = deadlines.map((x) => ieDate(x.date)).filter((x): x is string => !!x).sort();
  const closes = dated[dated.length - 1] ?? null;
  const status: Grant["status"] = it.status === "closed" ? "closed" : it.status === "upcoming" ? "forthcoming" : "open";
  const amounts = euros(it.awardAmount ?? "").sort((a, b) => a - b);
  const bens = new Set<Grant["beneficiary_types"][number]>(["research_org", "individual"]);
  if (/industry|enterprise|company|companies/i.test(`${it.tags?.join(" ")} ${it.title} ${it.description}`)) bens.add("company");
  const summary = [
    it.description?.trim(),
    deadlines.map((x) => `${x.label.trim()}: ${x.date.trim()}`).join("\n"),
    it.awardAmount?.trim() ? `Award amount: ${it.awardAmount.trim()}` : "",
    it.duration?.trim() ? `Duration: ${it.duration.trim()}` : "",
    it.careerStage?.trim() ? `Career stage: ${it.careerStage.trim()}` : "",
    it.programeType?.trim() ? `Programme type: ${it.programeType.trim()}` : "",
    d.eligibility ? `Eligibility:\n${d.eligibility}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    id: `ie_research_ireland:${slug}`,
    source: "ie_research_ireland",
    source_id: slug,
    source_url: `${SITE}/funding/${slug}/`,
    source_license: LICENSE,
    title: it.title.trim(),
    title_lang: "en",
    summary: summary || null,
    funder_name: "Research Ireland",
    funder_level: "national",
    country: "IE",
    regions: [],
    funding_types: /medal|prize/i.test(it.title) ? ["prize"] : ["grant"],
    beneficiary_types: [...bens],
    sectors: [],
    amount_min: amounts.length > 1 ? amounts[0]! : null,
    amount_max: amounts.length > 0 ? amounts[amounts.length - 1]! : null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: null,
    closes_at: closes,
    documents: [],
    source_updated_at: d.updated,
  };
}

async function listItems(): Promise<Item[]> {
  const json = jsonAfter(rscText(await fetchHtml(LIST, UA)), '"initialTabs":');
  if (!json) throw new Error("Research Ireland funding page has no initialTabs payload");
  const tabs = JSON.parse(json) as { id: string; items: Item[] }[];
  return tabs.flatMap((t) => t.items);
}

export const ieResearchIreland: Source = {
  id: "ie_research_ireland",
  license: LICENSE,
  start() {
    return JSON.stringify({ offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const all = await listItems();
    const items = all.slice(c.offset, c.offset + PAGE_SIZE);
    const details = await mapLimit(items, 4, async (it) => parseDetail(await fetchHtml(`${SITE}${it.href.replace(/\/?$/, "/")}`, UA)));
    const grants = items.map((it, i) => normalize(it, details[i]!));
    const next = c.offset + PAGE_SIZE < all.length ? JSON.stringify({ offset: c.offset + PAGE_SIZE } satisfies Cursor) : null;
    return { grants, raws: items.map((it, i) => ({ source_id: grants[i]!.source_id, payload: { ...it, eligibility: details[i]!.eligibility } })), next };
  },
};
