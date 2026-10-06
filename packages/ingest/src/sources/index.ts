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
};
export type { Page, RawRecord, Source } from "./types";
