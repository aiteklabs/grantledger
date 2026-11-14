import type { Grant } from "@grantledger/schema";
import { fetchJson, mapLimit, num, stripHtml } from "../util";
import type { Page, Source } from "./types";

// Slovakia, ITMS21+ (the central information system for EU funds 2021-2027): calls for applications ("výzvy") from
// its public open data API. GET /public/v1/vyzva?limit=&offset= lists every announced call (about 180 rows, 14 KB
// each), sorted by code; /public/v1/vyzva/id/{id} adds the aim of the call, the eligibility conditions, the
// assessment rounds and the documents (200 KB, so only open calls get it); /public/v1/planovanavyzva lists the
// planned calls that are not announced yet. Only demand-driven calls are kept (zameranieProjektu DOPYT_21): national
// projects (NP_21, direct award), integrated territorial investments (IUI_21, projects agreed in advance), financial
// instruments (FN_21) and technical assistance (TA_21) are not open competitions. The `typ` field is the kind of
// call (OTVORENA: no fixed end date, applications assessed in rounds; UZAVRETA: fixed end date), not its status;
// the status comes from `uzavreta`, `zrusena`, `pozastavenePredkladanieZonfp` and the dates. Dates are epoch
// milliseconds at Slovak midnight. An F5 WAF sits in front of the API (an unknown path returns 403).
const API = "https://api.itms21.sk/public/v1";
const PORTAL = "https://portal.itms21.sk";
const LICENSE = "ITMS21+ open data API (Ministerstvo investícií, regionálneho rozvoja a informatizácie SR)";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "application/json" };
const LIMIT = 20;
// Slovakia has eight NUTS 3 regions; a call that lists all of them is national.
const ALL_REGIONS = 8;

interface Cursor { list: "vyzva" | "planovanavyzva"; offset: number }
interface Coded { kodZdroj?: string; nazovSk?: string }
interface Named { kod?: string; nazovSk?: string; skratka?: string; fond?: Coded }
interface Organ { nazov?: string; subjekt?: { nazov?: string } }

interface Row {
  id: number;
  kod: string;
  nazovSk: string;
  zameranieProjektu?: string;
  typ?: string;
  datumVyhlasenia?: number;
  datumUkoncenia?: number;
  datumVyhlasenia1Kolo?: number;
  datumUzavretia1Kolo?: number;
  uzavreta?: boolean;
  vyhlasena?: boolean;
  zrusena?: boolean;
  pozastavenePredkladanieZonfp?: boolean;
  sumaEu?: number;
  sumaSr?: number;
  updatedAt?: number;
  program?: Named;
  programSkratka?: string;
  specifickyCielProgramu?: Named[];
  miestoRealizacie?: Coded[];
  ziadatel?: Coded[];
  vyhlasovatel?: Organ;
  poskytovatel?: Organ;
}

interface Detail {
  updatedAt?: number;
  cielVyzvy?: string;
  cielovaSkupina?: { nazovSk?: string }[];
  podmienkaPoskytnutiaPrispevku?: { poradoveCislo?: number; nazovSk?: string; popisSk?: string }[];
  posudzovaneObdobie?: { poradoveCislo?: number; datumUzavierky?: number }[];
  mieraSpolufinancovania?: string;
  sposobPodaniaZoNFP?: string;
  inaSkutocnostUzatvorenieVyzvy?: string;
  typPartnerstva?: string;
  kontaktNazov?: string;
  kontaktEmail?: string;
  dokument?: { nazov?: string; uuid?: string }[];
}

// Epoch milliseconds at Slovak midnight (22:00 or 23:00 UTC of the day before) to the local calendar date.
const localDate = (ms: number | undefined): string | null => (ms ? new Date(ms + 2 * 3_600_000).toISOString().slice(0, 10) : null);
const skDate = (date: string | null): string => (date ? `${Number(date.slice(8, 10))}.${Number(date.slice(5, 7))}.${date.slice(0, 4)}` : "");
const plain = (html: string | undefined, max = 20000): string => (html ? stripHtml(html).replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim().slice(0, max) : "");
const uniq = (values: (string | undefined)[]): string[] => [...new Set(values.filter((v): v is string => !!v))];

// Slovak register codes of legal forms (kodZdroj): 1xx and 2xx businesses and cooperatives, 3xx and 8xx public
// sector, 117 to 120 and 7xx foundations, non-profits, associations and churches.
function beneficiaryTypes(forms: Coded[], text: string): Grant["beneficiary_types"] {
  const out = new Set<Grant["beneficiary_types"][number]>();
  for (const f of forms) {
    const code = Number(f.kodZdroj);
    if (code === 333) out.add("research_org");
    else if ((code >= 117 && code <= 120) || (code >= 700 && code < 800)) out.add("ngo");
    else if ((code >= 100 && code < 300) || code === 301) out.add("company");
    else if ((code >= 300 && code < 400) || (code >= 800 && code < 900)) out.add("public_body");
  }
  const t = text.toLowerCase();
  if (/vysok(á|é|ej|ých) šk[oô]l|výskumn(á|é|ej|ých) inštitúci|akadémi/.test(t)) out.add("research_org");
  if (/\bmsp\b|mal(ý|é|ých) a stredn(ý|é|ých) podnik|mikropodnik/.test(t)) out.add("sme");
  return [...out];
}

function normalize(r: Row, d: Detail | null, planned: boolean): Grant {
  const sourceId = planned ? `plan-${r.id}` : String(r.id);
  const opened = localDate(planned ? r.datumVyhlasenia1Kolo : r.datumVyhlasenia);
  const ended = localDate(planned ? r.datumUzavretia1Kolo : r.datumUkoncenia);
  const rounds = (d?.posudzovaneObdobie ?? []).map((p) => localDate(p.datumUzavierky)).filter((v): v is string => !!v).sort();
  const today = new Date().toISOString().slice(0, 10);
  // A call without an end date stays open after its last listed round (rounds are added as it goes), so a round only
  // counts as the deadline while it is still ahead.
  const lastRound = rounds.at(-1);
  const closeDate = ended ?? (lastRound && lastRound >= today ? lastRound : null);
  const opens = opened ? `${opened}T00:00:00.000Z` : null;
  const closes = closeDate ? `${closeDate}T23:59:59.000Z` : null;
  const status: Grant["status"] = planned
    ? "forthcoming"
    : r.zrusena || r.uzavreta || r.pozastavenePredkladanieZonfp || (closeDate !== null && closeDate < today)
      ? "closed"
      : opened && opened > today
        ? "forthcoming"
        : "open";

  const forms = r.ziadatel ?? [];
  const places = r.miestoRealizacie ?? [];
  const funds = uniq((r.specifickyCielProgramu ?? []).map((s) => s.fond?.kodZdroj));
  const eu = num(r.sumaEu);
  const sr = num(r.sumaSr);
  const conditions = (d?.podmienkaPoskytnutiaPrispevku ?? [])
    .filter((p) => /oprávnenos|časov|pomoc|partner/i.test(p.nazovSk ?? ""))
    .sort((a, b) => (a.poradoveCislo ?? 0) - (b.poradoveCislo ?? 0))
    .map((p) => `${p.nazovSk}: ${plain(p.popisSk, 3000)}`);
  const eligibility = conditions.find((c) => /^Podmienka oprávnenosti žiadateľa/i.test(c)) ?? "";
  const summary = [
    `Kód výzvy: ${r.kod}`,
    planned && "Stav: plánovaná výzva (harmonogram výziev)",
    r.pozastavenePredkladanieZonfp && "Stav: predkladanie žiadostí je pozastavené",
    (r.program?.nazovSk || r.programSkratka) && `Program: ${r.program?.nazovSk ?? r.programSkratka}`,
    r.specifickyCielProgramu?.length && `Špecifický cieľ: ${uniq(r.specifickyCielProgramu.map((s) => s.nazovSk)).join("; ")}`,
    funds.length > 0 && `Fond: ${funds.join(", ")}`,
    r.vyhlasovatel?.nazov && `Vyhlasovateľ: ${r.vyhlasovatel.nazov}`,
    r.poskytovatel?.nazov && `Poskytovateľ: ${r.poskytovatel.nazov}`,
    r.typ && `Typ výzvy: ${r.typ === "OTVORENA" ? "otvorená (bez pevného dátumu uzavretia, hodnotiace kolá)" : r.typ === "UZAVRETA" ? "uzavretá (pevný dátum uzavretia)" : r.typ}`,
    opened && `${planned ? "Plánovaný dátum vyhlásenia" : "Dátum vyhlásenia"}: ${skDate(opened)}`,
    ended && `${planned ? "Plánovaný dátum uzavretia" : "Dátum uzavretia"}: ${skDate(ended)}`,
    rounds.length > 0 && `Uzávierky hodnotiacich kôl: ${rounds.map(skDate).join(", ")}`,
    eu !== null && `Alokácia - zdroje EÚ: ${eu} EUR`,
    sr !== null && `Alokácia - štátny rozpočet: ${sr} EUR`,
    forms.length > 0 && `Oprávnení žiadatelia (právne formy): ${uniq(forms.map((f) => f.nazovSk)).join("; ")}`,
    places.length > 0 && `Miesto realizácie: ${uniq(places.map((p) => p.nazovSk)).join(", ")}`,
    d?.cielovaSkupina?.length && `Cieľová skupina: ${uniq(d.cielovaSkupina.map((c) => c.nazovSk)).join("; ")}`,
    plain(d?.cielVyzvy) && `Cieľ výzvy: ${plain(d?.cielVyzvy, 5000)}`,
    ...conditions,
    plain(d?.mieraSpolufinancovania) && `Miera spolufinancovania: ${plain(d?.mieraSpolufinancovania, 2500)}`,
    plain(d?.sposobPodaniaZoNFP) && `Spôsob podania žiadosti: ${plain(d?.sposobPodaniaZoNFP, 1500)}`,
    plain(d?.inaSkutocnostUzatvorenieVyzvy) && `Uzavretie výzvy: ${plain(d?.inaSkutocnostUzatvorenieVyzvy, 1500)}`,
    (d?.kontaktNazov || d?.kontaktEmail) && `Kontakt: ${[d?.kontaktNazov, d?.kontaktEmail].filter(Boolean).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  const updated = d?.updatedAt ?? r.updatedAt;
  return {
    id: `sk_itms21:${sourceId}`,
    source: "sk_itms21",
    source_id: sourceId,
    source_url: planned ? `${PORTAL}/planovana-vyzva/?id=${r.id}` : `${PORTAL}/vyhlasena-vyzva/?id=${r.id}`,
    source_license: LICENSE,
    title: r.nazovSk.replace(/\s+/g, " ").trim(),
    title_lang: "sk",
    summary,
    funder_name: r.vyhlasovatel?.subjekt?.nazov ?? r.vyhlasovatel?.nazov ?? r.poskytovatel?.subjekt?.nazov ?? null,
    funder_level: "national",
    country: "SK",
    regions: places.length >= ALL_REGIONS ? [] : uniq(places.map((p) => p.kodZdroj)).sort(),
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(forms, `${r.nazovSk} ${eligibility}`),
    consortium: d?.typPartnerstva === "ZIADNE" ? "single" : null,
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: eu === null && sr === null ? null : Math.round(((eu ?? 0) + (sr ?? 0)) * 100) / 100,
    currency: "EUR",
    status,
    opens_at: opens,
    closes_at: closes,
    documents: (d?.dokument ?? []).filter((x) => x.nazov && x.uuid).map((x) => ({ title: x.nazov as string, url: `${API}/dokument/${x.uuid}` })),
    source_updated_at: updated ? new Date(updated).toISOString() : null,
  };
}

const isOpen = (r: Row): boolean => !r.zrusena && !r.uzavreta && !r.pozastavenePredkladanieZonfp && !(r.datumUkoncenia && r.datumUkoncenia + 26 * 3_600_000 < Date.now());

export const skItms21: Source = {
  id: "sk_itms21",
  license: LICENSE,
  start() {
    return JSON.stringify({ list: "vyzva", offset: 0 } satisfies Cursor);
  },
  async fetchPage(cursor): Promise<Page> {
    const c = JSON.parse(cursor) as Cursor;
    const planned = c.list === "planovanavyzva";
    const { results, size } = await fetchJson<{ size: number; results: Row[] }>(`${API}/${c.list}?limit=${LIMIT}&offset=${c.offset}`, { headers: HEADERS });
    if (!planned && c.offset === 0 && !results?.length) throw new Error("ITMS21+ returned no calls (API change or WAF block?)");
    // Planned calls: only the ones still waiting to be announced.
    const rows = (results ?? []).filter((r) => r.zameranieProjektu === "DOPYT_21" && r.nazovSk && (!planned || (!r.vyhlasena && !r.zrusena)));
    const details = await mapLimit(rows, 2, (r) => (planned || !isOpen(r) ? Promise.resolve(null) : fetchJson<Detail>(`${API}/vyzva/id/${r.id}`, { headers: HEADERS })));
    const grants = rows.map((r, i) => normalize(r, details[i] ?? null, planned));
    const more = (results?.length ?? 0) > 0 && c.offset + LIMIT < size;
    const next: Cursor | null = more ? { list: c.list, offset: c.offset + LIMIT } : planned ? null : { list: "planovanavyzva", offset: 0 };
    return {
      grants,
      raws: rows.map((r, i) => ({ source_id: grants[i]!.source_id, payload: r })),
      next: next ? JSON.stringify(next) : null,
    };
  },
};
