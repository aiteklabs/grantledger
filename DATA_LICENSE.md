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
| `it_incentivi` | Ministero delle Imprese e del Made in Italy, Incentivi Italia (incentivitalia.gov.it) | CC BY 4.0 | Daily open data export of the incentives catalogue (JSON). |
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
| `uk_sussex_cf` | Sussex Community Foundation | Public grant programme information | Main grants page, additional grants list and fund pages, one request every 10 seconds as robots.txt asks. |
| `uk_brighton_hove` | Brighton & Hove City Council | Public grant information | Community Catalyst Fund page. |
| `fr_iledefrance` | Région Île-de-France | Licence Ouverte 2.0 (Etalab) | Opendatasoft records API, dataset aides-appels-a-projets, no key. |
| `de_dsee` | Deutsche Stiftung für Engagement und Ehrenamt (DSEE) | Public programme register | HTML list pages, cards only; deadlines stay on the DSEE detail page. |
| `ee_etag` | Eesti Teadusagentuur (Estonian Research Council) | Public call information | List page plus the news post of each open round, one request every 10 seconds as robots.txt asks. |
| `ee_rtk` | Riigi Tugiteenuste Keskus (State Shared Service Centre) | Public application round information | One list page plus the measure page of each open or upcoming round. |
| `ee_kysk` | Sihtasutus Kodanikuühiskonna Sihtkapital (KÜSK) | Public application round information | Rounds list page plus WordPress REST for the text of running rounds. |
| `lu_fnr` | Fonds National de la Recherche (Luxembourg National Research Fund) | Public funding instrument information | Theme JSON endpoint plus the programme page of each open instrument. |
| `is_island` | Stafrænt Ísland (Digital Iceland), island.is Styrkjatorg | Public grant information | Public GraphQL API (getGrants, English). |
| `ch_prohelvetia` | Pro Helvetia, Schweizer Kulturstiftung (Swiss Arts Council) | Public funding information | WordPress REST type funding-opportunities (English) plus taxonomy lists. |
| `ch_innosuisse` | Innosuisse, Swiss Innovation Agency | Public call information (Swiss Confederation) | List page plus the payload embedded in each call page. |
| `mt_xjenza` | Xjenza Malta | Public funding scheme information | WordPress REST posts in the category Open Funding Schemes, one request with the 30 second pause robots.txt asks. |
| `cz_tacr` | Technologická agentura České republiky (TA ČR) | Public call information | WordPress REST list of calls plus the public call page of each one. |
| `cz_sfzp` | Státní fond životního prostředí České republiky | Public call information | Call lists of narodniprogramzp.cz and sfzp.gov.cz plus each call page. |
| `pt_pepac` | Autoridade de Gestão do PEPAC no Continente | Public call notices | WordPress REST competition list plus the site's own public list route for exact deadlines. |
| `pt_gulbenkian` | Fundação Calouste Gulbenkian | Public grant and scholarship information | Archive pages per grant type plus the detail page of open calls. |
| `lt_apva` | Aplinkos projektų valdymo agentūra (APVA) | Public call information | Table of published calls plus each call page. |
| `lt_cpva` | Centrinė projektų valdymo agentūra (CPVA) | Public call information | Call list pages plus the detail page of calls that are not over. |
| `gr_agro` | Ministry of Rural Development and Food (agrotikianaptixi.gr) | Public call notices | Call archive pages plus the detail page of active calls. |
| `ro_afir` | Agenția pentru Finanțarea Investițiilor Rurale (AFIR) | Public session information | Table of open sessions plus the public page of each intervention. |
| `si_gov_objave` | Government of the Republic of Slovenia (GOV.SI portal) | Public notices | List of ongoing public calls and invitations plus one detail page per kept call. |
| `si_aris` | Javna agencija za znanstvenoraziskovalno in inovacijsko dejavnost Republike Slovenije (ARIS) | Public call information | The site's own listing endpoint plus one detail page per call. |
| `si_podjetniski_sklad` | Slovenski podjetniški sklad (Slovene Enterprise Fund) | Public call information | The site's list endpoint plus the detail page of each open call. |
| `si_evropska_sredstva` | Republic of Slovenia, portal evropskasredstva.si | Public call information | HTML list of current and announced calls, cards only. |
| `bg_isun` | Council of Ministers of the Republic of Bulgaria (ISUN 2020 information system) | Public procedure register | Tree of active procedures plus one detail page per procedure; direct awards and technical assistance are left out. |
| `hu_nkfih` | Nemzeti Kutatási, Fejlesztési és Innovációs Hivatal (NKFIH) | Public call information | List of current calls plus one detail page per call, one request per second as robots.txt asks. |
| `eu_eit` | European Institute of Innovation and Technology (EIT) | EIT re-use policy: free re-use with acknowledgement of the source | Opportunities list plus one page per opportunity. |
| `uk_innovate` | Innovate UK (UK Research and Innovation) | Open Government Licence v3.0 | Competition search plus each competition overview page. |
| `ie_hrb` | Health Research Board | Public funding scheme information | WordPress REST API for enumeration, grant schemes page for status, scheme pages for details. |
| `nl_zonmw` | ZonMw (Netherlands Organisation for Health Research and Development) | Public subsidy call information | Overview sorted by end date plus each call page, one request every 4 seconds as robots.txt asks. |
| `nl_nwo` | Dutch Research Council (NWO) | Public call information | Overview with status facet plus each call page, one request every 3 seconds as robots.txt asks. |
| `nl_gelderland` | Provincie Gelderland | Public subsidy information | The site's public content API plus each scheme page. |
| `pl_ncbr` | Narodowe Centrum Badań i Rozwoju (NCBR) | CC BY-SA 4.0 (gov.pl text content) | Public JSON search endpoint of gov.pl plus the call pages. |
| `pl_nfosigw` | Narodowy Fundusz Ochrony Środowiska i Gospodarki Wodnej (NFOŚiGW) | CC BY-SA 4.0 (gov.pl text content) | Schedule table on gov.pl plus the linked call pages. |
| `pl_regional` | Marshal Offices of the Małopolskie, Dolnośląskie, Pomorskie, Opolskie and Wielkopolskie voivodeships | Public call notices | Lists filtered to running and upcoming calls plus the call pages; non-competitive calls are left out. |
| `fi_haeavustuksia` | Valtiokonttori (State Treasury of Finland) | Public government grant call notices | Public JSON API of the portal (list plus two detail endpoints per call). |
| `fi_aka` | Research Council of Finland (Suomen Akatemia) | Public call information | English list page plus the call pages. |
| `fi_skr` | Suomen Kulttuurirahasto (Finnish Cultural Foundation) | Public grant information | Public WordPress REST API (grant type, Finnish set). |
| `us_california` | California State Library, California Grants Portal | Public domain (open data, data.ca.gov) | CSV download of the open data resource. |
| `se_formas` | Formas, Forskningsrådet för hållbar utveckling | Public call information | Sitemap plus call pages (the list API is disallowed by robots.txt). |
| `se_energimyndigheten` | Energimyndigheten (Statens energimyndighet) | Public call information | List page plus call pages. |
| `se_kulturradet` | Statens kulturråd (Kulturrådet) | Public grant information | Overview with its load-more fragment request plus scheme pages. |
| `se_forte` | Forte, Forskningsrådet för hälsa, arbetsliv och välfärd | Public call information | JSON route of the calls web app plus call pages. |
| `dk_novo_nordisk` | Novo Nordisk Fonden | Public grant information | The site's content endpoint (allowed by robots.txt) plus grant pages. |
| `dk_carlsberg` | Carlsbergfondet | Public call information | Applicant page (English) plus instrument pages. |
| `no_kulturdirektoratet` | Kulturdirektoratet | Public grant scheme information | List page plus scheme pages, one request every 6 seconds (the site rate limits). |
| `no_regionale_forskningsfond` | Regionale forskningsfond (the county councils, with Forskningsrådet) | Public call information | The funds' search API, one fund per page, plus call pages for current calls. |
| `it_piemonte` | Regione Piemonte | Public call information | List filtered by status plus one detail page per call. |
| `it_lazio` | Regione Lazio (Lazio Europa portal) | Public call information | HTML archive for the status, WordPress REST for terms, call page for text and documents. |
| `it_toscana` | Regione Toscana | Public call information | Open calls list plus one detail page per kept call; jobs, registers and result lists are filtered out. |
| `it_con_il_sud` | Fondazione Con il Sud | Public call information | HTML archive of open calls, WordPress REST for terms, call pages. |
| `be_kbs` | King Baudouin Foundation (KBS-FRB) | Public call information | Site search JSON API (open calls) plus the call pages, one record per call across languages. |
| `be_fnrs` | Fonds de la Recherche Scientifique - FNRS | Public funding information | List filtered on status plus one detail page per instrument, one request every 10 seconds as robots.txt asks. |
| `be_hub_brussels` | hub.brussels (Brussels Agency for Business Support) | Public subsidy directory | Scheme URLs from the sitemap, one scheme page every 10 seconds as robots.txt asks. |
| `sk_itms21` | Ministry of Investments, Regional Development and Informatization of the Slovak Republic (ITMS21+) | Open data API | Public open data JSON API, list plus detail per open call; national projects and technical assistance are left out. |
| `sk_fpu` | Fond na podporu umenia (Slovak Arts Council) | Public call information | Calls table plus subprogramme pages, WordPress REST for the call text. |
| `hr_ekohezija` | Ministarstvo regionalnoga razvoja i fondova Europske unije (eKohezija) | Public call data | Public JSON API behind the official calls page, list plus detail for documents. |
| `hr_ruralnirazvoj` | Ministarstvo poljoprivrede, šumarstva i ribarstva (ruralnirazvoj.hr) | Public call information | Calls list plus the page of each call that is not closed. |
| `lv_esfondi` | Finanšu ministrija (esfondi.lv) | Public information on EU fund project selections | Public JSON API of the site. |
| `cy_funding_portal` | Directorate General Growth, Ministry of Finance, Republic of Cyprus | Public call information | WordPress REST list, then one call page every 20 seconds as robots.txt asks. |
| `eu_eea_grants` | Financial Mechanism Office (EEA and Norway Grants) | Public call information | Calls list plus the page of each open call. |
