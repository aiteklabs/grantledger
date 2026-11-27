import type { Grant } from "@grantledger/schema";
import { mapLimit, num, statusFromDates, toIso } from "../util";
import type { Page, Source } from "./types";

// Finland, Haeavustuksia.fi: the national portal of discretionary government grant calls, run by the State Treasury
// (Valtiokonttori) for ministries, agencies and the regional state authorities. The site is a single-page app over a
// public JSON API. /api/haku/list-items returns the running and upcoming calls (about 280; the 2,500 ended ones are
// excluded by the ShowEnded flag) and takes a page size large enough for all of them in one request. Two detail
// endpoints per call add the description, goals, funds and eligibility: .../hakuilmoitus/perustiedot and
// .../hakuilmoitus/myontoperusteet. The first fetchPage call reads the list and the cursor then carries the call ids
// still to read, 12 per call (24 detail requests). Texts come in fi, sv and en, plain or as a ProseMirror document;
// Finnish is the record language unless the call is published in English and every Finnish text has an English one.
// Contact persons are left out. Azure Front Door sits in front of the site.
const SITE = "https://www.haeavustuksia.fi";
const LIST = `${SITE}/api/haku/list-items?Language=fi&ShowFuture=true&ShowOngoing=true&ShowEnded=false&Pagination.PageSize=500`;
const LICENSE = "Haeavustuksia.fi public government grant call notices (Valtiokonttori, State Treasury of Finland)";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; grantledger/0.1; +https://grantledger.eu)", accept: "application/json" };
const BATCH = 12;

type Lang = "fi" | "en";
interface RichNode { type?: string; text?: string; content?: RichNode[] }
interface Loc { fi?: string | null; en?: string | null; richFi?: RichNode | null; richEn?: RichNode | null }
interface ListResponse { pageCount: number; hakuilmoitukset: { hakuasianAsianumero: string }[] }
interface Basics {
  hakuilmoitus: {
    nimi?: Loc | null;
    kuvaus?: Loc | null;
    kielet?: string[] | null;
    avustuslaji?: string | null;
    vastuullinenJarjestajaOrganisaatioNimi?: Loc | null;
    vastuullinenJarjestajaAlaorganisaatioNimi?: Loc | null;
    jaettavatVarat?: Loc | null;
    hakuTyyppi?: string | null;
    hakuAlkaaDateTimeUtc?: string | null;
    hakuPaattyyDateTimeUtc?: string | null;
    tavoitteet?: { otsikko?: Loc | null; kuvaus?: Loc | null; mittarit?: Loc | null }[] | null;
    ulkoinenAsiointipalveluUrl?: Loc | null;
    asiakaspalvelunYhteystiedot?: Loc | null;
    yhteyshenkilot?: unknown;
  } | null;
}
interface Grounds {
  hakuilmoitus: {
    saadosperusteet?: { nimike?: Loc | null; saadosnumero?: string | null }[] | null;
    kenelleAvustustaVoidaanMyontaa?: Loc | null;
    mihinTarkoitukseenAvustustaVoidaanMyontaa?: Loc | null;
    avustustaEiVoidaMyontaa?: Loc | null;
    edellytykset?: Loc | null;
    esteet?: Loc | null;
  } | null;
}

const LABELS = {
  fi: { type: "Avustuslaji", mode: "Hakutyyppi", period: "Hakuaika", funds: "Jaettavat varat", goals: "Tavoitteet", who: "Kenelle avustusta voidaan myöntää", what: "Mihin tarkoitukseen avustusta voidaan myöntää", not: "Avustusta ei voida myöntää", conditions: "Myöntämisen edellytykset", obstacles: "Myöntämisen esteet", laws: "Säädösperusteet", apply: "Asiointipalvelu", service: "Asiakaspalvelu" },
  en: { type: "Grant type", mode: "Call type", period: "Application period", funds: "Funds to be distributed", goals: "Objectives", who: "Who can be granted", what: "For what purpose", not: "Not granted for", conditions: "Conditions for granting", obstacles: "Obstacles to granting", laws: "Legal basis", apply: "Application service", service: "Customer service" },
};
const TYPES: Record<string, Record<Lang, string>> = {
  Yleisavustus: { fi: "Yleisavustus", en: "General grant" },
  Hankeavustus: { fi: "Hankeavustus", en: "Project grant" },
  Investointiavustus: { fi: "Investointiavustus", en: "Investment grant" },
  Apuraha: { fi: "Apuraha", en: "Personal grant" },
  MuuErityisavustus: { fi: "Muu erityisavustus", en: "Other special grant" },
  Jatkuva: { fi: "Jatkuva haku", en: "Continuous call" },
  Maaraaikainen: { fi: "Määräaikainen haku", en: "Fixed-term call" },
};
// Regional state authorities and regional councils: the area named in the authority's Finnish name.
const AREAS: Record<string, string> = {
  Uudenmaan: "Uusimaa", "Lounais-Suomen": "Lounais-Suomi", "Kaakkois-Suomen": "Kaakkois-Suomi", "Sisä-Suomen": "Sisä-Suomi", "Keski-Suomen": "Keski-Suomi",
  "Itä-Suomen": "Itä-Suomi", "Etelä-Pohjanmaan": "Etelä-Pohjanmaa", Pohjanmaan: "Pohjanmaa", "Pohjois-Suomen": "Pohjois-Suomi", Lapin: "Lappi",
  "Varsinais-Suomen": "Varsinais-Suomi", "Pohjois-Karjalan": "Pohjois-Karjala", "Päijät-Hämeen": "Päijät-Häme",
};

const clean = (s: string) => s.replace(/\r/g, "").replace(/[\u00a0\u200b]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{2,}/g, "\n").trim();

// A ProseMirror document as plain text, one line per block.
function rich(node: RichNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(rich).join("");
  return node.type === "doc" ? inner : `${inner}\n`;
}

const text = (l: Loc | null | undefined, lang: Lang) => clean(l?.[lang] || rich(lang === "fi" ? l?.richFi : l?.richEn));

async function get<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: HEADERS });
  // A call withdrawn between the list and the detail request.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// The call budget, only when the text states a total: an amount at its start ("12 milj. euroa", "Noin 4 800 000 €")
// or after "yhteensä" ("varattu yhteensä 709 218 euroa"). Maximum grants, ranges and other wording give null.
function euros(s: string): number | null {
  const amount = "(\\d[\\d ]*)(?:[,.](\\d{1,2}))?\\s*(miljoona\\w*|milj\\.?|M)?\\s*(?:euroa|€|EUR\\b)";
  const lead = "(?:\\s*(?:enintään|noin|n\\.))*\\s*";
  const t = s.replace(/[\u00a0\u202f]/g, " ");
  const m = t.match(new RegExp(`^${lead}${amount}`, "i")) ?? t.match(new RegExp(`(?:yhteensä|yht\\.)${lead}${amount}`, "i"));
  if (!m) return null;
  const value = num(`${(m[1] as string).replace(/ /g, "")}.${m[2] ?? "0"}`);
  return value === null ? null : Math.round(value * (m[3] ? 1e6 : 1) * 100) / 100;
}

function beneficiaryTypes(s: string): Grant["beneficiary_types"] {
  const t = s.toLowerCase();
  const out = new Set<Grant["beneficiary_types"][number]>();
  if (/pk-yrity|pienet ja keskisuuret|pienille ja keskisuurille|\bsme/.test(t)) out.add("sme");
  if (/yrity|osakeyhtiö|elinkeinonharjoittaj|kalastaj|viljelij|maatil|compan|enterprise|business/.test(t)) out.add("company");
  if (/korkeakoul|yliopisto|tutkimuslaito|tutkimusorganisaatio|universit|research organi/.test(t)) out.add("research_org");
  if (/kunna|kunni|kunta|hyvinvointialue|seurakun|valtion virasto|municipal|public bod/.test(t)) out.add("public_body");
  if (/yhdisty|järjestö|säätiö|association|foundation|\bngo/.test(t)) out.add("ngo");
  if (/yksityishenkilö|luonnolli\w+ henkilö|private individual|natural person/.test(t)) out.add("individual");
  return [...out].sort();
}

function normalize(id: string, basics: Basics, grounds: Grounds | null): Grant {
  const b = basics.hakuilmoitus ?? {};
  const g = grounds?.hakuilmoitus ?? {};
  const goals = b.tavoitteet ?? [];
  const texts = [b.nimi, b.kuvaus, b.jaettavatVarat, ...goals.flatMap((t) => [t.otsikko, t.kuvaus, t.mittarit]), g.kenelleAvustustaVoidaanMyontaa, g.mihinTarkoitukseenAvustustaVoidaanMyontaa, g.avustustaEiVoidaMyontaa, g.edellytykset, g.esteet];
  const lang: Lang = (b.kielet ?? []).includes("En") && texts.every((l) => !text(l, "fi") || text(l, "en")) ? "en" : "fi";
  const L = LABELS[lang];
  const opens = toIso(b.hakuAlkaaDateTimeUtc);
  const closes = toIso(b.hakuPaattyyDateTimeUtc);
  const labelled = (label: string, value: string) => (value ? (value.includes("\n") ? `${label}:\n${value}` : `${label}: ${value}`) : "");
  const funderFi = text(b.vastuullinenJarjestajaOrganisaatioNimi, "fi");
  const area = funderFi.match(/^(\S+) (?:elinvoimakeskus|ELY-keskus|liitto|maakuntaliitto)$/)?.[1];
  const who = text(g.kenelleAvustustaVoidaanMyontaa, lang);
  const summary = [
    text(b.kuvaus, lang),
    [
      labelled(L.type, TYPES[b.avustuslaji ?? ""]?.[lang] ?? b.avustuslaji ?? ""),
      labelled(L.mode, TYPES[b.hakuTyyppi ?? ""]?.[lang] ?? b.hakuTyyppi ?? ""),
      labelled(L.period, [opens, closes].some(Boolean) ? `${opens ?? ""} - ${closes ?? ""}` : ""),
    ].filter(Boolean).join("\n"),
    labelled(L.funds, text(b.jaettavatVarat, lang)),
    labelled(L.goals, goals.map((t) => [text(t.otsikko, lang), text(t.kuvaus, lang), text(t.mittarit, lang)].filter(Boolean).join("\n")).filter(Boolean).join("\n")),
    labelled(L.who, who),
    labelled(L.what, text(g.mihinTarkoitukseenAvustustaVoidaanMyontaa, lang)),
    labelled(L.not, text(g.avustustaEiVoidaMyontaa, lang)),
    labelled(L.conditions, text(g.edellytykset, lang)),
    labelled(L.obstacles, text(g.esteet, lang)),
    labelled(L.laws, (g.saadosperusteet ?? []).map((s) => [text(s.nimike, lang) || text(s.nimike, "fi"), s.saadosnumero].filter(Boolean).join(" ")).filter(Boolean).join("; ")),
    labelled(L.apply, text(b.ulkoinenAsiointipalveluUrl, lang) || text(b.ulkoinenAsiointipalveluUrl, "fi")),
    labelled(L.service, text(b.asiakaspalvelunYhteystiedot, lang) || text(b.asiakaspalvelunYhteystiedot, "fi")),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  return {
    id: `fi_haeavustuksia:${id}`,
    source: "fi_haeavustuksia",
    source_id: id,
    source_url: `${SITE}/${lang}/haku/${id}`,
    source_license: LICENSE,
    title: text(b.nimi, lang).replace(/\n/g, " ") || id,
    title_lang: lang,
    summary: summary || null,
    funder_name: [text(b.vastuullinenJarjestajaOrganisaatioNimi, lang) || funderFi, text(b.vastuullinenJarjestajaAlaorganisaatioNimi, lang)].filter(Boolean).join(", ") || null,
    funder_level: area ? "regional" : "national",
    country: "FI",
    regions: area ? [AREAS[area] ?? area] : [],
    funding_types: ["grant"],
    beneficiary_types: beneficiaryTypes(`${who} ${text(g.kenelleAvustustaVoidaanMyontaa, "fi")}`),
    sectors: [],
    amount_min: null,
    amount_max: null,
    budget_total: euros(text(b.jaettavatVarat, "fi")),
    currency: "EUR",
    // A continuous call without an end date is open.
    status: statusFromDates(opens, closes),
    opens_at: opens,
    closes_at: closes,
    documents: [],
    source_updated_at: null,
  };
}

export const fiHaeavustuksia: Source = {
  id: "fi_haeavustuksia",
  license: LICENSE,
  start() {
    return "start";
  },
  // Cursor "start": read the list of call ids. After that the cursor is the JSON list of ids still to read.
  async fetchPage(cursor): Promise<Page> {
    let ids: string[];
    if (cursor === "start") {
      const found = new Set<string>();
      for (let page = 1, pages = 1; page <= pages; page++) {
        const res = await get<ListResponse>(`${LIST}&Pagination.Page=${page}`);
        for (const h of res?.hakuilmoitukset ?? []) found.add(h.hakuasianAsianumero);
        pages = Math.min(res?.pageCount ?? 1, 10);
      }
      if (found.size === 0) throw new Error("Haeavustuksia.fi returned no calls (blocked or changed API?)");
      // Sorted: the cursor must not depend on the order of the list.
      ids = [...found].sort();
    } else {
      ids = JSON.parse(cursor) as string[];
    }
    const batch = ids.slice(0, BATCH);
    const rest = ids.slice(BATCH);
    const details = await mapLimit(batch, 2, async (id) => {
      const base = `${SITE}/api/haku/${encodeURIComponent(id)}/hakuilmoitus`;
      const basics = await get<Basics>(`${base}/perustiedot`);
      return basics ? { basics, grounds: await get<Grounds>(`${base}/myontoperusteet`) } : null;
    });
    const grants: Grant[] = [];
    const raws: Page["raws"] = [];
    batch.forEach((id, i) => {
      const d = details[i];
      if (!d) return;
      grants.push(normalize(id, d.basics, d.grounds));
      // Contact persons (names, phone numbers) are not archived.
      raws.push({ source_id: id, payload: { perustiedot: { ...d.basics.hakuilmoitus, yhteyshenkilot: undefined }, myontoperusteet: d.grounds?.hakuilmoitus ?? null } });
    });
    return { grants, raws, next: rest.length ? JSON.stringify(rest) : null };
  },
};
