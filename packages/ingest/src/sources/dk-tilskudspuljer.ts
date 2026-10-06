import type { Grant } from "@grantledger/schema";
import { parseCsv, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Denmark, Statens Tilskudspuljer: the official cross-ministry register of state grant pools, full CSV export.
const CSV = "https://www.statens-tilskudspuljer.dk/DataExport/statens-tilskudspuljer.csv";
const LICENSE = "Statens Tilskudspuljer open data export (free extraction of all data)";

function dkDate(v: string | undefined): string | null {
  const m = v?.match(/(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00.000Z` : null;
}

function normalize(row: Record<string, string>, index: number): Grant {
  const active = row.IsActive === "True";
  const closes = dkDate(row.NextDeadline);
  const now = new Date().toISOString();
  const link = row.PoolViewLink || row.AuthorityPoolApplicationLink || "";
  const url = /^https?:\/\//.test(link) ? link : "https://www.statens-tilskudspuljer.dk/Sider/Puljer.aspx";
  // Several pools share one authority link and a few share a title, so the id is built from authority, the pool's
  // creation timestamp (stable across releases) and the title. The timestamp comes before the title so that long
  // titles truncated to the id length still yield distinct ids.
  const [createdDate = "", createdTime = ""] = (row.Created ?? "").split(" ");
  const created = createdDate.split("-").reverse().join("") + createdTime.replace(/:/g, "");
  const idBase = `${row.AuthorityName ?? ""}-${created}-${row.Title ?? index}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 140) || `row-${index}`;
  return {
    id: `dk_tilskudspuljer:${idBase}`,
    source: "dk_tilskudspuljer",
    source_id: idBase,
    source_url: url,
    source_license: LICENSE,
    title: stripHtml(row.Title ?? "").trim() || idBase,
    title_lang: "da",
    summary: [row.Keywords ? `Nøgleord: ${row.Keywords}` : "", row.IsEUFunded === "True" ? "EU-finansieret" : "", row.AllDeadlines ? `Frister: ${row.AllDeadlines}` : ""].filter(Boolean).join("\n") || null,
    funder_name: row.AuthorityName || null,
    funder_level: "national",
    country: "DK",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: [],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "DKK",
    status: !active ? "closed" : closes && closes < now ? "closed" : "open",
    opens_at: null,
    closes_at: closes,
    documents: [],
    source_updated_at: dkDate(row.Modified),
  };
}

export const dkTilskudspuljer: Source = {
  id: "dk_tilskudspuljer",
  license: LICENSE,
  start() {
    return "1";
  },
  async fetchPage(): Promise<Page> {
    const res = await fetch(CSV, { headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for Danish CSV export`);
    const text = (await res.text()).replace(/^﻿/, "");
    const [header = [], ...rows] = parseCsv(text, ";");
    const records = rows.filter((r) => r.length > 3).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
    const grants = records.map(normalize);
    return { grants, raws: records.map((r, i) => ({ source_id: grants[i]!.source_id, payload: r })), next: null };
  },
};
