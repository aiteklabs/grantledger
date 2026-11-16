import type { Grant } from "@grantledger/schema";
import { fetchHtml, mapLimit, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Belgium, Flanders: VLAIO subsidiedatabank. A-Z index (168 measures) plus one detail page each. The site sits behind
// Akamai and only answers to browser-like requests; when Cloudflare egress is refused, run it through the local runner.
const SITE = "https://www.vlaio.be";
const INDEX = `${SITE}/nl/subsidies-financiering/subsidiedatabank/a-z`;
const LICENSE = "VLAIO subsidiedatabank public information (Agentschap Innoveren & Ondernemen)";
const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "nl-BE,nl;q=0.9,en-US;q=0.8",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

function field(html: string, cls: string): string {
  const m = html.match(new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`));
  return m ? stripHtml(m[1]!).replace(/\s+/g, " ").trim() : "";
}

function section(html: string, heading: string): string {
  const m = html.match(new RegExp(`<h2[^>]*>\\s*${heading}[\\s\\S]*?<\\/h2>([\\s\\S]*?)(?=<h2|$)`));
  return m ? stripHtml(m[1]!).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000) : "";
}

function fundingTypes(text: string): Grant["funding_types"] {
  const t = text.toLowerCase();
  const out = new Set<Grant["funding_types"][number]>();
  if (/lening|krediet/.test(t)) out.add("loan");
  if (/waarborg|garantie/.test(t)) out.add("guarantee");
  if (/kapitaal|participatie|investering in aandelen/.test(t)) out.add("equity");
  if (/fiscaal|belasting|aftrek/.test(t)) out.add("tax_credit");
  if (/cheque|portefeuille/.test(t)) out.add("voucher");
  if (/subsidie|premie|steun/.test(t) || out.size === 0) out.add("grant");
  return [...out];
}

async function detail(path: string) {
  const html = await fetchHtml(`${SITE}${path}`, HEADERS);
  return {
    title: stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
    who: field(html, "field--field-doelgroep"),
    what: field(html, "field--field-onderwerp"),
    amount: field(html, "field--field-samengevat-vrij-tekst"),
    partner: field(html, "maatregel-partner").replace(/^Een steunmaatregel van\s*/i, ""),
    changed: field(html, "field--field-date-revisionchanged"),
    teaser: field(html, "field--field-teaser").replace(/\s*Lees meer.*$/, ""),
    what_in: section(html, "Wat houdt de maatregel in"),
    who_in: section(html, "Wie komt in aanmerking"),
    conditions: section(html, "Wat zijn de financieringsvoorwaarden|Omvang steun"),
  };
}

export const beVlaio: Source = {
  id: "be_vlaio",
  runner: "local",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(cursor): Promise<Page> {
    const offset = Number(cursor);
    const html = await fetchHtml(INDEX, HEADERS);
    const paths = [...new Set([...html.matchAll(/href="(\/nl\/subsidies-financiering\/subsidiedatabank\/maatregelen\/[^"?#]+)"/g)].map((m) => m[1]!))];
    const slice = paths.slice(offset, offset + 25);
    // One request at a time with a retry: Akamai throttles bursts.
    const details = await mapLimit(slice, 1, async (p) => {
      try {
        return await detail(p);
      } catch {
        await new Promise((r) => setTimeout(r, 2500));
        return detail(p).catch(() => null);
      }
    });
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    slice.forEach((p, i) => {
      const d = details[i];
      if (!d) return;
      const slug = p.split("/").pop()!;
      const text = `${d.title} ${d.what} ${d.teaser} ${d.what_in}`;
      const who = `${d.who} ${d.who_in}`.toLowerCase();
      const bens = new Set<Grant["beneficiary_types"][number]>();
      if (/kmo|kleine|middelgrote/.test(who)) bens.add("sme");
      if (/starter|start-up|startende/.test(who)) bens.add("startup");
      if (/onderneming|bedrij|zelfstandige/.test(who)) bens.add("company");
      if (/onderzoek|universiteit|kennisinstelling/.test(who)) bens.add("research_org");
      if (/lokale bestu|gemeente|overheid/.test(who)) bens.add("public_body");
      if (/vzw|vereniging/.test(who)) bens.add("ngo");
      grants.push({
        id: `be_vlaio:${slug}`,
        source: "be_vlaio",
        source_id: slug,
        source_url: `${SITE}${p}`,
        source_license: LICENSE,
        title: d.title || slug,
        title_lang: "nl",
        summary: [d.teaser, d.who, d.what, d.amount ? `Omvang: ${d.amount}` : "", d.what_in, d.who_in, d.conditions].filter(Boolean).join("\n\n").slice(0, 20000) || null,
        funder_name: d.partner || "VLAIO",
        funder_level: "regional",
        country: "BE",
        regions: ["BE2"],
        funding_types: fundingTypes(text),
        beneficiary_types: bens.size ? [...bens] : ["company"],
        sectors: [],
        amount_min: null,
        amount_max: null,
        budget_total: null,
        currency: "EUR",
        status: "open",
        opens_at: null,
        closes_at: null,
        documents: [],
        source_updated_at: null,
      });
      raws.push({ source_id: slug, payload: { ...d, what_in: d.what_in.slice(0, 1000), who_in: d.who_in.slice(0, 1000), conditions: d.conditions.slice(0, 1000) } });
    });
    return { grants, raws, next: offset + 25 < paths.length ? String(offset + 25) : null };
  },
};
