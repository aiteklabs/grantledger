// Strings of the Pro page that are not in the shared dictionary: what a payment buys, item by item, and what Pro
// does not do. The fifth item is the assistants; the page links it to /assistant.
export type Content = {
  what_title: string;
  what: { title: string; text: string }[];
  assistant_cta: string;
  not_title: string;
  not_text: string;
};

const en: Content = {
  what_title: "What you get when you pay",
  what: [
    { title: "Your profile, filled for you", text: "Give a website or a PDF and the model fills the profile form. You correct it and confirm it before anything is screened." },
    { title: "Every current call, screened", text: "Fixed, published rules compare your profile with every current call in the ledger. Each call gets a verdict and the rule behind it, so you see why it fits or why it does not." },
    { title: "What you still miss", text: "For a call that fits: the readiness gaps, the documents and conditions to settle before you apply. For a call that looked right but does not fit: a short memo that says what blocks it, so you stop losing time on it." },
    { title: "A weekly email", text: "Every Monday each saved profile is screened again and the new calls that pass are emailed to you. No email when nothing is new." },
    { title: "In ChatGPT and Claude", text: "Connect GrantLedger to the assistant you already use. It searches the ledger, screens any project you describe, saves a profile after your yes, and helps you plan, write and score an application from the official criteria. The writing runs on your own assistant, at no extra cost here." },
  ],
  assistant_cta: "How it works in ChatGPT and Claude",
  not_title: "What Pro does not do",
  not_text: "It does not apply for you and takes no share of the funding: you apply yourself, with the funder. Verdicts come from the rules, never from a model's opinion, and the official call text always wins.",
};

const fr: Content = {
  what_title: "Ce que vous obtenez en payant",
  what: [
    { title: "Votre profil, rempli pour vous", text: "Donnez un site web ou un PDF et le modèle remplit le formulaire de profil. Vous le corrigez et le confirmez avant toute analyse." },
    { title: "Chaque appel en cours, analysé", text: "Des règles fixes et publiées comparent votre profil à chaque appel en cours du registre. Chaque appel reçoit un verdict et la règle qui le fonde : vous voyez pourquoi il convient ou non." },
    { title: "Ce qu'il vous manque encore", text: "Pour un appel qui convient : les écarts de préparation, c'est-à-dire les documents et conditions à régler avant de candidater. Pour un appel qui semblait convenir mais ne convient pas : une courte note qui dit ce qui bloque, pour ne plus y perdre de temps." },
    { title: "Un e-mail chaque semaine", text: "Chaque lundi, chaque profil enregistré est analysé de nouveau et les nouveaux appels qui passent vous sont envoyés par e-mail. Aucun e-mail s'il n'y a rien de nouveau." },
    { title: "Dans ChatGPT et Claude", text: "Connectez GrantLedger à l'assistant que vous utilisez déjà. Il cherche dans le registre, analyse tout projet que vous décrivez, enregistre un profil après votre accord et vous aide à planifier, rédiger et noter une candidature à partir des critères officiels. La rédaction tourne sur votre propre assistant, sans coût supplémentaire ici." },
  ],
  assistant_cta: "Comment cela fonctionne dans ChatGPT et Claude",
  not_title: "Ce que Pro ne fait pas",
  not_text: "Il ne candidate pas à votre place et ne prend aucune part du financement : vous candidatez vous-même, auprès du financeur. Les verdicts viennent des règles, jamais de l'avis d'un modèle, et le texte officiel de l'appel prime toujours.",
};

const de: Content = {
  what_title: "Was Sie für Ihre Zahlung erhalten",
  what: [
    { title: "Ihr Profil, für Sie ausgefüllt", text: "Geben Sie eine Website oder ein PDF an, und das Modell füllt das Profilformular aus. Sie korrigieren und bestätigen es, bevor etwas geprüft wird." },
    { title: "Jeder laufende Aufruf, geprüft", text: "Feste, veröffentlichte Regeln vergleichen Ihr Profil mit jedem laufenden Aufruf im Register. Jeder Aufruf erhält ein Urteil und die Regel dahinter: Sie sehen, warum er passt oder nicht." },
    { title: "Was Ihnen noch fehlt", text: "Für einen passenden Aufruf: die Lücken in der Vorbereitung, also die Dokumente und Bedingungen, die vor dem Antrag zu klären sind. Für einen Aufruf, der passend aussah, es aber nicht ist: eine kurze Notiz, die sagt, was ihn ausschließt, damit Sie keine Zeit mehr damit verlieren." },
    { title: "Eine wöchentliche E-Mail", text: "Jeden Montag wird jedes gespeicherte Profil erneut geprüft, und die neuen Aufrufe, die bestehen, kommen per E-Mail. Keine E-Mail, wenn es nichts Neues gibt." },
    { title: "In ChatGPT und Claude", text: "Verbinden Sie GrantLedger mit dem Assistenten, den Sie schon nutzen. Er durchsucht das Register, prüft jedes Projekt, das Sie beschreiben, speichert ein Profil nach Ihrem Ja und hilft Ihnen, einen Antrag anhand der amtlichen Kriterien zu planen, zu schreiben und zu bewerten. Das Schreiben läuft auf Ihrem eigenen Assistenten, ohne Zusatzkosten hier." },
  ],
  assistant_cta: "So funktioniert es in ChatGPT und Claude",
  not_title: "Was Pro nicht tut",
  not_text: "Es stellt keinen Antrag für Sie und nimmt keinen Anteil an der Förderung: Den Antrag stellen Sie selbst, beim Fördergeber. Die Urteile kommen aus den Regeln, nie aus der Meinung eines Modells, und der amtliche Text des Aufrufs gilt immer.",
};

const es: Content = {
  what_title: "Qué obtiene al pagar",
  what: [
    { title: "Su perfil, rellenado por usted", text: "Indique un sitio web o un PDF y el modelo rellena el formulario de perfil. Usted lo corrige y lo confirma antes de cualquier análisis." },
    { title: "Cada convocatoria vigente, analizada", text: "Reglas fijas y publicadas comparan su perfil con cada convocatoria vigente del registro. Cada convocatoria recibe un veredicto y la regla que lo sustenta: usted ve por qué encaja o por qué no." },
    { title: "Lo que aún le falta", text: "Para una convocatoria que encaja: las carencias de preparación, es decir, los documentos y condiciones que resolver antes de presentarse. Para una convocatoria que parecía encajar pero no encaja: una nota breve que dice qué la bloquea, para no perder más tiempo con ella." },
    { title: "Un correo semanal", text: "Cada lunes, cada perfil guardado se analiza de nuevo y las nuevas convocatorias que pasan le llegan por correo. Ningún correo si no hay nada nuevo." },
    { title: "En ChatGPT y Claude", text: "Conecte GrantLedger al asistente que ya utiliza. Busca en el registro, analiza cualquier proyecto que usted describa, guarda un perfil tras su sí y le ayuda a planificar, redactar y puntuar una solicitud a partir de los criterios oficiales. La redacción corre en su propio asistente, sin coste adicional aquí." },
  ],
  assistant_cta: "Cómo funciona en ChatGPT y Claude",
  not_title: "Lo que Pro no hace",
  not_text: "No presenta la solicitud por usted ni se queda con parte de la financiación: usted presenta la solicitud, ante el financiador. Los veredictos vienen de las reglas, nunca de la opinión de un modelo, y el texto oficial de la convocatoria siempre prevalece.",
};

const it: Content = {
  what_title: "Che cosa ottenete pagando",
  what: [
    { title: "Il vostro profilo, compilato per voi", text: "Indicate un sito web o un PDF e il modello compila il modulo del profilo. Lo correggete e lo confermate prima di qualsiasi analisi." },
    { title: "Ogni bando in corso, analizzato", text: "Regole fisse e pubblicate confrontano il vostro profilo con ogni bando in corso nel registro. Ogni bando riceve un verdetto e la regola su cui si basa: vedete perché è adatto o perché non lo è." },
    { title: "Che cosa vi manca ancora", text: "Per un bando adatto: le lacune di preparazione, cioè i documenti e le condizioni da sistemare prima di candidarsi. Per un bando che sembrava adatto ma non lo è: una breve nota che dice che cosa lo blocca, per non perderci altro tempo." },
    { title: "Un'e-mail ogni settimana", text: "Ogni lunedì ogni profilo salvato viene analizzato di nuovo e i nuovi bandi che passano vi arrivano per e-mail. Nessuna e-mail se non c'è nulla di nuovo." },
    { title: "In ChatGPT e Claude", text: "Collegate GrantLedger all'assistente che usate già. Cerca nel registro, analizza qualsiasi progetto che descrivete, salva un profilo dopo il vostro sì e vi aiuta a pianificare, scrivere e valutare una domanda a partire dai criteri ufficiali. La scrittura gira sul vostro assistente, senza costi aggiuntivi qui." },
  ],
  assistant_cta: "Come funziona in ChatGPT e Claude",
  not_title: "Che cosa Pro non fa",
  not_text: "Non presenta la domanda al vostro posto e non prende alcuna quota del finanziamento: la domanda la presentate voi, presso il finanziatore. I verdetti vengono dalle regole, mai dall'opinione di un modello, e il testo ufficiale del bando prevale sempre.",
};

const pt: Content = {
  what_title: "O que recebe ao pagar",
  what: [
    { title: "O seu perfil, preenchido por si", text: "Indique um site ou um PDF e o modelo preenche o formulário de perfil. Corrige-o e confirma-o antes de qualquer análise." },
    { title: "Cada aviso em curso, analisado", text: "Regras fixas e publicadas comparam o seu perfil com cada aviso em curso no registo. Cada aviso recebe um veredicto e a regra que o sustenta: vê por que razão se adequa ou não." },
    { title: "O que ainda lhe falta", text: "Para um aviso que se adequa: as lacunas de preparação, isto é, os documentos e condições a resolver antes de se candidatar. Para um aviso que parecia adequar-se mas não se adequa: uma nota curta que diz o que o bloqueia, para não perder mais tempo com ele." },
    { title: "Um e-mail semanal", text: "Todas as segundas-feiras, cada perfil guardado é analisado de novo e os novos avisos que passam chegam-lhe por e-mail. Nenhum e-mail quando não há nada de novo." },
    { title: "No ChatGPT e no Claude", text: "Ligue o GrantLedger ao assistente que já utiliza. Ele pesquisa no registo, analisa qualquer projeto que descreva, guarda um perfil depois do seu sim e ajuda-o a planear, redigir e pontuar uma candidatura a partir dos critérios oficiais. A redação corre no seu próprio assistente, sem custo adicional aqui." },
  ],
  assistant_cta: "Como funciona no ChatGPT e no Claude",
  not_title: "O que o Pro não faz",
  not_text: "Não se candidata por si e não fica com nenhuma parte do financiamento: a candidatura é feita por si, junto do financiador. Os veredictos vêm das regras, nunca da opinião de um modelo, e o texto oficial do aviso prevalece sempre.",
};

const nl: Content = {
  what_title: "Wat u krijgt als u betaalt",
  what: [
    { title: "Uw profiel, voor u ingevuld", text: "Geef een website of een pdf op en het model vult het profielformulier in. U verbetert en bevestigt het voordat er iets wordt getoetst." },
    { title: "Elke lopende oproep, getoetst", text: "Vaste, gepubliceerde regels vergelijken uw profiel met elke lopende oproep in het register. Elke oproep krijgt een oordeel en de regel erachter: u ziet waarom hij past of niet." },
    { title: "Wat u nog mist", text: "Voor een oproep die past: de hiaten in de voorbereiding, dus de documenten en voorwaarden die u moet regelen voordat u aanvraagt. Voor een oproep die leek te passen maar niet past: een korte notitie die zegt wat hem blokkeert, zodat u er geen tijd meer aan verliest." },
    { title: "Een wekelijkse e-mail", text: "Elke maandag wordt elk opgeslagen profiel opnieuw getoetst en krijgt u de nieuwe oproepen die slagen per e-mail. Geen e-mail als er niets nieuws is." },
    { title: "In ChatGPT en Claude", text: "Koppel GrantLedger aan de assistent die u al gebruikt. Die doorzoekt het register, toetst elk project dat u beschrijft, slaat een profiel op na uw ja en helpt u een aanvraag te plannen, te schrijven en te scoren op basis van de officiële criteria. Het schrijven draait op uw eigen assistent, zonder extra kosten hier." },
  ],
  assistant_cta: "Zo werkt het in ChatGPT en Claude",
  not_title: "Wat Pro niet doet",
  not_text: "Het vraagt niet voor u aan en neemt geen deel van de financiering: u vraagt zelf aan, bij de financier. De oordelen komen uit de regels, nooit uit de mening van een model, en de officiële tekst van de oproep gaat altijd voor.",
};

const pl: Content = {
  what_title: "Co otrzymujesz po zapłacie",
  what: [
    { title: "Twój profil, wypełniony za Ciebie", text: "Podaj stronę internetową lub plik PDF, a model wypełni formularz profilu. Poprawiasz go i potwierdzasz, zanim cokolwiek zostanie sprawdzone." },
    { title: "Każdy trwający nabór, sprawdzony", text: "Stałe, opublikowane reguły porównują Twój profil z każdym trwającym naborem w rejestrze. Każdy nabór dostaje werdykt i regułę, na której się opiera: widzisz, dlaczego pasuje albo nie." },
    { title: "Czego Ci jeszcze brakuje", text: "Dla naboru, który pasuje: luki w przygotowaniu, czyli dokumenty i warunki do załatwienia przed złożeniem wniosku. Dla naboru, który wyglądał na pasujący, ale nie pasuje: krótka notatka, która mówi, co go blokuje, żeby nie tracić na niego więcej czasu." },
    { title: "Cotygodniowy e-mail", text: "W każdy poniedziałek każdy zapisany profil jest sprawdzany ponownie, a nowe nabory, które przechodzą, trafiają do Ciebie e-mailem. Żadnego e-maila, gdy nie ma nic nowego." },
    { title: "W ChatGPT i Claude", text: "Połącz GrantLedger z asystentem, którego już używasz. Przeszukuje rejestr, sprawdza każdy projekt, który opiszesz, zapisuje profil po Twoim tak i pomaga zaplanować, napisać i ocenić wniosek na podstawie oficjalnych kryteriów. Pisanie działa na Twoim własnym asystencie, bez dodatkowych kosztów tutaj." },
  ],
  assistant_cta: "Jak to działa w ChatGPT i Claude",
  not_title: "Czego Pro nie robi",
  not_text: "Nie składa wniosku za Ciebie i nie bierze żadnej części finansowania: wniosek składasz samodzielnie, u grantodawcy. Werdykty wynikają z reguł, nigdy z opinii modelu, a oficjalny tekst naboru zawsze ma pierwszeństwo.",
};

export const pro: Record<string, Content> = { en, fr, de, es, it, pt, nl, pl };
