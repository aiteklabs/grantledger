import type { Grant } from "@grantledger/schema";
import { fetchHtml, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// UK, Brighton & Hove City Council: the council has one recurring grant programme for community and voluntary
// organisations, the Community Catalyst Fund (2-year grants, successor of the Communities Fund). It has no call list,
// feed or dates: one prose page says who can apply, how much, and when the next round is expected. The other council
// "grants" pages are rate relief, crisis payments and housing adaptations, not calls.
const SITE = "https://www.brighton-hove.gov.uk";
const FUND_URL = `${SITE}/people-and-communities/community-support-and-grants/community-catalyst-fund`;
const LICENSE = "Brighton & Hove City Council public grant information";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };

function normalize(html: string): Grant {
  const main = html.slice(Math.max(html.indexOf("<main"), 0));
  // The page ends with the table of organisations funded in the last round, which is not part of the call.
  const awards = main.search(/<h3[^>]*>\s*View a list of the projects funded/);
  const text = stripHtml(main.slice(0, awards === -1 ? main.indexOf("</main>") : awards)).replace(/\u00a0/g, " ").replace(/\n\s*\n/g, "\n\n");
  const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/\s+/g, " ").trim();
  if (!title || text.length < 200) throw new Error("Brighton & Hove Community Catalyst Fund page returned no content (layout change?)");
  // "apply individually or in partnership for up to £10,000 per year" (the page also states an income ceiling).
  const upTo = text.match(/up to £([\d,]+) per year/i)?.[1];
  return {
    id: "uk_brighton_hove:community-catalyst-fund",
    source: "uk_brighton_hove",
    source_id: "community-catalyst-fund",
    source_url: FUND_URL,
    source_license: LICENSE,
    title,
    title_lang: "en",
    summary: text,
    funder_name: "Brighton & Hove City Council",
    funder_level: "local",
    country: "GB",
    regions: ["UKJ21"],
    funding_types: ["grant"],
    beneficiary_types: ["ngo"],
    sectors: [],
    amount_min: null,
    amount_max: upTo ? num(upTo.replace(/,/g, "")) : null,
    budget_total: null,
    currency: "GBP",
    // The page gives no dates. "The Community Catalyst Fund 2027 to 2029 is expected to be open to application in the
    // autumn of 2026" marks the next round as forthcoming; any other wording is left as unknown.
    status: /expected to be open/i.test(text) ? "forthcoming" : "unknown",
    opens_at: null,
    closes_at: null,
    documents: [],
    source_updated_at: null,
  };
}

export const ukBrightonHove: Source = {
  id: "uk_brighton_hove",
  license: LICENSE,
  start() {
    return "0";
  },
  async fetchPage(): Promise<Page> {
    const grant = normalize(await fetchHtml(FUND_URL, UA));
    return { grants: [grant], raws: [{ source_id: grant.source_id, payload: { summary: grant.summary } }], next: null };
  },
};
