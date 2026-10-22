// AI notice page content, one entry per locale. English is the source of truth.
// The page keeps the HTML structure; {model} is replaced with the current model name.
export type AiNoticeContent = {
  metaTitle: string;
  metaDescription: string;
  kicker: string;
  title: string;
  lead: string;
  whereTitle: string;
  prefillBold: string;
  prefillRest: string;
  enrichBold: string;
  enrichRest: string;
  noneTitle: string;
  noneItems: string[];
  wrongTitle: string;
  wrongBody: string;
  dataTitle: string;
  dataBody: string;
  providersTitle: string;
  providersBody: string;
};

const en: AiNoticeContent = {
  metaTitle: "AI notice",
  metaDescription: "Where grantledger uses a language model, where it does not, and what that means for you.",
  kicker: "Transparency",
  title: "AI notice",
  lead: "Short version: no model decides anything you see. Models fill forms and extract fields from official text. Every field they produce is stored, visible and correctable.",
  whereTitle: "Where a model is used",
  prefillBold: "Prefilling your company form",
  prefillRest: "from a website, a PDF or a paragraph, when you ask for it. You see and edit every field before screening. Model: {model}.",
  enrichBold: "Enriching records offline.",
  enrichRest: "When a funder publishes eligibility only as prose, the model extracts beneficiary types, sectors, regions, size and age limits and consortium requirement into a separate table, once per record. The matcher uses those fields only when the funder published none.",
  noneTitle: "Where no model is used",
  noneItems: [
    "Collecting and normalising the ledger: code only, from official APIs and open data.",
    "Search, filters, deadlines, history.",
    "Screening verdicts, scores, readiness gaps and negative memos: fixed rules, listed on the result page.",
  ],
  wrongTitle: "What can go wrong",
  wrongBody: "A model can misread a document or a call: wrong country, wrong sector code, a condition missed. Prefilled fields are suggestions until you confirm them. Enriched fields are marked as such and can be wrong; the official call text always wins. Report a problem from any record page.",
  dataTitle: "Your data",
  dataBody: "Model calls go through Cloudflare AI Gateway to Google. Your inputs are not used to train any model. Your form, your uploads and your results are stored privately, never published, never indexed, and you can export a result as JSON from its page.",
  providersTitle: "Providers",
  providersBody: "Google Gemini through Cloudflare AI Gateway. The provider is one file in the open source code and can be swapped; the screening does not change when it is.",
};

const fr: AiNoticeContent = {
  metaTitle: "Notice sur l'IA",
  metaDescription: "Où grantledger utilise un modèle de langage, où il n'en utilise pas, et ce que cela signifie pour vous.",
  kicker: "Transparence",
  title: "Notice sur l'IA",
  lead: "En bref : aucun modèle ne décide de ce que vous voyez. Les modèles remplissent des formulaires et extraient des champs de textes officiels. Chaque champ qu'ils produisent est stocké, visible et corrigeable.",
  whereTitle: "Où un modèle est utilisé",
  prefillBold: "Préremplir votre formulaire d'entreprise",
  prefillRest: "à partir d'un site web, d'un PDF ou d'un paragraphe, lorsque vous le demandez. Vous voyez et modifiez chaque champ avant l'analyse. Modèle : {model}.",
  enrichBold: "Enrichir les fiches hors ligne.",
  enrichRest: "Lorsqu'un financeur publie les conditions d'éligibilité uniquement sous forme de prose, le modèle extrait les types de bénéficiaires, les secteurs, les régions, les limites de taille et d'ancienneté et l'exigence de consortium dans une table séparée, une fois par fiche. Le moteur de correspondance n'utilise ces champs que lorsque le financeur n'en a publié aucun.",
  noneTitle: "Où aucun modèle n'est utilisé",
  noneItems: [
    "Collecte et normalisation du registre : du code uniquement, à partir d'API officielles et de données ouvertes.",
    "Recherche, filtres, échéances, historique.",
    "Verdicts d'analyse, scores, lacunes de préparation et mémos négatifs : des règles fixes, listées sur la page de résultat.",
  ],
  wrongTitle: "Ce qui peut mal tourner",
  wrongBody: "Un modèle peut mal lire un document ou un appel : mauvais pays, mauvais code de secteur, condition manquée. Les champs préremplis sont des suggestions tant que vous ne les avez pas confirmés. Les champs enrichis sont signalés comme tels et peuvent être erronés ; le texte officiel de l'appel prévaut toujours. Signalez un problème depuis n'importe quelle page de fiche.",
  dataTitle: "Vos données",
  dataBody: "Les appels au modèle passent par Cloudflare AI Gateway vers Google. Vos saisies ne sont pas utilisées pour entraîner un modèle. Votre formulaire, vos fichiers téléversés et vos résultats sont stockés de façon privée, jamais publiés, jamais indexés, et vous pouvez exporter un résultat en JSON depuis sa page.",
  providersTitle: "Fournisseurs",
  providersBody: "Google Gemini via Cloudflare AI Gateway. Le fournisseur est un seul fichier dans le code open source et peut être remplacé ; l'analyse ne change pas lorsqu'il l'est.",
};

const de: AiNoticeContent = {
  metaTitle: "KI-Hinweis",
  metaDescription: "Wo grantledger ein Sprachmodell einsetzt, wo nicht, und was das für Sie bedeutet.",
  kicker: "Transparenz",
  title: "KI-Hinweis",
  lead: "Kurzfassung: Kein Modell entscheidet über etwas, das Sie sehen. Modelle füllen Formulare aus und extrahieren Felder aus amtlichem Text. Jedes Feld, das sie erzeugen, wird gespeichert, ist sichtbar und korrigierbar.",
  whereTitle: "Wo ein Modell eingesetzt wird",
  prefillBold: "Vorausfüllen Ihres Unternehmensformulars",
  prefillRest: "aus einer Website, einem PDF oder einem Absatz, wenn Sie es wünschen. Sie sehen und bearbeiten jedes Feld vor der Prüfung. Modell: {model}.",
  enrichBold: "Offline-Anreicherung von Datensätzen.",
  enrichRest: "Wenn ein Fördergeber die Förderfähigkeit nur als Fließtext veröffentlicht, extrahiert das Modell Begünstigtentypen, Sektoren, Regionen, Größen- und Altersgrenzen sowie die Konsortiumsanforderung in eine separate Tabelle, einmal pro Datensatz. Der Abgleich verwendet diese Felder nur, wenn der Fördergeber keine veröffentlicht hat.",
  noneTitle: "Wo kein Modell eingesetzt wird",
  noneItems: [
    "Erfassung und Normalisierung des Registers: nur Code, aus amtlichen APIs und offenen Daten.",
    "Suche, Filter, Fristen, Verlauf.",
    "Prüfergebnisse, Bewertungen, Lücken in der Antragsreife und Ablehnungsvermerke: feste Regeln, aufgeführt auf der Ergebnisseite.",
  ],
  wrongTitle: "Was schiefgehen kann",
  wrongBody: "Ein Modell kann ein Dokument oder eine Ausschreibung falsch lesen: falsches Land, falscher Sektorcode, eine übersehene Bedingung. Vorausgefüllte Felder sind Vorschläge, bis Sie sie bestätigen. Angereicherte Felder sind als solche gekennzeichnet und können falsch sein; der amtliche Ausschreibungstext hat immer Vorrang. Melden Sie ein Problem von jeder Datensatzseite aus.",
  dataTitle: "Ihre Daten",
  dataBody: "Modellaufrufe laufen über Cloudflare AI Gateway zu Google. Ihre Eingaben werden nicht zum Trainieren eines Modells verwendet. Ihr Formular, Ihre hochgeladenen Dateien und Ihre Ergebnisse werden privat gespeichert, nie veröffentlicht, nie indexiert, und Sie können ein Ergebnis von seiner Seite aus als JSON exportieren.",
  providersTitle: "Anbieter",
  providersBody: "Google Gemini über Cloudflare AI Gateway. Der Anbieter ist eine einzelne Datei im Open-Source-Code und kann ausgetauscht werden; die Prüfung ändert sich dadurch nicht.",
};

const es: AiNoticeContent = {
  metaTitle: "Aviso sobre IA",
  metaDescription: "Dónde grantledger utiliza un modelo de lenguaje, dónde no, y qué significa eso para usted.",
  kicker: "Transparencia",
  title: "Aviso sobre IA",
  lead: "En resumen: ningún modelo decide nada de lo que usted ve. Los modelos rellenan formularios y extraen campos de textos oficiales. Cada campo que producen se almacena, es visible y se puede corregir.",
  whereTitle: "Dónde se utiliza un modelo",
  prefillBold: "Rellenar previamente su formulario de empresa",
  prefillRest: "a partir de un sitio web, un PDF o un párrafo, cuando usted lo solicita. Usted ve y edita cada campo antes del análisis. Modelo: {model}.",
  enrichBold: "Enriquecer fichas sin conexión.",
  enrichRest: "Cuando un financiador publica la elegibilidad solo en prosa, el modelo extrae los tipos de beneficiario, sectores, regiones, límites de tamaño y antigüedad y el requisito de consorcio en una tabla separada, una vez por ficha. El motor de coincidencia usa esos campos solo cuando el financiador no publicó ninguno.",
  noneTitle: "Dónde no se utiliza ningún modelo",
  noneItems: [
    "Recopilación y normalización del registro: solo código, a partir de API oficiales y datos abiertos.",
    "Búsqueda, filtros, plazos, historial.",
    "Veredictos de análisis, puntuaciones, carencias de preparación y notas negativas: reglas fijas, listadas en la página de resultado.",
  ],
  wrongTitle: "Qué puede salir mal",
  wrongBody: "Un modelo puede leer mal un documento o una convocatoria: país equivocado, código de sector equivocado, una condición omitida. Los campos rellenados previamente son sugerencias hasta que usted los confirma. Los campos enriquecidos están marcados como tales y pueden ser erróneos; el texto oficial de la convocatoria siempre prevalece. Notifique un problema desde cualquier página de ficha.",
  dataTitle: "Sus datos",
  dataBody: "Las llamadas al modelo pasan por Cloudflare AI Gateway hacia Google. Sus entradas no se utilizan para entrenar ningún modelo. Su formulario, sus archivos subidos y sus resultados se almacenan de forma privada, nunca se publican, nunca se indexan, y puede exportar un resultado como JSON desde su página.",
  providersTitle: "Proveedores",
  providersBody: "Google Gemini a través de Cloudflare AI Gateway. El proveedor es un único archivo en el código abierto y puede sustituirse; el análisis no cambia cuando se hace.",
};

const it: AiNoticeContent = {
  metaTitle: "Nota sull'IA",
  metaDescription: "Dove grantledger utilizza un modello linguistico, dove no, e cosa significa per voi.",
  kicker: "Trasparenza",
  title: "Nota sull'IA",
  lead: "In breve: nessun modello decide nulla di ciò che vedete. I modelli compilano moduli ed estraggono campi da testi ufficiali. Ogni campo che producono è memorizzato, visibile e correggibile.",
  whereTitle: "Dove viene usato un modello",
  prefillBold: "Precompilazione del modulo aziendale",
  prefillRest: "da un sito web, un PDF o un paragrafo, quando lo richiedete. Vedete e modificate ogni campo prima della verifica. Modello: {model}.",
  enrichBold: "Arricchimento delle schede offline.",
  enrichRest: "Quando un finanziatore pubblica i criteri di ammissibilità solo in prosa, il modello estrae tipi di beneficiari, settori, regioni, limiti di dimensione e di età e il requisito di consorzio in una tabella separata, una volta per scheda. Il sistema di abbinamento usa quei campi solo quando il finanziatore non ne ha pubblicato alcuno.",
  noneTitle: "Dove non viene usato alcun modello",
  noneItems: [
    "Raccolta e normalizzazione del registro: solo codice, da API ufficiali e dati aperti.",
    "Ricerca, filtri, scadenze, cronologia.",
    "Esiti della verifica, punteggi, lacune di preparazione e note negative: regole fisse, elencate nella pagina dei risultati.",
  ],
  wrongTitle: "Cosa può andare storto",
  wrongBody: "Un modello può leggere male un documento o un bando: paese sbagliato, codice di settore sbagliato, una condizione trascurata. I campi precompilati sono suggerimenti finché non li confermate. I campi arricchiti sono contrassegnati come tali e possono essere errati; il testo ufficiale del bando prevale sempre. Segnalate un problema da qualsiasi pagina di scheda.",
  dataTitle: "I vostri dati",
  dataBody: "Le chiamate al modello passano da Cloudflare AI Gateway verso Google. I vostri input non sono usati per addestrare alcun modello. Il vostro modulo, i vostri file caricati e i vostri risultati sono memorizzati in modo privato, mai pubblicati, mai indicizzati, e potete esportare un risultato in JSON dalla sua pagina.",
  providersTitle: "Fornitori",
  providersBody: "Google Gemini tramite Cloudflare AI Gateway. Il fornitore è un singolo file nel codice open source e può essere sostituito; la verifica non cambia quando lo è.",
};

const pt: AiNoticeContent = {
  metaTitle: "Aviso sobre IA",
  metaDescription: "Onde o grantledger usa um modelo de linguagem, onde não usa, e o que isso significa para si.",
  kicker: "Transparência",
  title: "Aviso sobre IA",
  lead: "Em resumo: nenhum modelo decide nada do que vê. Os modelos preenchem formulários e extraem campos de textos oficiais. Cada campo que produzem é guardado, visível e corrigível.",
  whereTitle: "Onde é usado um modelo",
  prefillBold: "Preenchimento prévio do seu formulário de empresa",
  prefillRest: "a partir de um site, de um PDF ou de um parágrafo, quando o pede. Vê e edita cada campo antes da análise. Modelo: {model}.",
  enrichBold: "Enriquecimento de registos offline.",
  enrichRest: "Quando um financiador publica a elegibilidade apenas em prosa, o modelo extrai tipos de beneficiários, setores, regiões, limites de dimensão e idade e o requisito de consórcio para uma tabela separada, uma vez por registo. O motor de correspondência usa esses campos apenas quando o financiador não publicou nenhum.",
  noneTitle: "Onde não é usado nenhum modelo",
  noneItems: [
    "Recolha e normalização do registo: apenas código, a partir de API oficiais e dados abertos.",
    "Pesquisa, filtros, prazos, histórico.",
    "Veredictos de análise, pontuações, lacunas de preparação e notas negativas: regras fixas, listadas na página de resultado.",
  ],
  wrongTitle: "O que pode correr mal",
  wrongBody: "Um modelo pode ler mal um documento ou uma candidatura: país errado, código de setor errado, uma condição omitida. Os campos preenchidos previamente são sugestões até os confirmar. Os campos enriquecidos estão marcados como tal e podem estar errados; o texto oficial da candidatura prevalece sempre. Comunique um problema a partir de qualquer página de registo.",
  dataTitle: "Os seus dados",
  dataBody: "As chamadas ao modelo passam pelo Cloudflare AI Gateway até à Google. As suas entradas não são usadas para treinar qualquer modelo. O seu formulário, os seus ficheiros carregados e os seus resultados são guardados de forma privada, nunca publicados, nunca indexados, e pode exportar um resultado como JSON a partir da sua página.",
  providersTitle: "Fornecedores",
  providersBody: "Google Gemini através do Cloudflare AI Gateway. O fornecedor é um único ficheiro no código aberto e pode ser substituído; a análise não muda quando isso acontece.",
};

const nl: AiNoticeContent = {
  metaTitle: "AI-kennisgeving",
  metaDescription: "Waar grantledger een taalmodel gebruikt, waar niet, en wat dat voor u betekent.",
  kicker: "Transparantie",
  title: "AI-kennisgeving",
  lead: "Kort gezegd: geen enkel model beslist over wat u ziet. Modellen vullen formulieren in en halen velden uit officiële tekst. Elk veld dat ze produceren wordt opgeslagen, is zichtbaar en kan worden gecorrigeerd.",
  whereTitle: "Waar een model wordt gebruikt",
  prefillBold: "Uw bedrijfsformulier vooraf invullen",
  prefillRest: "vanuit een website, een PDF of een alinea, wanneer u daarom vraagt. U ziet en bewerkt elk veld vóór de screening. Model: {model}.",
  enrichBold: "Records offline verrijken.",
  enrichRest: "Wanneer een financier de subsidiabiliteit alleen als lopende tekst publiceert, haalt het model begunstigdentypen, sectoren, regio's, grootte- en leeftijdsgrenzen en de consortiumvereiste eruit en zet ze in een aparte tabel, eenmaal per record. De matcher gebruikt die velden alleen wanneer de financier er geen heeft gepubliceerd.",
  noneTitle: "Waar geen model wordt gebruikt",
  noneItems: [
    "Verzamelen en normaliseren van het register: alleen code, uit officiële API's en open data.",
    "Zoeken, filters, deadlines, geschiedenis.",
    "Screeningoordelen, scores, hiaten in de gereedheid en negatieve memo's: vaste regels, vermeld op de resultaatpagina.",
  ],
  wrongTitle: "Wat er mis kan gaan",
  wrongBody: "Een model kan een document of een oproep verkeerd lezen: verkeerd land, verkeerde sectorcode, een gemiste voorwaarde. Vooraf ingevulde velden zijn suggesties totdat u ze bevestigt. Verrijkte velden zijn als zodanig gemarkeerd en kunnen onjuist zijn; de officiële oproeptekst wint altijd. Meld een probleem vanaf elke recordpagina.",
  dataTitle: "Uw gegevens",
  dataBody: "Modelaanroepen gaan via Cloudflare AI Gateway naar Google. Uw invoer wordt niet gebruikt om een model te trainen. Uw formulier, uw uploads en uw resultaten worden privé opgeslagen, nooit gepubliceerd, nooit geïndexeerd, en u kunt een resultaat als JSON exporteren vanaf de pagina ervan.",
  providersTitle: "Leveranciers",
  providersBody: "Google Gemini via Cloudflare AI Gateway. De leverancier is één bestand in de opensourcecode en kan worden vervangen; de screening verandert daardoor niet.",
};

const pl: AiNoticeContent = {
  metaTitle: "Nota o AI",
  metaDescription: "Gdzie grantledger używa modelu językowego, gdzie nie, i co to dla Ciebie oznacza.",
  kicker: "Przejrzystość",
  title: "Nota o AI",
  lead: "W skrócie: żaden model nie decyduje o niczym, co widzisz. Modele wypełniają formularze i wyodrębniają pola z oficjalnych tekstów. Każde pole, które wytworzą, jest zapisywane, widoczne i możliwe do poprawienia.",
  whereTitle: "Gdzie używany jest model",
  prefillBold: "Wstępne wypełnianie formularza firmy",
  prefillRest: "na podstawie strony internetowej, PDF-a lub akapitu, gdy o to poprosisz. Widzisz i edytujesz każde pole przed analizą. Model: {model}.",
  enrichBold: "Wzbogacanie rekordów offline.",
  enrichRest: "Gdy instytucja finansująca publikuje kwalifikowalność wyłącznie jako prozę, model wyodrębnia typy beneficjentów, sektory, regiony, limity wielkości i wieku oraz wymóg konsorcjum do osobnej tabeli, raz na rekord. Mechanizm dopasowania używa tych pól tylko wtedy, gdy instytucja finansująca nie opublikowała żadnych.",
  noneTitle: "Gdzie model nie jest używany",
  noneItems: [
    "Zbieranie i normalizacja rejestru: wyłącznie kod, z oficjalnych API i otwartych danych.",
    "Wyszukiwanie, filtry, terminy, historia.",
    "Werdykty analizy, oceny, braki w gotowości i noty negatywne: stałe reguły, wymienione na stronie wyniku.",
  ],
  wrongTitle: "Co może pójść nie tak",
  wrongBody: "Model może błędnie odczytać dokument lub nabór: zły kraj, zły kod sektora, pominięty warunek. Wstępnie wypełnione pola są sugestiami, dopóki ich nie potwierdzisz. Wzbogacone pola są tak oznaczone i mogą być błędne; oficjalny tekst naboru zawsze ma pierwszeństwo. Zgłoś problem z dowolnej strony rekordu.",
  dataTitle: "Twoje dane",
  dataBody: "Wywołania modelu przechodzą przez Cloudflare AI Gateway do Google. Twoje dane wejściowe nie są używane do trenowania żadnego modelu. Twój formularz, przesłane pliki i wyniki są przechowywane prywatnie, nigdy nie są publikowane ani indeksowane, a wynik możesz wyeksportować jako JSON z jego strony.",
  providersTitle: "Dostawcy",
  providersBody: "Google Gemini przez Cloudflare AI Gateway. Dostawca to jeden plik w kodzie open source i można go zamienić; analiza nie zmienia się po zamianie.",
};

export const aiNotice: Record<string, AiNoticeContent> = { en, fr, de, es, it, pt, nl, pl };
