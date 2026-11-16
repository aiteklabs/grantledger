import type { Grant } from "@grantledger/schema";
import { fetchJson, stripHtml, toIso } from "../util";
import type { Page, Source } from "./types";

// France, Région Île-de-France: the region's guide of grants and calls for projects ("aides et appels à projets"),
// published as open data under Licence Ouverte v2.0. One Opendatasoft dataset, no key, about 360 rows; the records
// API returns at most 100 rows per request, so a full crawl is four requests, ordered by the technical id.
// A row without a closing date is a permanent scheme the region shows as available (open, no deadline). A closed
// row with a "date début future campagne" in the future is the next round of a recurring call (forthcoming).
// Amounts are only given in free text ("Quelle est la nature de l'aide ?"), so the amount fields stay empty.
const API = "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/aides-appels-a-projets/records";
const LICENSE = "Licence Ouverte v2.0 (Etalab), data.iledefrance.fr";
const UA = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)" };
const PAGE_SIZE = 100;

interface Row {
  reference_administrative: number | null;
  id_aide: string;
  nom_de_l_aide_de_la_demarche: string | null;
  titre_alternatif_de_l_aide: string | null;
  porteur_aide: string | null;
  theme: string[] | null;
  mots_cles: string[] | null;
  qui_peut_en_beneficier: string[] | null;
  publicsbeneficiaireprecision: string | null;
  entete: string | null;
  objectif: string | null;
  modalite: string | null;
  demarches: string | null;
  notes: string | null;
  contact: string | null;
  deliberation_cadre: string | null;
  date: string | null;
  date_ouverture: string | null;
  date_cloture: string | null;
  datedebutfuturcampagne: string | null;
  url_descriptif: string | null;
  demarche_en_ligne: string | null;
  engagements_du_beneficiaire: string[] | null;
}

const PARIS = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
// The dataset stores Paris wall-clock times in UTC; the summary shows them as the region wrote them.
const paris = (iso: string | null) => (iso ? PARIS.format(new Date(iso)) : "");
const plain = (html: string | null | undefined) => (html ? stripHtml(html).replace(/\u00a0/g, " ").replace(/\n\s*\n+/g, "\n").trim() : "");

function beneficiaryTypes(publics: string[]): Grant["beneficiary_types"] {
  const out = new Set<Grant["beneficiary_types"][number]>();
  for (const p of publics) {
    if (/^Association/.test(p)) out.add("ngo");
    else if (/^Collectivité/.test(p)) out.add("public_body");
    else if (/PME|TPE/.test(p)) out.add("sme");
    else if (/Créateur d'entreprise/.test(p)) out.add("startup");
    else if (/Chercheur|^Particulier|^Jeunes/.test(p)) out.add("individual");
    else if (/^Professionnel|^Entreprises/.test(p)) out.add("company");
    else if (/recherche|enseignement supérieur/.test(p)) out.add("research_org");
    else out.add("other");
  }
  return [...out];
}

function fundingTypes(nature: string): Grant["funding_types"] {
  const out = new Set<Grant["funding_types"][number]>();
  if (/subvention|bourse|aide financière/i.test(nature)) out.add("grant");
  if (/\bprêts?\b|avance remboursable/i.test(nature)) out.add("loan");
  return [...out];
}

function normalize(r: Row): Grant {
  const now = Date.now();
  const opened = toIso(r.date_ouverture);
  const closes = toIso(r.date_cloture);
  const nextRound = toIso(r.datedebutfuturcampagne);
  const over = closes !== null && new Date(closes).getTime() < now;
  const upcoming = over && nextRound !== null && new Date(nextRound).getTime() > now;
  const opens = upcoming ? nextRound : opened;
  const status: Grant["status"] = upcoming ? "forthcoming" : over ? "closed" : opens && new Date(opens).getTime() > now ? "forthcoming" : "open";
  const publics = r.qui_peut_en_beneficier ?? [];
  const nature = plain(r.modalite);
  const summary = [
    plain(r.entete),
    r.theme?.length && `Thèmes : ${r.theme.join(" ; ")}`,
    r.mots_cles?.length && `Mots clés : ${r.mots_cles.join(" ; ")}`,
    publics.length && `Qui peut en bénéficier : ${publics.join(" ; ")}`,
    plain(r.publicsbeneficiaireprecision) && `Précisions sur le public bénéficiaire :\n${plain(r.publicsbeneficiaireprecision)}`,
    plain(r.objectif) && `Pour quel type de projet ?\n${plain(r.objectif)}`,
    nature && `Quelle est la nature de l'aide ?\n${nature}`,
    plain(r.demarches) && `Quelles démarches ?\n${plain(r.demarches)}`,
    r.date_ouverture && `Date d'ouverture : ${paris(r.date_ouverture)}`,
    r.date_cloture && `Date de clôture : ${paris(r.date_cloture)}`,
    r.datedebutfuturcampagne && `Date de début de la future campagne : ${paris(r.datedebutfuturcampagne)}`,
    r.demarche_en_ligne === "TRUE" && "Démarche en ligne : oui",
    plain(r.notes) && `À noter :\n${plain(r.notes)}`,
    r.engagements_du_beneficiaire?.length && `Engagements du bénéficiaire : ${r.engagements_du_beneficiaire.join(" ; ")}`,
    r.deliberation_cadre && `Délibération cadre : ${r.deliberation_cadre}`,
    plain(r.contact) && `Contact :\n${plain(r.contact)}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `fr_iledefrance:${r.id_aide}`,
    source: "fr_iledefrance",
    source_id: r.id_aide,
    source_url: r.url_descriptif?.startsWith("https://") ? r.url_descriptif : `https://www.iledefrance.fr/aides-et-appels-a-projets/${r.reference_administrative ?? ""}`,
    source_license: LICENSE,
    title: (r.titre_alternatif_de_l_aide || r.nom_de_l_aide_de_la_demarche || "").replace(/\s+/g, " ").trim(),
    title_lang: "fr",
    summary: summary || null,
    funder_name: r.porteur_aide || "Région Île-de-France",
    funder_level: "regional",
    country: "FR",
    regions: ["FR10"],
    funding_types: fundingTypes(nature),
    beneficiary_types: beneficiaryTypes(publics),
    sectors: r.theme ?? [],
    amount_min: null,
    amount_max: null,
    budget_total: null,
    currency: "EUR",
    status,
    opens_at: opens,
    // The closing date of a past round says nothing about the next one.
    closes_at: upcoming ? null : closes,
    documents: [],
    source_updated_at: toIso(r.date),
  };
}

export const frIledefrance: Source = {
  id: "fr_iledefrance",
  license: LICENSE,
  start() {
    return "0";
  },
  // Cursor = row offset.
  async fetchPage(cursor): Promise<Page> {
    const offset = Number(cursor);
    const { total_count, results } = await fetchJson<{ total_count: number; results: Row[] }>(`${API}?limit=${PAGE_SIZE}&offset=${offset}&order_by=id_aide`, { headers: UA });
    if (offset === 0 && results.length === 0) throw new Error("Région Île-de-France dataset aides-appels-a-projets returned no rows");
    const rows = results.filter((r) => r.id_aide && (r.titre_alternatif_de_l_aide || r.nom_de_l_aide_de_la_demarche));
    const next = results.length > 0 && offset + PAGE_SIZE < total_count ? String(offset + PAGE_SIZE) : null;
    return { grants: rows.map(normalize), raws: rows.map((r) => ({ source_id: r.id_aide, payload: r })), next };
  },
};
