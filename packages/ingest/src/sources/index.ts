import type { SourceId } from "@grantledger/schema";
import { esBdns } from "./es-bdns";
import { euFt } from "./eu-ft";
import { frAidesEntreprises } from "./fr-aides-entreprises";
import { ltEsinvesticijos } from "./lt-esinvesticijos";
import { nlRvo } from "./nl-rvo";
import { atFfg } from "./at-ffg";
import { be1890 } from "./be-1890";
import { beInnoviris } from "./be-innoviris";
import { beVlaio } from "./be-vlaio";
import { czDotaceeu } from "./cz-dotaceeu";
import { deFoerderinfo } from "./de-foerderinfo";
import { grEspa } from "./gr-espa";
import { ieEnterpriseIreland } from "./ie-enterprise-ireland";
import { plHarmonogram } from "./pl-harmonogram";
import { roMfe } from "./ro-mfe";
import { ptPortugal2030 } from "./pt-portugal2030";
import { dkTilskudspuljer } from "./dk-tilskudspuljer";
import { fiEura } from "./fi-eura";
import { itIncentivi } from "./it-incentivi";
import { noForskningsradet } from "./no-forskningsradet";
import { seVinnova } from "./se-vinnova";
import { ukFindAGrant } from "./uk-find-a-grant";
import { ukBrightonHove } from "./uk-brighton-hove";
import { ukPrsFoundation } from "./uk-prs-foundation";
import { ukSussexCf } from "./uk-sussex-cf";
import { atAws } from "./at-aws";
import { atFwf } from "./at-fwf";
import { beBelspo } from "./be-belspo";
import { dkDff } from "./dk-dff";
import { dkInnovationsfonden } from "./dk-innovationsfonden";
import { dkKunstfond } from "./dk-kunstfond";
import { deDfg } from "./de-dfg";
import { ieEnterpriseHub } from "./ie-enterprise-hub";
import { ieResearchIreland } from "./ie-research-ireland";
import { noInnovasjonnorge } from "./no-innovasjonnorge";
import { noTilskudd } from "./no-tilskudd";
import { ptFct } from "./pt-fct";
import { ptFundoAmbiental } from "./pt-fundo-ambiental";
import { ltInovacijuagentura } from "./lt-inovacijuagentura";
import { frIledefrance } from "./fr-iledefrance";
import { deDsee } from "./de-dsee";
import { eeEtag } from "./ee-etag";
import { eeRtk } from "./ee-rtk";
import { eeKysk } from "./ee-kysk";
import { luFnr } from "./lu-fnr";
import { isIsland } from "./is-island";
import { chProhelvetia } from "./ch-prohelvetia";
import { chInnosuisse } from "./ch-innosuisse";
import { mtXjenza } from "./mt-xjenza";
import { czTacr } from "./cz-tacr";
import { czSfzp } from "./cz-sfzp";
import { ptPepac } from "./pt-pepac";
import { ptGulbenkian } from "./pt-gulbenkian";
import { ltApva } from "./lt-apva";
import { ltCpva } from "./lt-cpva";
import { grAgro } from "./gr-agro";
import { roAfir } from "./ro-afir";
import { siGovObjave } from "./si-gov-objave";
import { siAris } from "./si-aris";
import { siPodjetniskiSklad } from "./si-podjetniski-sklad";
import { siEvropskaSredstva } from "./si-evropska-sredstva";
import { bgIsun } from "./bg-isun";
import { huNkfih } from "./hu-nkfih";
import { euEit } from "./eu-eit";
import { ukInnovate } from "./uk-innovate";
import { ieHrb } from "./ie-hrb";
import { nlZonmw } from "./nl-zonmw";
import { nlNwo } from "./nl-nwo";
import { nlGelderland } from "./nl-gelderland";
import { plNcbr } from "./pl-ncbr";
import { plNfosigw } from "./pl-nfosigw";
import { plRegional } from "./pl-regional";
import { fiHaeavustuksia } from "./fi-haeavustuksia";
import { fiAka } from "./fi-aka";
import { fiSkr } from "./fi-skr";
import { usCalifornia } from "./us-california";
import { seFormas } from "./se-formas";
import { seEnergimyndigheten } from "./se-energimyndigheten";
import { seKulturradet } from "./se-kulturradet";
import { seForte } from "./se-forte";
import { dkNovoNordisk } from "./dk-novo-nordisk";
import { dkCarlsberg } from "./dk-carlsberg";
import { noKulturdirektoratet } from "./no-kulturdirektoratet";
import { noRegionaleForskningsfond } from "./no-regionale-forskningsfond";
import { itPiemonte } from "./it-piemonte";
import { itLazio } from "./it-lazio";
import { itToscana } from "./it-toscana";
import { itConIlSud } from "./it-con-il-sud";
import { beKbs } from "./be-kbs";
import { beFnrs } from "./be-fnrs";
import { beHubBrussels } from "./be-hub-brussels";
import { skItms21 } from "./sk-itms21";
import { skFpu } from "./sk-fpu";
import { hrEkohezija } from "./hr-ekohezija";
import { hrRuralnirazvoj } from "./hr-ruralnirazvoj";
import { lvEsfondi } from "./lv-esfondi";
import { cyFundingPortal } from "./cy-funding-portal";
import { euEeaGrants } from "./eu-eea-grants";
import type { Source } from "./types";
import { usGrantsGov } from "./us-grants-gov";

export const sources: Record<SourceId, Source> = {
  eu_ft: euFt,
  es_bdns: esBdns,
  fr_aides_entreprises: frAidesEntreprises,
  us_grants_gov: usGrantsGov,
  nl_rvo: nlRvo,
  lt_esinvesticijos: ltEsinvesticijos,
  uk_find_a_grant: ukFindAGrant,
  it_incentivi: itIncentivi,
  se_vinnova: seVinnova,
  fi_eura: fiEura,
  no_forskningsradet: noForskningsradet,
  dk_tilskudspuljer: dkTilskudspuljer,
  at_ffg: atFfg,
  pt_portugal2030: ptPortugal2030,
  de_foerderinfo: deFoerderinfo,
  cz_dotaceeu: czDotaceeu,
  gr_espa: grEspa,
  ie_enterprise_ireland: ieEnterpriseIreland,
  ro_mfe: roMfe,
  pl_harmonogram: plHarmonogram,
  be_1890: be1890,
  be_innoviris: beInnoviris,
  be_vlaio: beVlaio,
  at_aws: atAws,
  at_fwf: atFwf,
  be_belspo: beBelspo,
  dk_dff: dkDff,
  dk_innovationsfonden: dkInnovationsfonden,
  dk_kunstfond: dkKunstfond,
  de_dfg: deDfg,
  ie_enterprise_hub: ieEnterpriseHub,
  ie_research_ireland: ieResearchIreland,
  no_innovasjonnorge: noInnovasjonnorge,
  no_tilskudd: noTilskudd,
  pt_fct: ptFct,
  pt_fundo_ambiental: ptFundoAmbiental,
  lt_inovacijuagentura: ltInovacijuagentura,
  uk_prs_foundation: ukPrsFoundation,
  uk_sussex_cf: ukSussexCf,
  uk_brighton_hove: ukBrightonHove,
  fr_iledefrance: frIledefrance,
  de_dsee: deDsee,
  ee_etag: eeEtag,
  ee_rtk: eeRtk,
  ee_kysk: eeKysk,
  lu_fnr: luFnr,
  is_island: isIsland,
  ch_prohelvetia: chProhelvetia,
  ch_innosuisse: chInnosuisse,
  mt_xjenza: mtXjenza,
  cz_tacr: czTacr,
  cz_sfzp: czSfzp,
  pt_pepac: ptPepac,
  pt_gulbenkian: ptGulbenkian,
  lt_apva: ltApva,
  lt_cpva: ltCpva,
  gr_agro: grAgro,
  ro_afir: roAfir,
  si_gov_objave: siGovObjave,
  si_aris: siAris,
  si_podjetniski_sklad: siPodjetniskiSklad,
  si_evropska_sredstva: siEvropskaSredstva,
  bg_isun: bgIsun,
  hu_nkfih: huNkfih,
  eu_eit: euEit,
  uk_innovate: ukInnovate,
  ie_hrb: ieHrb,
  nl_zonmw: nlZonmw,
  nl_nwo: nlNwo,
  nl_gelderland: nlGelderland,
  pl_ncbr: plNcbr,
  pl_nfosigw: plNfosigw,
  pl_regional: plRegional,
  fi_haeavustuksia: fiHaeavustuksia,
  fi_aka: fiAka,
  fi_skr: fiSkr,
  us_california: usCalifornia,
  se_formas: seFormas,
  se_energimyndigheten: seEnergimyndigheten,
  se_kulturradet: seKulturradet,
  se_forte: seForte,
  dk_novo_nordisk: dkNovoNordisk,
  dk_carlsberg: dkCarlsberg,
  no_kulturdirektoratet: noKulturdirektoratet,
  no_regionale_forskningsfond: noRegionaleForskningsfond,
  it_piemonte: itPiemonte,
  it_lazio: itLazio,
  it_toscana: itToscana,
  it_con_il_sud: itConIlSud,
  be_kbs: beKbs,
  be_fnrs: beFnrs,
  be_hub_brussels: beHubBrussels,
  sk_itms21: skItms21,
  sk_fpu: skFpu,
  hr_ekohezija: hrEkohezija,
  hr_ruralnirazvoj: hrRuralnirazvoj,
  lv_esfondi: lvEsfondi,
  cy_funding_portal: cyFundingPortal,
  eu_eea_grants: euEeaGrants,
};
export type { Page, RawRecord, Source } from "./types";
