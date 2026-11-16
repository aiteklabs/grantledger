import type { Grant } from "@grantledger/schema";
import { decodeEntities, dmyToIso, fetchJson, mapLimit, num, statusFromDates } from "../util";
import type { Page, Source } from "./types";

// Spain BDNS (Base de Datos Nacional de Subvenciones). List endpoint + one detail call per call.
// 650k+ historical records. Full crawl uses date windows per year; incremental uses `since`.
const BASE = "https://www.infosubvenciones.es/bdnstrans/api/convocatorias";
const PAGE_SIZE = 100;
const LICENSE = "BDNS legal notice, https://www.infosubvenciones.es/bdnstrans/GE/es/avisolegal";

interface ListItem { id: number; numeroConvocatoria: string; descripcion: string; fechaRecepcion: string; nivel1: string; nivel2: string; nivel3: string }
interface ListResponse { content: ListItem[]; totalElements: number; last: boolean }
interface Detail {
  id: number;
  codigoBDNS: string;
  organo: { nivel1: string; nivel2: string; nivel3: string };
  fechaRecepcion: string;
  instrumentos: { descripcion: string }[];
  tipoConvocatoria: string | null;
  presupuestoTotal: number | null;
  descripcion: string;
  descripcionLeng: string | null;
  tiposBeneficiarios: { descripcion: string }[];
  sectores: { descripcion: string; codigo: string }[];
  regiones: { descripcion: string }[];
  descripcionFinalidad: string | null;
  descripcionBasesReguladoras: string | null;
  urlBasesReguladoras: string | null;
  abierto: boolean;
  fechaInicioSolicitud: string | null;
  fechaFinSolicitud: string | null;
  documentos: { id?: number; nombreFic?: string; descripcion?: string }[];
}

interface Cursor { page: number; from: string; to: string }

const LEVEL: Record<string, Grant["funder_level"]> = { ESTATAL: "national", AUTONOMICA: "regional", LOCAL: "local", OTROS: "unknown" };

function instrumentToType(desc: string): Grant["funding_types"][number] {
  const s = desc.toUpperCase();
  if (s.includes("PRÉSTAMO") || s.includes("PRESTAMO")) return "loan";
  if (s.includes("GARANT") || s.includes("AVAL")) return "guarantee";
  if (s.includes("FISCAL") || s.includes("TRIBUTAR")) return "tax_credit";
  if (s.includes("SUBVENCI") || s.includes("ENTREGA DINERARIA")) return "grant";
  return "other";
}

function beneficiaryToType(desc: string): Grant["beneficiary_types"][number] {
  const s = desc.toUpperCase();
  if (s.includes("PYME")) return "sme";
  if (s.includes("GRAN EMPRESA") || s.includes("GRANDES EMPRESAS")) return "company";
  if (s.includes("DESARROLLAN ACTIVIDAD ECONÓMICA") && !s.includes("NO DESARROLLAN")) return "company";
  if (s.includes("NO DESARROLLAN ACTIVIDAD ECONÓMICA")) return "ngo";
  if (s.includes("PERSONAS FÍSICAS")) return "individual";
  return "other";
}

function normalize(d: Detail): Grant {
  const opens = d.fechaInicioSolicitud;
  const closes = d.fechaFinSolicitud;
  const status: Grant["status"] = d.abierto ? "open" : statusFromDates(opens, closes) === "forthcoming" ? "forthcoming" : opens || closes ? "closed" : "unknown";
  return {
    id: `es_bdns:${d.codigoBDNS}`,
    source: "es_bdns",
    source_id: d.codigoBDNS,
    source_url: `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/${d.codigoBDNS}`,
    source_license: LICENSE,
    title: decodeEntities(d.descripcion),
    title_lang: "es",
    summary: decodeEntities([d.descripcionFinalidad, d.descripcionBasesReguladoras].filter(Boolean).join("\n\n")) || null,
    funder_name: [d.organo.nivel2, d.organo.nivel3].filter(Boolean).join(" / ") || d.organo.nivel1,
    funder_level: LEVEL[d.organo.nivel1] ?? "unknown",
    country: "ES",
    regions: d.regiones.map((r) => r.descripcion.split(" - ")[0] ?? r.descripcion),
    funding_types: [...new Set(d.instrumentos.map((i) => instrumentToType(i.descripcion)))],
    beneficiary_types: [...new Set(d.tiposBeneficiarios.map((b) => beneficiaryToType(b.descripcion)))],
    sectors: d.sectores.map((s) => s.codigo),
    amount_min: null,
    amount_max: null,
    budget_total: num(d.presupuestoTotal),
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: [
      ...(httpUrl(d.urlBasesReguladoras) ? [{ title: "Bases reguladoras", url: httpUrl(d.urlBasesReguladoras) as string }] : []),
      ...d.documentos
        .filter((doc) => doc.id)
        .map((doc) => ({ title: doc.nombreFic ?? doc.descripcion ?? "document", url: `${BASE}/documentos?idDocumento=${doc.id}` })),
    ],
    source_updated_at: dmyToIso(d.fechaRecepcion.split("-").reverse().join("/")),
  };
}

// Source URLs sometimes lack a scheme ("www.boe.es/..."). Returns a valid http(s) URL or null.
function httpUrl(value: string | null): string | null {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  try {
    return new URL(candidate).href;
  } catch {
    return null;
  }
}

function dmy(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

export const esBdns: Source = {
  id: "es_bdns",
  license: LICENSE,
  start(since) {
    const from = since ? dmy(new Date(since)) : "01/01/2008";
    const cursor: Cursor = { page: 0, from, to: dmy(new Date()) };
    return JSON.stringify(cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const url = `${BASE}/busqueda?vpd=GE&pageSize=${PAGE_SIZE}&page=${c.page}&fechaDesde=${c.from}&fechaHasta=${c.to}`;
    const list = await fetchJson<ListResponse>(url);
    const details = await mapLimit(list.content, 5, (item) =>
      fetchJson<Detail>(`${BASE}?vpd=GE&numConv=${item.numeroConvocatoria}`).catch(() => null),
    );
    const found = details.filter((d): d is Detail => !!d);
    return {
      grants: found.map(normalize),
      raws: found.map((d) => ({ source_id: d.codigoBDNS, payload: d })),
      next: list.last || list.content.length === 0 ? null : JSON.stringify({ ...c, page: c.page + 1 }),
    };
  },
};
