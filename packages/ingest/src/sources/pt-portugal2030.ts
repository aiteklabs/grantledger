import type { Grant } from "@grantledger/schema";
import { fetchJson, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Portugal 2030 (cohesion funds 2021-2027): JSON API behind portugal2030.pt/avisos, 5 calls per page, by state.
const API = "https://portugal2030.pt/wp-json/avisos/query";
const LICENSE = "Portugal 2030 public call notices (Agência para o Desenvolvimento e Coesão)";
// 7 open, 6 scheduled, 8 closed. Closed calls are capped to keep the crawl bounded.
const STATES: { id: number; status: Grant["status"]; maxPages: number }[] = [
  { id: 7, status: "open", maxPages: 400 },
  { id: 6, status: "forthcoming", maxPages: 100 },
  { id: 8, status: "closed", maxPages: 300 },
];

interface Aviso {
  aviso: { avisoGlobalId: number; codigoAviso: string; designacaoPT?: string; designacaoEN?: string; classificacaoAvisoDesignacao?: string; dataUltimaAlteracao?: string };
  estrutura?: { programaOperacionalDesignacao?: string; prioridadeDesignacao?: string; objetivoEspecificoDesignacao?: string; tipologiaOperacaoDesignacao?: string; fundoDesignacao?: string; dotacao?: number | null }[];
  calendario?: { dataPublicacao?: string; dataInicio?: string; dataFim?: string; dataFimAtual?: string };
  documentos?: { documentoDesignacao?: string; path?: string; container?: string }[];
}
interface Cursor { state: number; page: number }

const NUTS: [string, string][] = [["norte", "PT11"], ["centro", "PT16"], ["lisboa", "PT17"], ["alentejo", "PT18"], ["algarve", "PT15"], ["açores", "PT20"], ["madeira", "PT30"]];

function iso(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v.endsWith("Z") ? v : `${v}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalize(a: Aviso, status: Grant["status"]): Grant {
  const e = a.estrutura ?? [];
  const programme = e[0]?.programaOperacionalDesignacao ?? "";
  const regions = NUTS.filter(([k]) => programme.toLowerCase().includes(k)).map(([, c]) => c);
  const budget = e.reduce((n, x) => n + (x.dotacao ?? 0), 0) || null;
  const closes = iso(a.calendario?.dataFimAtual ?? a.calendario?.dataFim);
  const opens = iso(a.calendario?.dataInicio);
  const now = new Date().toISOString();
  return {
    id: `pt_portugal2030:${a.aviso.codigoAviso}`,
    source: "pt_portugal2030",
    source_id: a.aviso.codigoAviso,
    source_url: `https://portugal2030.pt/avisos/?pesquisaLivre=${encodeURIComponent(a.aviso.codigoAviso)}`,
    source_license: LICENSE,
    title: stripHtml(a.aviso.designacaoPT || a.aviso.designacaoEN || a.aviso.codigoAviso),
    title_lang: "pt",
    summary: [
      a.aviso.designacaoEN ? `EN: ${a.aviso.designacaoEN}` : "",
      programme ? `Programa: ${programme}` : "",
      ...e.slice(0, 3).map((x) => [x.prioridadeDesignacao, x.objetivoEspecificoDesignacao, x.tipologiaOperacaoDesignacao, x.fundoDesignacao].filter(Boolean).join(" · ")),
      a.aviso.classificacaoAvisoDesignacao ? `Classificação: ${a.aviso.classificacaoAvisoDesignacao}` : "",
    ].filter(Boolean).join("\n"),
    funder_name: programme || "Portugal 2030",
    funder_level: regions.length ? "regional" : "national",
    country: "PT",
    regions,
    funding_types: ["grant"],
    beneficiary_types: [],
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: budget,
    currency: "EUR",
    status: closes && closes < now ? "closed" : opens && opens > now ? "forthcoming" : status,
    opens_at: opens,
    closes_at: closes,
    documents: (a.documentos ?? []).filter((d) => d.path).slice(0, 5).map((d) => ({ title: d.documentoDesignacao ?? "document", url: `https://portugal2030.pt/wp-json/avisos/download?container=${encodeURIComponent(d.container ?? "")}&path=${encodeURIComponent(d.path ?? "")}` })),
    source_updated_at: iso(a.aviso.dataUltimaAlteracao),
  };
}

export const ptPortugal2030: Source = {
  id: "pt_portugal2030",
  license: LICENSE,
  start() {
    return JSON.stringify({ state: 7, page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const st = STATES.find((s) => s.id === c.state)!;
    const body = new URLSearchParams({ page: String(c.page), estadoAvisoId: String(c.state), wpml_language: "pt-pt" });
    const data = await fetchJson<{ avisos?: Aviso[] }>(API, { method: "POST", headers: { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", "content-type": "application/x-www-form-urlencoded" }, body });
    const avisos = data.avisos ?? [];
    const nextState = STATES[STATES.findIndex((s) => s.id === c.state) + 1];
    const more = avisos.length > 0 && c.page < st.maxPages;
    const next: Cursor | null = more ? { state: c.state, page: c.page + 1 } : nextState ? { state: nextState.id, page: 1 } : null;
    return { grants: avisos.map((a) => normalize(a, st.status)), raws: avisos.map((a) => ({ source_id: a.aviso.codigoAviso, payload: a })), next: next ? JSON.stringify(next) : null };
  },
};
