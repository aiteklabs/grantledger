import type { Grant } from "@grantledger/schema";
import { fetchJson, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Sweden, Vinnova open data API (Public Domain Mark). One request returns every application round modified since a date.
const API = "https://data.vinnova.se/api/ansokningsomgangar";
const LICENSE = "Public Domain Mark (Vinnova open data)";
// The API returns everything modified since the date in one response; 2015 times out server-side, 2020 takes about a minute.
const SINCE = "2018-01-01";

interface Round {
  Diarienummer: string;
  DiarienummerUtlysning?: string;
  Titel?: string;
  TitelEngelska?: string;
  Beskrivning?: string;
  BeskrivningEngelska?: string;
  Oppningsdatum?: string | null;
  Stangningsdatum?: string | null;
  Publik?: number;
  DokumentLista?: { Titel?: string; fileURL?: string }[];
  LankLista?: { Lank?: string; Beskrivning?: string; URL?: string }[];
  WebTextLista?: { Text?: string; Lang?: string }[];
}

function iso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v.endsWith("Z") ? v : `${v}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalize(r: Round): Grant {
  const opens = iso(r.Oppningsdatum);
  const closes = iso(r.Stangningsdatum);
  const now = new Date().toISOString();
  const webText = (r.WebTextLista ?? []).map((t) => stripHtml(t.Text ?? "")).filter(Boolean).join("\n\n");
  const link = (r.LankLista ?? []).map((l) => l.URL ?? l.Lank ?? "").find((u) => /^https?:\/\//.test(u));
  return {
    id: `se_vinnova:${r.Diarienummer}`,
    source: "se_vinnova",
    source_id: r.Diarienummer,
    source_url: link ?? `https://www.vinnova.se/sok/?q=${encodeURIComponent(r.Diarienummer)}`,
    source_license: LICENSE,
    title: stripHtml(r.TitelEngelska || r.Titel || "").trim() || r.Diarienummer,
    title_lang: r.TitelEngelska ? "en" : "sv",
    summary: [stripHtml(r.BeskrivningEngelska || r.Beskrivning || ""), webText].filter(Boolean).join("\n\n").slice(0, 20000) || null,
    funder_name: "Vinnova",
    funder_level: "national",
    country: "SE",
    regions: [],
    funding_types: ["grant"],
    beneficiary_types: [],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "SEK",
    status: closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : opens ? "open" : "unknown",
    opens_at: opens,
    closes_at: closes,
    documents: (r.DokumentLista ?? []).filter((d) => d.fileURL).map((d) => ({ title: d.Titel ?? "document", url: d.fileURL as string })).slice(0, 10),
    source_updated_at: null,
  };
}

export const seVinnova: Source = {
  id: "se_vinnova",
  runner: "local",
  license: LICENSE,
  start() {
    return SINCE;
  },
  async fetchPage(cursor): Promise<Page> {
    const rounds = await fetchJson<Round[]>(`${API}/${cursor}`);
    const publicRounds = rounds.filter((r) => r.Publik === 1 && r.Diarienummer);
    return { grants: publicRounds.map(normalize), raws: publicRounds.map((r) => ({ source_id: r.Diarienummer, payload: r })), next: null };
  },
};
