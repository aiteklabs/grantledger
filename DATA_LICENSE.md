# Data license

Normalized records produced by this project (the `grants` table, JSONL exports)
are released under CC0 1.0. Original source material keeps its publisher's
license, recorded per source below and in `source_license` on every record.

| Source id | Publisher | License / terms | Notes |
|---|---|---|---|
| `eu_ft` | European Commission, Funding & Tenders Portal SEARCH API | Commission reuse policy (Decision 2011/833/EU, CC BY 4.0 compatible) | Public API key `SEDIA`. |
| `es_bdns` | IGAE, Base de Datos Nacional de Subvenciones | See https://www.infosubvenciones.es/bdnstrans/GE/es/avisolegal | Publisher may throttle abusive access. Keep request rate low. |
| `fr_aides_entreprises` | DGE / ISM, aides-entreprises.fr | Licence Ouverte 2.0 (Etalab) | Weekly CSV mirror at data.cquest.org. |
| `us_grants_gov` | US HHS, Grants.gov | US Government work, public domain | search2 and fetchOpportunity endpoints. |
| `nl_rvo` | Rijksdienst voor Ondernemend Nederland, open data | CC0 1.0 (data.overheid.nl) | JSON list plus public detail pages for status. |
| `lt_esinvesticijos` | Ministry of Finance of Lithuania, esinvesticijos.lt | Public information, source attribution kept on every record | HTML list and detail pages, one request per call. |
| `uk_find_a_grant` | UK Government, Find a grant (GOV.UK) | Open Government Licence v3.0 | Server-rendered list pages. |
| `it_incentivi` | Ministero delle Imprese e del Made in Italy, incentivi.gov.it | IODL 2.0 (Italian Open Data License) | Public Solr index behind the portal's open data export. |
| `se_vinnova` | Vinnova (Sweden), open data API | Public Domain Mark | One request per crawl, rounds modified since 2015. |
| `fi_eura` | EURA 2021 (Finland), EU structural funds calls | Public call notices, Ministry of Economic Affairs and Employment | Dataset embedded in the list page. |
| `no_forskningsradet` | Forskningsrådet (Norway) | Public call information | JSON search API, current and completed calls. |
| `dk_tilskudspuljer` | Statens Tilskudspuljer (Denmark) | Open data export, free extraction | Full CSV dump. |
| `at_ffg` | FFG (Austria) | Public call information | Server-rendered list, three status filters. |
| `pt_portugal2030` | Portugal 2030 (AD&C) | Public call notices | JSON API, 5 per page, open, scheduled and closed. |
| `de_foerderinfo` | Förderberatung des Bundes (Germany) | Public federal announcements | 11 RSS feeds, 20 items each. Förderdatenbank itself blocks automated access. |
| `cz_dotaceeu` | dotaceeu.cz (Czechia, MMR) | Public call list | Three server-rendered feeds, 5 per page. |
| `gr_espa` | ESPA 2021-2027 (Greece) | Public proclamations | List plus one detail page per call. |
| `ie_enterprise_ireland` | Enterprise Ireland | Public supports information | One list page of programmes, no dates. |
| `ro_mfe` | Ministry of European Investments and Projects (Romania) | Public announcements (Atom feed) | Announcements, no structured dates. |
| `pl_harmonogram` | Ministry of Funds and Regional Policy (Poland), via dane.gov.pl | CC0 1.0 | Call schedules for FERS and FERC as xlsx. |
| `be_1890` | 1890.be, Région wallonne (SOWALFIN) | Public business aid directory | JSON API, one detail call per scheme. |
| `be_innoviris` | Innoviris (Brussels-Capital) | Public programme calendar | One HTML table. |
| `be_vlaio` | VLAIO subsidiedatabank (Flanders) | Public information | Browser-like requests only; local runner when Cloudflare egress is refused. |
| `at_aws` | aws, Austria Wirtschaftsservice | Public programme information; texts copyrighted by aws, key data and link kept | Programme pages from the site's sitemap. |
| `at_fwf` | FWF Austrian Science Fund | Public funding programme information | Site search JSON plus programme pages. |
| `be_belspo` | BELSPO, Belgian Science Policy Office | Public call information | One calls page; robots.txt crawl delay respected, one request per crawl. |
| `dk_dff` | Danmarks Frie Forskningsfond | Public call information | Sitemap plus instrument pages. |
| `dk_innovationsfonden` | Innovationsfonden (Innovation Fund Denmark) | Public call information | List page plus call pages, paced requests. |
| `dk_kunstfond` | Statens Kunstfond (Danish Arts Foundation) | Public grant pool information | List page plus pool pages. |
| `de_dfg` | DFG, Deutsche Forschungsgemeinschaft | Public calls for proposals (Informationen für die Wissenschaft) | Open-calls page plus call pages. |
| `ie_enterprise_hub` | National Enterprise Hub (Government of Ireland) | Public business supports information | The site's pagination fragments. |
| `ie_research_ireland` | Research Ireland (Taighde Éireann) | Public funding call information | Funding page data plus call pages. |
| `no_innovasjonnorge` | Innovasjon Norge | Public service information | The site's public content API (service pages, Norwegian). |
| `no_tilskudd` | Tilskudd.no, Lotteri- og stiftelsestilsynet | Public register of state grant schemes | The site's GraphQL search plus scheme pages. |
| `pt_fct` | FCT, Fundação para a Ciência e a Tecnologia | Public call information | Concursos listing plus call pages. |
| `pt_fundo_ambiental` | Fundo Ambiental (Agência para o Clima, I.P.) | Public call notices | Current-year and PRR registers plus call pages. |
| `lt_inovacijuagentura` | Inovacijų agentūra (Lithuanian Innovation Agency) | Public call information | Public list endpoint plus call page payloads. |
| `uk_prs_foundation` | PRS Foundation (UK music funder) | Public funding programme information | WordPress REST API: deadlines page plus fund pages. |
