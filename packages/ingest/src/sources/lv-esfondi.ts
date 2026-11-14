import type { Grant } from "@grantledger/schema";
import { fetchJson, num, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// Latvia, esfondi.lv (Ministry of Finance, the managing authority of EU funds): the "Pieejamais atbalsts" (available
// support) register of project selections for the 2021-2027 cohesion programme, the Recovery Fund and related
// instruments. GET /api/available-support/search?available_support_status=<status>&limit=&page=&site=lv returns
// {data, links, meta} with everything the public page shows (dates, funding, receivers, text blocks, documents), so
// no detail request is needed. Only the statuses "izsludinats" (announced) and "planots" (planned) are read; the
// other three (vertesana, istenosana, nosledzies: evaluation, implementation, ended) are finished selections. The
// publisher's status is often stale (announced or planned rows whose window ended long ago), so the end date decides.
// Both selection types are kept: "Atklāta" (open competition) and "Ierobežota" (restricted to a named group of
// applicants, usually public bodies); the type is printed in the summary.
const SITE = "https://www.esfondi.lv";
const LICENSE = "esfondi.lv public information on EU fund project selections (Finanšu ministrija)";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "application/json" };
const STATUSES = ["izsludinats", "planots"] as const;
const LIMIT = 50;

interface Cursor { status: (typeof STATUSES)[number]; page: number }
interface Term { title?: string; slug?: string }
interface Range { start?: string | null; end?: string | null }
interface Block { type?: string; title?: string | null; content?: string | null }
interface DocItem { type?: string; link?: string | null; link_title?: string | null; document_title?: string | null; document?: { permalink?: string | null } | null }

interface Row {
  id: string;
  title: string;
  url?: string;
  amount_of_aid?: unknown;
  own_financing?: unknown;
  total_amount_of_funding?: unknown;
  application_deadline?: Range | null;
  application_evaluation_deadline?: Range | null;
  available_support_round?: string | null;
  available_support_selection_type?: Term | null;
  available_support_status?: Term | null;
  document_block?: { title?: string | null; documents_in_group?: DocItem[] | null }[] | null;
  industries?: Term[] | null;
  information_blocks?: Block[] | null;
  last_modified?: string | null;
  support_reciever?: Term[] | null;
  support_type?: Term | null;
}

const BLOCK_LABELS: Record<string, string> = { target: "Mērķis", who_can_apply: "Kas var pieteikties", financing: "Finansējums", notice: "Paziņojums", information: "Informācija" };

const plain = (html: string | null | undefined): string => (html ? stripHtml(html.replace(/\s+/g, " ")).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim() : "");
const day = (iso: string | null | undefined): string | null => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);
const lvDate = (d: string | null): string => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}.` : "");
const names = (terms: Term[] | null | undefined): string => (terms ?? []).map((t) => t.title).filter(Boolean).join(", ");

function beneficiaryTypes(receivers: string, who: string): Grant["beneficiary_types"] {
  const t = `${receivers} ${who}`.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/kapitālsabiedrīb|sabiedrība ar ierobežotu|akciju sabiedrīb|komersant|juridiska persona|uzņēmum/.test(t)) out.add("company");
  if (/mazie|vidējie|mvk|sīkie/.test(t)) out.add("sme");
  if (/pārvaldes iestāde|pašvaldīb|valsts iestāde|publiska persona|plānošanas reģion/.test(t)) out.add("public_body");
  if (/biedrīb|nodibinājum/.test(t)) out.add("ngo");
  if (/zinātnisk|augstskol|pētniecīb/.test(t)) out.add("research_org");
  if (/fiziska persona|fiziskas personas/.test(t)) out.add("individual");
  if (/izglītības iestāde/.test(t)) out.add("other");
  return [...out];
}

function fundingTypes(t: string): Grant["funding_types"] {
  const out: Grant["funding_types"] = ["grant"];
  if (/aizdevum/i.test(t)) out.push("loan");
  if (/garantij/i.test(t)) out.push("guarantee");
  return out;
}

function normalize(r: Row): Grant {
  const from = day(r.application_deadline?.start);
  const to = day(r.application_deadline?.end);
  const today = new Date().toISOString().slice(0, 10);
  const slug = r.available_support_status?.slug;
  const status: Grant["status"] =
    to !== null && to < today
      ? "closed"
      : slug === "planots" && (from === null || from > today)
        ? "forthcoming"
        : slug === "izsludinats" || slug === "planots"
          ? from !== null && from > today ? "forthcoming" : "open"
          : "closed";
  const blocks = (r.information_blocks ?? []).map((b) => ({ label: BLOCK_LABELS[b.type ?? ""] ?? "Informācija", title: plain(b.title), body: plain(b.content) })).filter((b) => b.title || b.body);
  const who = blocks.filter((b) => b.label === BLOCK_LABELS.who_can_apply).map((b) => b.body).join(" ");
  const receivers = names(r.support_reciever);
  const budget = num(r.total_amount_of_funding);
  const own = num(r.own_financing);
  const evaluation = r.application_evaluation_deadline;
  const documents: Grant["documents"] = [];
  for (const group of r.document_block ?? []) {
    for (const d of group.documents_in_group ?? []) {
      const url = d.type === "link" ? d.link : d.document?.permalink;
      const title = plain(d.type === "link" ? d.link_title : d.document_title) || plain(group.title);
      if (url && /^https:\/\//.test(url) && title && !documents.some((x) => x.url === url)) documents.push({ title, url: url.replace(/ /g, "%20") });
    }
  }
  const summary = [
    r.available_support_status?.title && `Statuss: ${r.available_support_status.title}`,
    r.available_support_selection_type?.title && `Atlases veids: ${r.available_support_selection_type.title}`,
    r.available_support_round && `Kārta: ${r.available_support_round}`,
    r.support_type?.title && `Fonds: ${r.support_type.title}`,
    names(r.industries) && `Nozare: ${names(r.industries)}`,
    receivers && `Atbalsta saņēmēji: ${receivers}`,
    budget !== null && `Kopējais finansējums: ${budget} EUR`,
    r.amount_of_aid !== null && r.amount_of_aid !== undefined && r.amount_of_aid !== "" && `Atbalsta apjoms: ${plain(String(r.amount_of_aid))}`,
    own !== null && `Pašu finansējums: ${own} %`,
    (from || to) && `Projektu iesniegšana: ${lvDate(from)} - ${lvDate(to)}`,
    (day(evaluation?.start) || day(evaluation?.end)) && `Projektu vērtēšana: ${lvDate(day(evaluation?.start))} - ${lvDate(day(evaluation?.end))}`,
    ...blocks.map((b) => `${b.title || b.label}: ${b.body}`),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `lv_esfondi:${r.id}`,
    source: "lv_esfondi",
    source_id: r.id,
    source_url: `${SITE}${r.url ?? "/pieejamais-atbalsts"}`,
    source_license: LICENSE,
    title: r.title.replace(/\s+/g, " ").trim(),
    title_lang: "lv",
    summary,
    funder_name: "Finanšu ministrija",
    funder_level: "national",
    country: "LV",
    regions: [],
    funding_types: fundingTypes(`${r.title} ${blocks.map((b) => b.body).join(" ")}`),
    beneficiary_types: beneficiaryTypes(receivers, who),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: budget !== null && budget > 0 ? budget : null,
    currency: "EUR",
    status,
    opens_at: from ? `${from}T00:00:00.000Z` : null,
    closes_at: to ? `${to}T23:59:59.000Z` : null,
    documents,
    source_updated_at: toIso(r.last_modified),
  };
}

export const lvEsfondi: Source = {
  id: "lv_esfondi",
  license: LICENSE,
  start() {
    return JSON.stringify({ status: STATUSES[0], page: 1 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const { data, meta } = await fetchJson<{ data: Row[]; meta?: { last_page?: number } }>(`${SITE}/api/available-support/search?available_support_status=${c.status}&limit=${LIMIT}&page=${c.page}&site=lv`, { headers: HEADERS });
    if (c.status === "izsludinats" && c.page === 1 && !data?.length) throw new Error("esfondi.lv returned no announced selections (API change?)");
    // The status filter is checked again here: an API that ignored it would hand back all 378 rows.
    const rows = (data ?? []).filter((r) => r.id && r.title && r.available_support_status?.slug === c.status);
    const grants = rows.map(normalize);
    const nextStatus = STATUSES[STATUSES.indexOf(c.status) + 1];
    const next: Cursor | null = (data?.length ?? 0) > 0 && c.page < (meta?.last_page ?? 1) ? { status: c.status, page: c.page + 1 } : nextStatus ? { status: nextStatus, page: 1 } : null;
    return {
      grants,
      raws: rows.map((r) => ({ source_id: r.id, payload: r })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
