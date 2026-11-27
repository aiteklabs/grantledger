// Legal notice page content, one entry per locale. English is the source of truth.
// A Linked field wraps one anchor whose label is translated. The page keeps the HTML structure
// and the link targets; fixed labels (domain names, email address) stay in the page.
type Linked = { before: string; link: string; after: string };

export type LegalNoticeContent = {
  metaTitle: string;
  metaDescription: string;
  kicker: string;
  title: string;
  operatorTitle: string;
  operatorBody: string;
  websiteLabel: string;
  contactLabel: string;
  hostingTitle: string;
  hostingBody: string;
  independenceTitle: string;
  independenceBody: string;
  warrantyTitle: string;
  warrantyBody: string;
  licensesTitle: string;
  licenseCode: string;
  licenseData: string;
  licenseSource: Linked;
  trademarksTitle: string;
  trademarksBody: string;
  reportingTitle: string;
  reportingBefore: string;
  reportingOr: string;
  reportingIssue: string;
};

const en: LegalNoticeContent = {
  metaTitle: "Legal notice",
  metaDescription: "Who operates grantledger.eu, on what terms, and under which licenses.",
  kicker: "Legal notice",
  title: "Legal notice",
  operatorTitle: "Operator",
  operatorBody: "grantledger.eu is operated by Aitek Labs, a software studio in Europe.",
  websiteLabel: "Website:",
  contactLabel: "Contact:",
  hostingTitle: "Hosting",
  hostingBody: "Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA, serving from its European network.",
  independenceTitle: "Independence",
  independenceBody: "grantledger is an independent, open source tool. Listing a call here does not mean the European Union, a state, a region or a funding agency has reviewed, approved or endorsed grantledger, and grantledger is not affiliated with any of them. Screening verdicts are outputs of published rules. Eligibility is decided only by the funding authority, on the official call text.",
  warrantyTitle: "No warranty",
  warrantyBody: "The ledger is provided as is. Records are collected automatically from official publishers and can be late, incomplete or wrong. Deadlines, amounts and conditions must be verified on the publisher's page linked from every record before any decision. Aitek Labs is not liable for decisions taken on the basis of the ledger, to the extent the law allows.",
  licensesTitle: "Licenses",
  licenseCode: "Source code: MIT, at",
  licenseData: "Normalised data produced by grantledger: CC0 1.0.",
  licenseSource: {
    before: "Source material: each record keeps the license of its publisher, listed on the",
    link: "methodology",
    after: " page. Reuse of a publisher's text is governed by that license.",
  },
  trademarksTitle: "Trademarks",
  trademarksBody: "Names of funders, programmes and portals belong to their owners and are used only to identify the source of a record.",
  reportingTitle: "Reporting",
  reportingBefore: "To report a wrong record, a removal request or a license concern, write to",
  reportingOr: "or",
  reportingIssue: "open an issue",
};

const fr: LegalNoticeContent = {
  metaTitle: "Mentions légales",
  metaDescription: "Qui exploite grantledger.eu, à quelles conditions et sous quelles licences.",
  kicker: "Mentions légales",
  title: "Mentions légales",
  operatorTitle: "Exploitant",
  operatorBody: "grantledger.eu est exploité par Aitek Labs, un studio logiciel établi en Europe.",
  websiteLabel: "Site web :",
  contactLabel: "Contact :",
  hostingTitle: "Hébergement",
  hostingBody: "Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis, servant depuis son réseau européen.",
  independenceTitle: "Indépendance",
  independenceBody: "grantledger est un outil indépendant et open source. La présence d'un appel ici ne signifie pas que l'Union européenne, un État, une région ou une agence de financement a examiné, approuvé ou soutenu grantledger, et grantledger n'est affilié à aucun d'eux. Les verdicts d'analyse sont le résultat de règles publiées. L'éligibilité est décidée uniquement par l'autorité de financement, sur la base du texte officiel de l'appel.",
  warrantyTitle: "Absence de garantie",
  warrantyBody: "Le registre est fourni en l'état. Les fiches sont collectées automatiquement auprès des éditeurs officiels et peuvent être en retard, incomplètes ou erronées. Les échéances, montants et conditions doivent être vérifiés sur la page de l'éditeur, liée depuis chaque fiche, avant toute décision. Aitek Labs n'est pas responsable des décisions prises sur la base du registre, dans la mesure permise par la loi.",
  licensesTitle: "Licences",
  licenseCode: "Code source : MIT, sur",
  licenseData: "Données normalisées produites par grantledger : CC0 1.0.",
  licenseSource: {
    before: "Sources : chaque fiche conserve la licence de son éditeur, indiquée sur la page",
    link: "méthode",
    after: ". La réutilisation du texte d'un éditeur est régie par cette licence.",
  },
  trademarksTitle: "Marques",
  trademarksBody: "Les noms des financeurs, programmes et portails appartiennent à leurs propriétaires et sont utilisés uniquement pour identifier la source d'une fiche.",
  reportingTitle: "Signalement",
  reportingBefore: "Pour signaler une fiche erronée, demander un retrait ou soulever une question de licence, écrivez à",
  reportingOr: "ou",
  reportingIssue: "ouvrez un ticket",
};

const de: LegalNoticeContent = {
  metaTitle: "Impressum",
  metaDescription: "Wer grantledger.eu betreibt, zu welchen Bedingungen und unter welchen Lizenzen.",
  kicker: "Impressum",
  title: "Impressum",
  operatorTitle: "Betreiber",
  operatorBody: "grantledger.eu wird von Aitek Labs betrieben, einem Softwarestudio in Europa.",
  websiteLabel: "Website:",
  contactLabel: "Kontakt:",
  hostingTitle: "Hosting",
  hostingBody: "Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA, ausgeliefert über ihr europäisches Netz.",
  independenceTitle: "Unabhängigkeit",
  independenceBody: "grantledger ist ein unabhängiges Open-Source-Werkzeug. Die Aufnahme einer Ausschreibung bedeutet nicht, dass die Europäische Union, ein Staat, eine Region oder eine Förderagentur grantledger geprüft, genehmigt oder unterstützt hat, und grantledger ist mit keiner dieser Stellen verbunden. Prüfergebnisse sind Ausgaben veröffentlichter Regeln. Über die Förderfähigkeit entscheidet allein die Förderstelle auf Grundlage des amtlichen Ausschreibungstextes.",
  warrantyTitle: "Keine Gewähr",
  warrantyBody: "Das Register wird ohne Gewähr bereitgestellt. Datensätze werden automatisch von amtlichen Herausgebern erfasst und können verspätet, unvollständig oder fehlerhaft sein. Fristen, Beträge und Bedingungen müssen vor jeder Entscheidung auf der Seite des Herausgebers geprüft werden, die von jedem Datensatz aus verlinkt ist. Aitek Labs haftet nicht für Entscheidungen, die auf Grundlage des Registers getroffen werden, soweit das Gesetz dies zulässt.",
  licensesTitle: "Lizenzen",
  licenseCode: "Quellcode: MIT, unter",
  licenseData: "Von grantledger erzeugte normalisierte Daten: CC0 1.0.",
  licenseSource: {
    before: "Quellmaterial: Jeder Datensatz behält die Lizenz seines Herausgebers, aufgeführt auf der Seite",
    link: "Methode",
    after: ". Die Weiterverwendung des Textes eines Herausgebers unterliegt dieser Lizenz.",
  },
  trademarksTitle: "Marken",
  trademarksBody: "Namen von Fördergebern, Programmen und Portalen gehören ihren Inhabern und werden nur verwendet, um die Quelle eines Datensatzes zu kennzeichnen.",
  reportingTitle: "Meldungen",
  reportingBefore: "Um einen fehlerhaften Datensatz zu melden, eine Entfernung zu beantragen oder ein Lizenzanliegen vorzubringen, schreiben Sie an",
  reportingOr: "oder",
  reportingIssue: "eröffnen Sie ein Issue",
};

const es: LegalNoticeContent = {
  metaTitle: "Aviso legal",
  metaDescription: "Quién opera grantledger.eu, en qué condiciones y bajo qué licencias.",
  kicker: "Aviso legal",
  title: "Aviso legal",
  operatorTitle: "Operador",
  operatorBody: "grantledger.eu está operado por Aitek Labs, un estudio de software en Europa.",
  websiteLabel: "Sitio web:",
  contactLabel: "Contacto:",
  hostingTitle: "Alojamiento",
  hostingBody: "Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, EE. UU., sirviendo desde su red europea.",
  independenceTitle: "Independencia",
  independenceBody: "grantledger es una herramienta independiente y de código abierto. Que una convocatoria figure aquí no significa que la Unión Europea, un Estado, una región o una agencia de financiación haya revisado, aprobado o respaldado grantledger, y grantledger no está afiliado a ninguno de ellos. Los veredictos de análisis son el resultado de reglas publicadas. La elegibilidad la decide únicamente la autoridad de financiación, sobre el texto oficial de la convocatoria.",
  warrantyTitle: "Sin garantía",
  warrantyBody: "El registro se ofrece tal cual. Las fichas se recopilan automáticamente de los editores oficiales y pueden llegar tarde, estar incompletas o ser erróneas. Los plazos, importes y condiciones deben verificarse en la página del editor, enlazada desde cada ficha, antes de tomar cualquier decisión. Aitek Labs no es responsable de las decisiones tomadas sobre la base del registro, en la medida en que la ley lo permita.",
  licensesTitle: "Licencias",
  licenseCode: "Código fuente: MIT, en",
  licenseData: "Datos normalizados producidos por grantledger: CC0 1.0.",
  licenseSource: {
    before: "Material de origen: cada ficha conserva la licencia de su editor, indicada en la página de",
    link: "metodología",
    after: ". La reutilización del texto de un editor se rige por esa licencia.",
  },
  trademarksTitle: "Marcas",
  trademarksBody: "Los nombres de financiadores, programas y portales pertenecen a sus titulares y se usan únicamente para identificar la fuente de una ficha.",
  reportingTitle: "Notificaciones",
  reportingBefore: "Para notificar una ficha errónea, una solicitud de retirada o una cuestión de licencia, escriba a",
  reportingOr: "o",
  reportingIssue: "abra una incidencia",
};

const it: LegalNoticeContent = {
  metaTitle: "Note legali",
  metaDescription: "Chi gestisce grantledger.eu, a quali condizioni e con quali licenze.",
  kicker: "Note legali",
  title: "Note legali",
  operatorTitle: "Gestore",
  operatorBody: "grantledger.eu è gestito da Aitek Labs, uno studio di software in Europa.",
  websiteLabel: "Sito web:",
  contactLabel: "Contatto:",
  hostingTitle: "Hosting",
  hostingBody: "Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA, con erogazione dalla sua rete europea.",
  independenceTitle: "Indipendenza",
  independenceBody: "grantledger è uno strumento indipendente e open source. La presenza di un bando qui non significa che l'Unione europea, uno Stato, una regione o un'agenzia di finanziamento abbia esaminato, approvato o sostenuto grantledger, e grantledger non è affiliato a nessuno di essi. Gli esiti della verifica sono il risultato di regole pubblicate. L'ammissibilità è decisa solo dall'autorità di finanziamento, sulla base del testo ufficiale del bando.",
  warrantyTitle: "Nessuna garanzia",
  warrantyBody: "Il registro è fornito così com'è. Le schede sono raccolte automaticamente dagli editori ufficiali e possono essere in ritardo, incomplete o errate. Scadenze, importi e condizioni devono essere verificati sulla pagina dell'editore, collegata da ogni scheda, prima di qualsiasi decisione. Aitek Labs non è responsabile delle decisioni prese sulla base del registro, nei limiti consentiti dalla legge.",
  licensesTitle: "Licenze",
  licenseCode: "Codice sorgente: MIT, su",
  licenseData: "Dati normalizzati prodotti da grantledger: CC0 1.0.",
  licenseSource: {
    before: "Materiale di origine: ogni scheda conserva la licenza del suo editore, indicata nella pagina",
    link: "metodologia",
    after: ". Il riutilizzo del testo di un editore è regolato da tale licenza.",
  },
  trademarksTitle: "Marchi",
  trademarksBody: "I nomi di finanziatori, programmi e portali appartengono ai rispettivi titolari e sono usati solo per identificare la fonte di una scheda.",
  reportingTitle: "Segnalazioni",
  reportingBefore: "Per segnalare una scheda errata, una richiesta di rimozione o una questione di licenza, scrivete a",
  reportingOr: "oppure",
  reportingIssue: "aprite una issue",
};

const pt: LegalNoticeContent = {
  metaTitle: "Aviso legal",
  metaDescription: "Quem opera o grantledger.eu, em que termos e sob que licenças.",
  kicker: "Aviso legal",
  title: "Aviso legal",
  operatorTitle: "Operador",
  operatorBody: "O grantledger.eu é operado pela Aitek Labs, um estúdio de software na Europa.",
  websiteLabel: "Site:",
  contactLabel: "Contacto:",
  hostingTitle: "Alojamento",
  hostingBody: "Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, EUA, a servir a partir da sua rede europeia.",
  independenceTitle: "Independência",
  independenceBody: "O grantledger é uma ferramenta independente e de código aberto. A presença de uma candidatura aqui não significa que a União Europeia, um Estado, uma região ou uma agência de financiamento tenha revisto, aprovado ou apoiado o grantledger, e o grantledger não está afiliado a nenhum deles. Os veredictos de análise são resultados de regras publicadas. A elegibilidade é decidida apenas pela autoridade de financiamento, com base no texto oficial da candidatura.",
  warrantyTitle: "Sem garantia",
  warrantyBody: "O registo é fornecido tal como está. Os registos são recolhidos automaticamente dos editores oficiais e podem estar atrasados, incompletos ou errados. Prazos, montantes e condições devem ser verificados na página do editor, ligada a partir de cada registo, antes de qualquer decisão. A Aitek Labs não é responsável por decisões tomadas com base no registo, na medida permitida pela lei.",
  licensesTitle: "Licenças",
  licenseCode: "Código-fonte: MIT, em",
  licenseData: "Dados normalizados produzidos pelo grantledger: CC0 1.0.",
  licenseSource: {
    before: "Material de origem: cada registo mantém a licença do seu editor, indicada na página de",
    link: "metodologia",
    after: ". A reutilização do texto de um editor rege-se por essa licença.",
  },
  trademarksTitle: "Marcas",
  trademarksBody: "Os nomes de financiadores, programas e portais pertencem aos seus titulares e são usados apenas para identificar a fonte de um registo.",
  reportingTitle: "Comunicações",
  reportingBefore: "Para comunicar um registo errado, um pedido de remoção ou uma questão de licença, escreva para",
  reportingOr: "ou",
  reportingIssue: "abra uma issue",
};

const nl: LegalNoticeContent = {
  metaTitle: "Juridische kennisgeving",
  metaDescription: "Wie grantledger.eu beheert, onder welke voorwaarden en onder welke licenties.",
  kicker: "Juridische kennisgeving",
  title: "Juridische kennisgeving",
  operatorTitle: "Beheerder",
  operatorBody: "grantledger.eu wordt beheerd door Aitek Labs, een softwarestudio in Europa.",
  websiteLabel: "Website:",
  contactLabel: "Contact:",
  hostingTitle: "Hosting",
  hostingBody: "Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, VS, geleverd vanaf zijn Europese netwerk.",
  independenceTitle: "Onafhankelijkheid",
  independenceBody: "grantledger is een onafhankelijk opensourcehulpmiddel. Dat een oproep hier vermeld staat, betekent niet dat de Europese Unie, een staat, een regio of een financieringsinstantie grantledger heeft beoordeeld, goedgekeurd of onderschreven, en grantledger is met geen van hen verbonden. Screeningoordelen zijn uitkomsten van gepubliceerde regels. Over de subsidiabiliteit beslist alleen de financieringsautoriteit, op basis van de officiële oproeptekst.",
  warrantyTitle: "Geen garantie",
  warrantyBody: "Het register wordt geleverd zoals het is. Records worden automatisch verzameld bij officiële uitgevers en kunnen te laat, onvolledig of onjuist zijn. Deadlines, bedragen en voorwaarden moeten vóór elke beslissing worden gecontroleerd op de pagina van de uitgever, waarnaar elk record verwijst. Aitek Labs is niet aansprakelijk voor beslissingen die op basis van het register worden genomen, voor zover de wet dat toelaat.",
  licensesTitle: "Licenties",
  licenseCode: "Broncode: MIT, op",
  licenseData: "Genormaliseerde gegevens geproduceerd door grantledger: CC0 1.0.",
  licenseSource: {
    before: "Bronmateriaal: elk record behoudt de licentie van zijn uitgever, vermeld op de pagina",
    link: "methode",
    after: ". Hergebruik van de tekst van een uitgever valt onder die licentie.",
  },
  trademarksTitle: "Handelsmerken",
  trademarksBody: "Namen van financiers, programma's en portalen behoren toe aan hun eigenaars en worden alleen gebruikt om de bron van een record aan te duiden.",
  reportingTitle: "Melden",
  reportingBefore: "Om een onjuist record, een verwijderingsverzoek of een licentiekwestie te melden, schrijf naar",
  reportingOr: "of",
  reportingIssue: "open een issue",
};

const pl: LegalNoticeContent = {
  metaTitle: "Nota prawna",
  metaDescription: "Kto prowadzi grantledger.eu, na jakich warunkach i na jakich licencjach.",
  kicker: "Nota prawna",
  title: "Nota prawna",
  operatorTitle: "Operator",
  operatorBody: "grantledger.eu jest prowadzony przez Aitek Labs, studio oprogramowania w Europie.",
  websiteLabel: "Strona internetowa:",
  contactLabel: "Kontakt:",
  hostingTitle: "Hosting",
  hostingBody: "Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA, serwujący ze swojej europejskiej sieci.",
  independenceTitle: "Niezależność",
  independenceBody: "grantledger jest niezależnym narzędziem open source. Umieszczenie naboru w rejestrze nie oznacza, że Unia Europejska, państwo, region lub agencja finansująca sprawdziła, zatwierdziła lub poparła grantledger, a grantledger nie jest powiązany z żadnym z tych podmiotów. Werdykty analizy są wynikiem opublikowanych reguł. O kwalifikowalności decyduje wyłącznie instytucja finansująca, na podstawie oficjalnego tekstu naboru.",
  warrantyTitle: "Brak gwarancji",
  warrantyBody: "Rejestr jest udostępniany w stanie takim, w jakim jest. Rekordy są zbierane automatycznie od oficjalnych wydawców i mogą być opóźnione, niekompletne lub błędne. Terminy, kwoty i warunki należy zweryfikować na stronie wydawcy, do której prowadzi link z każdego rekordu, przed podjęciem jakiejkolwiek decyzji. Aitek Labs nie ponosi odpowiedzialności za decyzje podjęte na podstawie rejestru, w zakresie dozwolonym przez prawo.",
  licensesTitle: "Licencje",
  licenseCode: "Kod źródłowy: MIT, pod adresem",
  licenseData: "Znormalizowane dane wytworzone przez grantledger: CC0 1.0.",
  licenseSource: {
    before: "Materiał źródłowy: każdy rekord zachowuje licencję swojego wydawcy, wymienioną na stronie",
    link: "metodologia",
    after: ". Ponowne wykorzystanie tekstu wydawcy podlega tej licencji.",
  },
  trademarksTitle: "Znaki towarowe",
  trademarksBody: "Nazwy instytucji finansujących, programów i portali należą do ich właścicieli i są używane wyłącznie do wskazania źródła rekordu.",
  reportingTitle: "Zgłoszenia",
  reportingBefore: "Aby zgłosić błędny rekord, żądanie usunięcia lub kwestię licencyjną, napisz na adres",
  reportingOr: "lub",
  reportingIssue: "otwórz zgłoszenie",
};

export const legalNotice: Record<string, LegalNoticeContent> = { en, fr, de, es, it, pt, nl, pl };
