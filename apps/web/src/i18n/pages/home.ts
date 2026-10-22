// Strings of the home page that are not in the shared dictionary: who the ledger is for, assistants, questions.
// {sources} is replaced by the page with the number of official sources.
type Audience = "business" | "artists" | "research" | "nonprofit" | "individuals" | "public";

export type Content = {
  meta_title: string;
  meta_description: string;
  who_kicker: string;
  who_title: string;
  who_lead: string;
  who: Record<Audience, { title: string; text: string }>;
  ai_kicker: string;
  ai_title: string;
  ai_text: string;
  ai_cta: string;
  faq_title: string;
  faq: { q: string; a: string }[];
};

const en: Content = {
  meta_title: "Grants for startups, artists, researchers and non-profits",
  meta_description: "Search open grants, loans and public funding from official sources across Europe. For startups, SMEs, artists, researchers and non-profits. Free to browse.",
  who_kicker: "Who it is for",
  who_title: "Not only for startups.",
  who_lead: "Public funding is a jungle of portals, deadlines and jargon. The ledger puts {sources} official sources behind one search, whoever applies. No intermediary, no success fee.",
  who: {
    business: { title: "Startups and SMEs", text: "Innovation grants, loans, guarantees and tax credits, from EU programmes to national agencies." },
    artists: { title: "Artists and creatives", text: "Creative Europe, arts councils and music funds such as Statens Kunstfond and PRS Foundation." },
    research: { title: "Researchers and labs", text: "Horizon Europe and national research funders such as DFG, FWF, FCT and Research Ireland." },
    nonprofit: { title: "Non-profits and community groups", text: "EU programmes such as LIFE and CERV, national schemes and community foundations." },
    individuals: { title: "Freelancers and individuals", text: "Calls that accept a person, not only a legal entity: fellowships, prizes and local grants." },
    public: { title: "Public bodies", text: "Cohesion and structural funds, and national schemes for municipalities and agencies." },
  },
  ai_kicker: "Assistants · Pro",
  ai_title: "Past the jargon, with ChatGPT or Claude.",
  ai_text: "Connect the ledger to your assistant through MCP. It searches the same official calls, reads your screening and explains in plain words what a call requires, which document proves each condition and what to apply to first. You apply yourself, with the funder.",
  ai_cta: "Connect an assistant",
  faq_title: "Common questions",
  faq: [
    { q: "Who is grantledger for?", a: "Anyone looking for public funding: startups, SMEs, artists, freelancers, researchers, non-profits and public bodies. Every call states who may apply, and the search filters by beneficiary." },
    { q: "Is grantledger free?", a: "Searching the ledger and reading every call is free. Pro is one payment, not a subscription: it screens your profile against every open call, emails you new matches each Monday and connects the ledger to ChatGPT or Claude." },
    { q: "Do I need a consultant to apply for a grant?", a: "Nobody stands between you and the funder. Every record links to the official call text and you apply there, for free. grantledger takes no commission on the funding you obtain." },
    { q: "How does it work with ChatGPT or Claude?", a: "grantledger is an MCP server. A Pro account adds one address as a connector; the assistant then searches the ledger, reads your screening result and explains the conditions of a call. Verdicts come from fixed rules, never from the assistant." },
    { q: "Where does the data come from?", a: "From {sources} official sources: EU portals, national agencies, research councils, arts funds and local funders. The ledger is refreshed every night and every record links to its publisher." },
  ],
};

const fr: Content = {
  meta_title: "Subventions pour startups, artistes, chercheurs et associations",
  meta_description: "Cherchez les subventions, prêts et aides publiques ouverts, issus de sources officielles en Europe. Pour startups, PME, artistes, chercheurs et associations. Consultation gratuite.",
  who_kicker: "Pour qui",
  who_title: "Pas seulement pour les startups.",
  who_lead: "Les aides publiques sont une jungle de portails, d'échéances et de jargon. Le registre réunit {sources} sources officielles derrière une seule recherche, quel que soit le candidat. Sans intermédiaire, sans commission au succès.",
  who: {
    business: { title: "Startups et PME", text: "Subventions à l'innovation, prêts, garanties et crédits d'impôt, des programmes européens aux agences nationales." },
    artists: { title: "Artistes et créateurs", text: "Europe créative, conseils des arts et fonds pour la musique comme Statens Kunstfond et PRS Foundation." },
    research: { title: "Chercheurs et laboratoires", text: "Horizon Europe et les financeurs nationaux de la recherche comme DFG, FWF, FCT et Research Ireland." },
    nonprofit: { title: "Associations et collectifs", text: "Programmes européens comme LIFE et CERV, dispositifs nationaux et fondations locales." },
    individuals: { title: "Indépendants et particuliers", text: "Des appels ouverts à une personne, pas seulement à une structure : bourses, prix et aides locales." },
    public: { title: "Organismes publics", text: "Fonds de cohésion et fonds structurels, dispositifs nationaux pour les communes et les agences." },
  },
  ai_kicker: "Assistants · Pro",
  ai_title: "Passer la barrière du jargon, avec ChatGPT ou Claude.",
  ai_text: "Connectez le registre à votre assistant via MCP. Il cherche dans les mêmes appels officiels, lit votre analyse et explique en mots simples ce qu'un appel exige, quel document prouve chaque condition et où candidater en premier. Vous candidatez vous-même, auprès du financeur.",
  ai_cta: "Connecter un assistant",
  faq_title: "Questions fréquentes",
  faq: [
    { q: "À qui s'adresse grantledger ?", a: "À toute personne ou structure qui cherche un financement public : startups, PME, artistes, indépendants, chercheurs, associations et organismes publics. Chaque appel indique qui peut candidater, et la recherche filtre par bénéficiaire." },
    { q: "grantledger est-il gratuit ?", a: "La recherche dans le registre et la lecture de chaque appel sont gratuites. Pro est un paiement unique, sans abonnement : il compare votre profil à chaque appel ouvert, vous envoie chaque lundi les nouveaux appels qui correspondent et connecte le registre à ChatGPT ou Claude." },
    { q: "Faut-il un consultant pour demander une subvention ?", a: "Personne ne se place entre vous et le financeur. Chaque fiche renvoie au texte officiel de l'appel et vous candidatez là-bas, gratuitement. grantledger ne prend aucune commission sur les financements obtenus." },
    { q: "Comment cela fonctionne-t-il avec ChatGPT ou Claude ?", a: "grantledger est un serveur MCP. Un compte Pro ajoute une adresse comme connecteur ; l'assistant cherche alors dans le registre, lit le résultat de votre analyse et explique les conditions d'un appel. Les verdicts viennent de règles fixes, jamais de l'assistant." },
    { q: "D'où viennent les données ?", a: "De {sources} sources officielles : portails européens, agences nationales, conseils de recherche, fonds pour les arts et financeurs locaux. Le registre est mis à jour chaque nuit et chaque fiche renvoie à son éditeur." },
  ],
};

const de: Content = {
  meta_title: "Fördermittel für Start-ups, Kunst, Forschung und Vereine",
  meta_description: "Offene Zuschüsse, Darlehen und öffentliche Fördermittel aus amtlichen Quellen in Europa durchsuchen. Für Start-ups, KMU, Kunstschaffende, Forschende und Vereine. Kostenlos.",
  who_kicker: "Für wen",
  who_title: "Nicht nur für Start-ups.",
  who_lead: "Öffentliche Förderung ist ein Dschungel aus Portalen, Fristen und Fachsprache. Das Register bündelt {sources} amtliche Quellen in einer Suche, egal wer den Antrag stellt. Ohne Vermittler, ohne Erfolgshonorar.",
  who: {
    business: { title: "Start-ups und KMU", text: "Innovationszuschüsse, Darlehen, Bürgschaften und Steuergutschriften, von EU-Programmen bis zu nationalen Agenturen." },
    artists: { title: "Kunst- und Kulturschaffende", text: "Kreatives Europa, Kunsträte und Musikfonds wie Statens Kunstfond und PRS Foundation." },
    research: { title: "Forschende und Labore", text: "Horizont Europa und nationale Forschungsförderer wie DFG, FWF, FCT und Research Ireland." },
    nonprofit: { title: "Vereine und Initiativen", text: "EU-Programme wie LIFE und CERV, nationale Programme und Bürgerstiftungen." },
    individuals: { title: "Selbstständige und Einzelpersonen", text: "Aufrufe, die eine Person zulassen und nicht nur eine juristische Person: Stipendien, Preise und lokale Zuschüsse." },
    public: { title: "Öffentliche Einrichtungen", text: "Kohäsions- und Strukturfonds sowie nationale Programme für Kommunen und Behörden." },
  },
  ai_kicker: "Assistenten · Pro",
  ai_title: "Durch die Fachsprache, mit ChatGPT oder Claude.",
  ai_text: "Verbinden Sie das Register über MCP mit Ihrem Assistenten. Er durchsucht dieselben amtlichen Aufrufe, liest Ihre Prüfung und erklärt in einfachen Worten, was ein Aufruf verlangt, welches Dokument jede Bedingung belegt und wo Sie zuerst einreichen sollten. Den Antrag stellen Sie selbst, beim Fördergeber.",
  ai_cta: "Assistenten verbinden",
  faq_title: "Häufige Fragen",
  faq: [
    { q: "Für wen ist grantledger?", a: "Für alle, die öffentliche Förderung suchen: Start-ups, KMU, Kunstschaffende, Selbstständige, Forschende, Vereine und öffentliche Einrichtungen. Jeder Aufruf nennt, wer antragsberechtigt ist, und die Suche filtert nach Begünstigten." },
    { q: "Ist grantledger kostenlos?", a: "Die Suche im Register und das Lesen jedes Aufrufs sind kostenlos. Pro ist eine einmalige Zahlung, kein Abonnement: Es prüft Ihr Profil gegen jeden offenen Aufruf, schickt Ihnen jeden Montag neue Treffer und verbindet das Register mit ChatGPT oder Claude." },
    { q: "Brauche ich einen Berater für einen Förderantrag?", a: "Niemand steht zwischen Ihnen und dem Fördergeber. Jeder Eintrag verlinkt auf den offiziellen Text des Aufrufs, und dort stellen Sie den Antrag, kostenlos. grantledger nimmt keine Provision auf erhaltene Fördermittel." },
    { q: "Wie funktioniert es mit ChatGPT oder Claude?", a: "grantledger ist ein MCP-Server. Ein Pro-Konto fügt eine Adresse als Konnektor hinzu; der Assistent durchsucht dann das Register, liest Ihr Prüfergebnis und erklärt die Bedingungen eines Aufrufs. Die Ergebnisse stammen aus festen Regeln, nie vom Assistenten." },
    { q: "Woher stammen die Daten?", a: "Aus {sources} amtlichen Quellen: EU-Portale, nationale Agenturen, Forschungsräte, Kunstfonds und lokale Förderer. Das Register wird jede Nacht aktualisiert, und jeder Eintrag verlinkt auf seinen Herausgeber." },
  ],
};

const es: Content = {
  meta_title: "Subvenciones para startups, artistas, investigadores y ONG",
  meta_description: "Busque subvenciones, préstamos y financiación pública abiertos, de fuentes oficiales en Europa. Para startups, pymes, artistas, investigadores y ONG. Consulta gratuita.",
  who_kicker: "Para quién",
  who_title: "No solo para startups.",
  who_lead: "La financiación pública es una jungla de portales, plazos y jerga. El registro reúne {sources} fuentes oficiales en una sola búsqueda, sea quien sea el solicitante. Sin intermediarios, sin comisión de éxito.",
  who: {
    business: { title: "Startups y pymes", text: "Ayudas a la innovación, préstamos, garantías y créditos fiscales, desde programas europeos hasta agencias nacionales." },
    artists: { title: "Artistas y creadores", text: "Europa Creativa, consejos de las artes y fondos musicales como Statens Kunstfond y PRS Foundation." },
    research: { title: "Investigadores y laboratorios", text: "Horizonte Europa y financiadores nacionales de la investigación como DFG, FWF, FCT y Research Ireland." },
    nonprofit: { title: "Asociaciones y colectivos", text: "Programas europeos como LIFE y CERV, líneas nacionales y fundaciones locales." },
    individuals: { title: "Autónomos y particulares", text: "Convocatorias abiertas a una persona, no solo a una entidad: becas, premios y ayudas locales." },
    public: { title: "Organismos públicos", text: "Fondos de cohesión y estructurales, y líneas nacionales para ayuntamientos y agencias." },
  },
  ai_kicker: "Asistentes · Pro",
  ai_title: "Más allá de la jerga, con ChatGPT o Claude.",
  ai_text: "Conecte el registro a su asistente mediante MCP. Busca en las mismas convocatorias oficiales, lee su análisis y explica con palabras sencillas qué exige una convocatoria, qué documento acredita cada condición y a cuál presentarse primero. Usted presenta la solicitud, ante el financiador.",
  ai_cta: "Conectar un asistente",
  faq_title: "Preguntas frecuentes",
  faq: [
    { q: "¿Para quién es grantledger?", a: "Para cualquiera que busque financiación pública: startups, pymes, artistas, autónomos, investigadores, asociaciones y organismos públicos. Cada convocatoria indica quién puede solicitarla, y la búsqueda filtra por beneficiario." },
    { q: "¿Es gratis grantledger?", a: "Buscar en el registro y leer cada convocatoria es gratis. Pro es un pago único, sin suscripción: contrasta su perfil con cada convocatoria abierta, le envía las nuevas coincidencias cada lunes y conecta el registro con ChatGPT o Claude." },
    { q: "¿Necesito un consultor para pedir una subvención?", a: "Nadie se interpone entre usted y el financiador. Cada ficha enlaza al texto oficial de la convocatoria y usted presenta la solicitud allí, gratis. grantledger no cobra comisión sobre la financiación obtenida." },
    { q: "¿Cómo funciona con ChatGPT o Claude?", a: "grantledger es un servidor MCP. Una cuenta Pro añade una dirección como conector; el asistente busca entonces en el registro, lee el resultado de su análisis y explica las condiciones de una convocatoria. Los veredictos proceden de reglas fijas, nunca del asistente." },
    { q: "¿De dónde vienen los datos?", a: "De {sources} fuentes oficiales: portales europeos, agencias nacionales, consejos de investigación, fondos para las artes y financiadores locales. El registro se actualiza cada noche y cada ficha enlaza a su publicador." },
  ],
};

const it: Content = {
  meta_title: "Bandi per startup, artisti, ricercatori e non profit",
  meta_description: "Cercate bandi, prestiti e finanziamenti pubblici aperti, da fonti ufficiali in Europa. Per startup, PMI, artisti, ricercatori ed enti non profit. Consultazione gratuita.",
  who_kicker: "Per chi",
  who_title: "Non solo per le startup.",
  who_lead: "I finanziamenti pubblici sono una giungla di portali, scadenze e gergo. Il registro riunisce {sources} fonti ufficiali in un'unica ricerca, chiunque presenti la domanda. Nessun intermediario, nessuna commissione sul risultato.",
  who: {
    business: { title: "Startup e PMI", text: "Contributi all'innovazione, prestiti, garanzie e crediti d'imposta, dai programmi europei alle agenzie nazionali." },
    artists: { title: "Artisti e creativi", text: "Europa Creativa, consigli per le arti e fondi per la musica come Statens Kunstfond e PRS Foundation." },
    research: { title: "Ricercatori e laboratori", text: "Horizon Europe e i finanziatori nazionali della ricerca come DFG, FWF, FCT e Research Ireland." },
    nonprofit: { title: "Associazioni e gruppi locali", text: "Programmi europei come LIFE e CERV, misure nazionali e fondazioni di comunità." },
    individuals: { title: "Liberi professionisti e privati", text: "Bandi aperti a una persona, non solo a un ente: borse, premi e contributi locali." },
    public: { title: "Enti pubblici", text: "Fondi di coesione e strutturali, e misure nazionali per comuni e agenzie." },
  },
  ai_kicker: "Assistenti · Pro",
  ai_title: "Oltre il gergo, con ChatGPT o Claude.",
  ai_text: "Collegate il registro al vostro assistente tramite MCP. Cerca negli stessi bandi ufficiali, legge la vostra analisi e spiega con parole semplici che cosa richiede un bando, quale documento dimostra ogni condizione e a quale candidarsi per primo. La domanda la presentate voi, presso il finanziatore.",
  ai_cta: "Collegare un assistente",
  faq_title: "Domande frequenti",
  faq: [
    { q: "A chi si rivolge grantledger?", a: "A chiunque cerchi finanziamenti pubblici: startup, PMI, artisti, liberi professionisti, ricercatori, associazioni ed enti pubblici. Ogni bando indica chi può candidarsi, e la ricerca filtra per beneficiario." },
    { q: "grantledger è gratuito?", a: "Cercare nel registro e leggere ogni bando è gratis. Pro è un pagamento unico, non un abbonamento: confronta il vostro profilo con ogni bando aperto, vi invia ogni lunedì i nuovi bandi compatibili e collega il registro a ChatGPT o Claude." },
    { q: "Serve un consulente per presentare domanda?", a: "Nessuno si mette tra voi e il finanziatore. Ogni scheda rimanda al testo ufficiale del bando e la domanda si presenta lì, gratis. grantledger non prende commissioni sui finanziamenti ottenuti." },
    { q: "Come funziona con ChatGPT o Claude?", a: "grantledger è un server MCP. Un account Pro aggiunge un indirizzo come connettore; l'assistente cerca poi nel registro, legge il risultato della vostra analisi e spiega le condizioni di un bando. I verdetti derivano da regole fisse, mai dall'assistente." },
    { q: "Da dove vengono i dati?", a: "Da {sources} fonti ufficiali: portali europei, agenzie nazionali, consigli di ricerca, fondi per le arti e finanziatori locali. Il registro si aggiorna ogni notte e ogni scheda rimanda al suo editore." },
  ],
};

const pt: Content = {
  meta_title: "Apoios para startups, artistas, investigadores e associações",
  meta_description: "Pesquise subvenções, empréstimos e apoios públicos abertos, de fontes oficiais na Europa. Para startups, PME, artistas, investigadores e associações. Consulta gratuita.",
  who_kicker: "Para quem",
  who_title: "Não é só para startups.",
  who_lead: "O financiamento público é uma selva de portais, prazos e jargão. O registo reúne {sources} fontes oficiais numa só pesquisa, seja quem for o candidato. Sem intermediários, sem comissão de sucesso.",
  who: {
    business: { title: "Startups e PME", text: "Apoios à inovação, empréstimos, garantias e créditos fiscais, dos programas europeus às agências nacionais." },
    artists: { title: "Artistas e criadores", text: "Europa Criativa, conselhos das artes e fundos para a música como o Statens Kunstfond e a PRS Foundation." },
    research: { title: "Investigadores e laboratórios", text: "Horizonte Europa e os financiadores nacionais de investigação como DFG, FWF, FCT e Research Ireland." },
    nonprofit: { title: "Associações e grupos locais", text: "Programas europeus como LIFE e CERV, medidas nacionais e fundações comunitárias." },
    individuals: { title: "Independentes e particulares", text: "Avisos abertos a uma pessoa, não apenas a uma entidade: bolsas, prémios e apoios locais." },
    public: { title: "Entidades públicas", text: "Fundos de coesão e estruturais, e medidas nacionais para municípios e agências." },
  },
  ai_kicker: "Assistentes · Pro",
  ai_title: "Para lá do jargão, com o ChatGPT ou o Claude.",
  ai_text: "Ligue o registo ao seu assistente através de MCP. Ele pesquisa nos mesmos avisos oficiais, lê a sua análise e explica por palavras simples o que um aviso exige, que documento comprova cada condição e a qual se candidatar primeiro. A candidatura é feita por si, junto do financiador.",
  ai_cta: "Ligar um assistente",
  faq_title: "Perguntas frequentes",
  faq: [
    { q: "Para quem é o grantledger?", a: "Para quem procura financiamento público: startups, PME, artistas, independentes, investigadores, associações e entidades públicas. Cada aviso indica quem se pode candidatar, e a pesquisa filtra por beneficiário." },
    { q: "O grantledger é gratuito?", a: "Pesquisar no registo e ler cada aviso é grátis. O Pro é um pagamento único, sem subscrição: confronta o seu perfil com cada aviso aberto, envia-lhe todas as segundas-feiras os novos avisos compatíveis e liga o registo ao ChatGPT ou ao Claude." },
    { q: "Preciso de um consultor para me candidatar a um apoio?", a: "Ninguém se coloca entre si e o financiador. Cada ficha remete para o texto oficial do aviso e a candidatura faz-se lá, gratuitamente. O grantledger não cobra comissão sobre o financiamento obtido." },
    { q: "Como funciona com o ChatGPT ou o Claude?", a: "O grantledger é um servidor MCP. Uma conta Pro adiciona um endereço como conector; o assistente pesquisa então no registo, lê o resultado da sua análise e explica as condições de um aviso. Os veredictos vêm de regras fixas, nunca do assistente." },
    { q: "De onde vêm os dados?", a: "De {sources} fontes oficiais: portais europeus, agências nacionais, conselhos de investigação, fundos para as artes e financiadores locais. O registo é atualizado todas as noites e cada ficha remete para a sua entidade publicadora." },
  ],
};

const nl: Content = {
  meta_title: "Subsidies voor start-ups, kunstenaars, onderzoekers en non-profits",
  meta_description: "Zoek open subsidies, leningen en publieke financiering uit officiële bronnen in Europa. Voor start-ups, mkb, kunstenaars, onderzoekers en non-profits. Gratis te doorzoeken.",
  who_kicker: "Voor wie",
  who_title: "Niet alleen voor start-ups.",
  who_lead: "Publieke financiering is een jungle van portalen, deadlines en jargon. Het register brengt {sources} officiële bronnen samen in één zoekopdracht, wie er ook aanvraagt. Geen tussenpersoon, geen succesfee.",
  who: {
    business: { title: "Start-ups en mkb", text: "Innovatiesubsidies, leningen, garanties en belastingkredieten, van EU-programma's tot nationale agentschappen." },
    artists: { title: "Kunstenaars en makers", text: "Creative Europe, kunstraden en muziekfondsen zoals Statens Kunstfond en PRS Foundation." },
    research: { title: "Onderzoekers en labs", text: "Horizon Europe en nationale onderzoeksfinanciers zoals DFG, FWF, FCT en Research Ireland." },
    nonprofit: { title: "Non-profits en buurtgroepen", text: "EU-programma's zoals LIFE en CERV, nationale regelingen en gemeenschapsfondsen." },
    individuals: { title: "Zzp'ers en particulieren", text: "Oproepen die een persoon toelaten, niet alleen een rechtspersoon: beurzen, prijzen en lokale subsidies." },
    public: { title: "Overheden", text: "Cohesie- en structuurfondsen en nationale regelingen voor gemeenten en agentschappen." },
  },
  ai_kicker: "Assistenten · Pro",
  ai_title: "Voorbij het jargon, met ChatGPT of Claude.",
  ai_text: "Koppel het register via MCP aan uw assistent. Die doorzoekt dezelfde officiële oproepen, leest uw toets en legt in gewone woorden uit wat een oproep vraagt, welk document elke voorwaarde aantoont en waar u het eerst kunt aanvragen. U vraagt zelf aan, bij de financier.",
  ai_cta: "Een assistent koppelen",
  faq_title: "Veelgestelde vragen",
  faq: [
    { q: "Voor wie is grantledger?", a: "Voor iedereen die publieke financiering zoekt: start-ups, mkb, kunstenaars, zzp'ers, onderzoekers, non-profits en overheden. Elke oproep vermeldt wie mag aanvragen, en de zoekfunctie filtert op begunstigde." },
    { q: "Is grantledger gratis?", a: "Zoeken in het register en elke oproep lezen is gratis. Pro is één betaling, geen abonnement: het toetst uw profiel aan elke open oproep, mailt u elke maandag nieuwe treffers en koppelt het register aan ChatGPT of Claude." },
    { q: "Heb ik een adviseur nodig om subsidie aan te vragen?", a: "Niemand staat tussen u en de financier. Elk record linkt naar de officiële tekst van de oproep en daar vraagt u aan, gratis. grantledger neemt geen commissie op de verkregen financiering." },
    { q: "Hoe werkt het met ChatGPT of Claude?", a: "grantledger is een MCP-server. Een Pro-account voegt één adres toe als connector; de assistent doorzoekt dan het register, leest uw toetsresultaat en legt de voorwaarden van een oproep uit. Oordelen komen uit vaste regels, nooit van de assistent." },
    { q: "Waar komen de gegevens vandaan?", a: "Uit {sources} officiële bronnen: EU-portalen, nationale agentschappen, onderzoeksraden, kunstfondsen en lokale financiers. Het register wordt elke nacht ververst en elk record linkt naar de uitgever." },
  ],
};

const pl: Content = {
  meta_title: "Dotacje dla startupów, artystów, naukowców i organizacji",
  meta_description: "Szukaj otwartych dotacji, pożyczek i finansowania publicznego z oficjalnych źródeł w Europie. Dla startupów, MŚP, artystów, naukowców i organizacji. Bezpłatne przeglądanie.",
  who_kicker: "Dla kogo",
  who_title: "Nie tylko dla startupów.",
  who_lead: "Finansowanie publiczne to dżungla portali, terminów i żargonu. Rejestr łączy {sources} oficjalnych źródeł w jednej wyszukiwarce, niezależnie od tego, kto składa wniosek. Bez pośredników, bez prowizji od sukcesu.",
  who: {
    business: { title: "Startupy i MŚP", text: "Dotacje na innowacje, pożyczki, gwarancje i ulgi podatkowe, od programów unijnych po agencje krajowe." },
    artists: { title: "Artyści i twórcy", text: "Kreatywna Europa, rady sztuki i fundusze muzyczne, takie jak Statens Kunstfond i PRS Foundation." },
    research: { title: "Naukowcy i laboratoria", text: "Horyzont Europa i krajowe instytucje finansujące badania, takie jak DFG, FWF, FCT i Research Ireland." },
    nonprofit: { title: "Organizacje pozarządowe i grupy lokalne", text: "Programy unijne, takie jak LIFE i CERV, programy krajowe i fundacje lokalne." },
    individuals: { title: "Freelancerzy i osoby fizyczne", text: "Nabory otwarte dla osoby, nie tylko dla podmiotu prawnego: stypendia, nagrody i lokalne dotacje." },
    public: { title: "Instytucje publiczne", text: "Fundusze spójności i strukturalne oraz programy krajowe dla gmin i agencji." },
  },
  ai_kicker: "Asystenci · Pro",
  ai_title: "Przez żargon, z ChatGPT lub Claude.",
  ai_text: "Połącz rejestr ze swoim asystentem przez MCP. Przeszukuje te same oficjalne nabory, czyta Twoje sprawdzenie i wyjaśnia prostymi słowami, czego wymaga nabór, jaki dokument potwierdza każdy warunek i gdzie złożyć wniosek najpierw. Wniosek składasz samodzielnie, u grantodawcy.",
  ai_cta: "Połącz asystenta",
  faq_title: "Częste pytania",
  faq: [
    { q: "Dla kogo jest grantledger?", a: "Dla każdego, kto szuka finansowania publicznego: startupów, MŚP, artystów, freelancerów, naukowców, organizacji pozarządowych i instytucji publicznych. Każdy nabór wskazuje, kto może się ubiegać, a wyszukiwarka filtruje według beneficjenta." },
    { q: "Czy grantledger jest bezpłatny?", a: "Wyszukiwanie w rejestrze i czytanie każdego naboru jest bezpłatne. Pro to jedna płatność, nie subskrypcja: sprawdza Twój profil względem każdego otwartego naboru, w każdy poniedziałek wysyła nowe pasujące nabory i łączy rejestr z ChatGPT lub Claude." },
    { q: "Czy potrzebuję doradcy, żeby złożyć wniosek o dotację?", a: "Nikt nie stoi między Tobą a grantodawcą. Każdy wpis prowadzi do oficjalnego tekstu naboru i tam składasz wniosek, bezpłatnie. grantledger nie pobiera prowizji od uzyskanego finansowania." },
    { q: "Jak to działa z ChatGPT lub Claude?", a: "grantledger to serwer MCP. Konto Pro dodaje jeden adres jako konektor; asystent przeszukuje wtedy rejestr, czyta wynik Twojego sprawdzenia i wyjaśnia warunki naboru. Werdykty pochodzą ze stałych reguł, nigdy od asystenta." },
    { q: "Skąd pochodzą dane?", a: "Z {sources} oficjalnych źródeł: portali unijnych, agencji krajowych, rad naukowych, funduszy sztuki i lokalnych grantodawców. Rejestr jest odświeżany każdej nocy, a każdy wpis prowadzi do wydawcy." },
  ],
};

export const home: Record<string, Content> = { en, fr, de, es, it, pt, nl, pl };
