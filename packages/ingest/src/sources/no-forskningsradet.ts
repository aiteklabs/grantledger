import type { Grant } from "@grantledger/schema";
import { num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Norway, Forskningsrådet (Research Council). JSON search API used by the calls page: current (0) and completed (1).
const SITE = "https://www.forskningsradet.no";
const API = `${SITE}/api/v1/search/proposal/no/18404`;
const LICENSE = "Forskningsrådet public call information";

interface Proposal {
  id: string;
  dateLabel?: string;
  date?: string;
  year?: string;
  metadata?: { items?: { label?: string; text?: string }[] };
  status?: { text?: string };
  tags?: { list?: string[] };
  text?: string;
  title: string;
  url: string;
}
interface Response { groups?: { title?: string; proposals?: Proposal[] }[] }

function nok(text: string | undefined): number | null {
  const m = text?.match(/([\d\s]{4,})/);
  return m ? num(m[1]!.replace(/\s/g, "")) : null;
}

function isoNo(date: string | undefined, year: string | undefined): string | null {
  const m = date?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T12:00:00.000Z`;
  const m2 = date?.match(/(\d{1,2})\.?\s*(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s*(\d{4})?/i);
  if (m2) {
    const months = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
    const mo = months.indexOf(m2[2]!.toLowerCase()) + 1;
    const y = m2[3] ?? year;
    if (y && mo) return `${y}-${String(mo).padStart(2, "0")}-${m2[1]!.padStart(2, "0")}T12:00:00.000Z`;
  }
  return null;
}

function normalize(p: Proposal, group: string, timeframe: number): Grant {
  const items = p.metadata?.items ?? [];
  const budget = nok(items.find((i) => /midler/i.test(i.label ?? ""))?.text);
  const range = items.find((i) => /Støttegrenser/i.test(i.label ?? ""))?.text ?? "";
  const nums = [...range.matchAll(/([\d\s]{4,})/g)].map((m) => num(m[1]!.replace(/\s/g, ""))).filter((n): n is number => n !== null);
  const closes = isoNo(p.date, p.year);
  const rolling = /løpende/i.test(p.date ?? "");
  const now = new Date().toISOString();
  const bens: Grant["beneficiary_types"] = /næringsliv/i.test(group) ? ["company", "sme"] : /forsk/i.test(group) ? ["research_org"] : /offentlig/i.test(group) ? ["public_body"] : [];
  return {
    id: `no_forskningsradet:${p.id}`,
    source: "no_forskningsradet",
    source_id: p.id,
    source_url: p.url.startsWith("http") ? p.url : `${SITE}${p.url}`,
    source_license: LICENSE,
    title: stripHtml(p.title),
    title_lang: "no",
    summary: [stripHtml(p.text ?? ""), `Søknadstype: ${group}`, ...items.map((i) => `${i.label}: ${i.text}`), p.tags?.list?.length ? `Tema: ${p.tags.list.join(", ")}` : ""].filter(Boolean).join("\n"),
    funder_name: "Forskningsrådet",
    funder_level: "national",
    country: "NO",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: bens,
    sectors: [],
    amount_min: nums.length > 1 ? Math.min(...nums) : null,
    amount_max: nums.length ? Math.max(...nums) : null,
    budget_total: budget,
    currency: "NOK",
    status: timeframe === 1 ? "closed" : closes && closes < now ? "closed" : rolling || closes ? "open" : "unknown",
    opens_at: null,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const noForskningsradet: Source = {
  id: "no_forskningsradet",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const timeframe = Number(cursor);
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" },
      body: JSON.stringify({ timeframe, subjects: [], targetGroups: [], deadlineTypes: [], applicationTypes: [] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Forskningsrådet timeframe ${timeframe}`);
    const data = (await res.json()) as Response;
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    for (const g of data.groups ?? []) {
      const groupTitle = (g.title ?? "").replace(/\s*\(\d+ utlysninger?\)\s*$/, "");
      for (const p of g.proposals ?? []) {
        grants.push(normalize(p, groupTitle, timeframe));
        raws.push({ source_id: p.id, payload: { group: groupTitle, proposal: p } });
      }
    }
    return { grants, raws, next: timeframe === 0 ? "1" : null };
  },
};
