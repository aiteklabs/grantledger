// Privacy page content, one entry per locale. English is the source of truth.
// A Linked field wraps one anchor whose label is translated; an Around field wraps a fixed anchor
// (an email address). The page keeps the HTML structure and the link targets.
type Linked = { before: string; link: string; after: string };
type Around = { before: string; after: string };

export type PrivacyContent = {
  metaTitle: string;
  metaDescription: string;
  kicker: string;
  title: string;
  lead: string;
  whoTitle: string;
  whoOperates: string;
  whoDetails: Linked;
  browsingTitle: string;
  browsingCookies: string;
  browsingAnalytics: string;
  browsingLogs: Linked;
  fitTitle: string;
  fitIntro: string;
  fitItems: string[];
  fitPrivate: string;
  fitPrefill: Linked;
  fitTurnstile: string;
  proTitle: string;
  proAccount: Linked;
  whereTitle: string;
  whereBody: string;
  retentionTitle: string;
  retentionBody: string;
  rightsTitle: string;
  rights: Around;
  ledgerTitle: string;
  ledgerBody: string;
  changesTitle: string;
  // {model} is replaced with the current model name.
  changes: Linked;
};

const en: PrivacyContent = {
  metaTitle: "Privacy",
  metaDescription: "What grantledger stores about you, where, for how long, and how to have it removed.",
  kicker: "Privacy",
  title: "Privacy",
  lead: "Short version: reading the ledger stores nothing about you. A screening stores what you type or upload, privately, so its result page works. A Pro account is an email and a payment record. No tracking cookies, no advertising, no resale.",
  whoTitle: "Who is responsible",
  whoOperates: "Aitek Labs operates grantledger.eu. Contact:",
  whoDetails: { before: "Details are on the", link: "legal notice", after: "." },
  browsingTitle: "Browsing the ledger",
  browsingCookies: "No cookies are set. Your theme choice is kept in your browser's local storage and never sent to us.",
  browsingAnalytics: "No analytics script runs on the site.",
  browsingLogs: {
    before: "Pages are served by Cloudflare, which keeps standard server logs (IP address, user agent, requested page) for security and abuse prevention, for a short period, under",
    link: "Cloudflare's privacy policy",
    after: ".",
  },
  fitTitle: "Running a fit check",
  fitIntro: "When you use \"Find my grant\", we store what you give us to produce and keep your result page:",
  fitItems: [
    "The company profile form, and the website address, PDF or text you asked us to prefill it from.",
    "The screening result: matched calls, verdicts, readiness gaps.",
    "The date, the model tokens used for prefilling, and a random result id.",
  ],
  fitPrivate: "The result page is private to its random link. It is not listed, not indexed and not shared. Whoever has the link can open it, so share it only with people you trust. Your browser keeps a list of your last ten results in local storage; that list never leaves your device.",
  fitPrefill: {
    before: "Prefilling sends the text you provide to Google Gemini through Cloudflare AI Gateway. It is used only to fill the form and is not used to train any model. See the",
    link: "AI notice",
    after: ".",
  },
  fitTurnstile: "The form is protected by Cloudflare Turnstile, which checks that a person, not a script, is submitting it. Turnstile runs under Cloudflare's privacy policy.",
  proTitle: "Pro accounts",
  proAccount: {
    before: "Paying for Pro creates an account under the email you give Stripe. We store that email, the plan, the Stripe session and customer ids, the business name and VAT number if you entered them, and your sign-in dates. Card details never reach us; Stripe processes the payment under",
    link: "Stripe's privacy policy",
    after: " and issues the receipt and invoice. Sign-in is by single-use email link; a signed cookie keeps you signed in for 90 days on that browser. Company profiles you save are screened every Monday and you receive an email only when new calls pass the rules; every email has a link to stop them. Write to us to close the account: profiles and login tokens are deleted, the payment record is kept as long as accounting law requires.",
  },
  whereTitle: "Where the data lives",
  whereBody: "Cloudflare D1 (database) and R2 (uploaded files) on Cloudflare's European network. Model calls go to Google through Cloudflare AI Gateway.",
  retentionTitle: "How long we keep it",
  retentionBody: "Fit checks are kept for as long as the result link should work, and used in aggregate to improve the screening rules. Write to us to have a fit check and its uploads deleted; give us the result link. Deletion is done within 30 days.",
  rightsTitle: "Your rights",
  rights: {
    before: "Under the GDPR you can ask what we hold about you, have it corrected or deleted, and object to its use. Write to",
    after: ". You can also complain to your national data protection authority.",
  },
  ledgerTitle: "The ledger itself",
  ledgerBody: "Funding records are public information published by public bodies. They may name contact persons at funders; those names come from the official publication and are shown as published. Ask the publisher to correct its record, or write to us to have a name removed from our copy.",
  changesTitle: "Changes",
  changes: {
    before: "This page changes when the site does. The current model used for prefilling is {model}. The source code of the site, including every place data is stored, is",
    link: "public",
    after: ".",
  },
};

const fr: PrivacyContent = {
  metaTitle: "Confidentialité",
  metaDescription: "Ce que grantledger conserve à votre sujet, où, pendant combien de temps, et comment le faire supprimer.",
  kicker: "Confidentialité",
  title: "Confidentialité",
  lead: "En bref : consulter le registre ne conserve rien à votre sujet. Une analyse conserve ce que vous saisissez ou téléversez, de façon privée, pour que sa page de résultat fonctionne. Un compte Pro, c'est une adresse e-mail et un enregistrement de paiement. Pas de cookies de suivi, pas de publicité, pas de revente.",
  whoTitle: "Qui est responsable",
  whoOperates: "Aitek Labs exploite grantledger.eu. Contact :",
  whoDetails: { before: "Les coordonnées figurent dans les", link: "mentions légales", after: "." },
  browsingTitle: "Consulter le registre",
  browsingCookies: "Aucun cookie n'est déposé. Votre choix de thème est conservé dans le stockage local de votre navigateur et ne nous est jamais transmis.",
  browsingAnalytics: "Aucun script d'analyse d'audience ne s'exécute sur le site.",
  browsingLogs: {
    before: "Les pages sont servies par Cloudflare, qui conserve des journaux serveur standards (adresse IP, agent utilisateur, page demandée) à des fins de sécurité et de prévention des abus, pendant une courte période, selon la",
    link: "politique de confidentialité de Cloudflare",
    after: ".",
  },
  fitTitle: "Lancer une analyse d'éligibilité",
  fitIntro: "Lorsque vous utilisez « Trouver mon aide », nous conservons ce que vous nous fournissez pour produire et conserver votre page de résultat :",
  fitItems: [
    "Le formulaire de profil d'entreprise, ainsi que l'adresse de site web, le PDF ou le texte à partir desquels vous nous avez demandé de le préremplir.",
    "Le résultat de l'analyse : appels correspondants, verdicts, lacunes de préparation.",
    "La date, les jetons de modèle utilisés pour le préremplissage et un identifiant de résultat aléatoire.",
  ],
  fitPrivate: "La page de résultat est privée, accessible uniquement par son lien aléatoire. Elle n'est ni listée, ni indexée, ni partagée. Quiconque possède le lien peut l'ouvrir : ne le partagez qu'avec des personnes de confiance. Votre navigateur conserve la liste de vos dix derniers résultats dans son stockage local ; cette liste ne quitte jamais votre appareil.",
  fitPrefill: {
    before: "Le préremplissage envoie le texte que vous fournissez à Google Gemini via Cloudflare AI Gateway. Il sert uniquement à remplir le formulaire et n'est pas utilisé pour entraîner un modèle. Voir la",
    link: "notice sur l'IA",
    after: ".",
  },
  fitTurnstile: "Le formulaire est protégé par Cloudflare Turnstile, qui vérifie qu'une personne, et non un script, le soumet. Turnstile fonctionne selon la politique de confidentialité de Cloudflare.",
  proTitle: "Comptes Pro",
  proAccount: {
    before: "Le paiement de Pro crée un compte associé à l'adresse e-mail que vous communiquez à Stripe. Nous conservons cette adresse, le forfait, les identifiants de session et de client Stripe, la raison sociale et le numéro de TVA si vous les avez saisis, ainsi que vos dates de connexion. Les données de carte ne nous parviennent jamais ; Stripe traite le paiement selon la",
    link: "politique de confidentialité de Stripe",
    after: " et émet le reçu et la facture. La connexion se fait par lien e-mail à usage unique ; un cookie signé vous maintient connecté pendant 90 jours sur ce navigateur. Les profils d'entreprise que vous enregistrez sont analysés chaque lundi et vous ne recevez un e-mail que lorsque de nouveaux appels passent les règles ; chaque e-mail contient un lien pour les arrêter. Écrivez-nous pour fermer le compte : les profils et les jetons de connexion sont supprimés, l'enregistrement de paiement est conservé aussi longtemps que la loi comptable l'exige.",
  },
  whereTitle: "Où sont stockées les données",
  whereBody: "Cloudflare D1 (base de données) et R2 (fichiers téléversés) sur le réseau européen de Cloudflare. Les appels au modèle sont transmis à Google via Cloudflare AI Gateway.",
  retentionTitle: "Durée de conservation",
  retentionBody: "Les analyses d'éligibilité sont conservées aussi longtemps que le lien de résultat doit fonctionner, et utilisées de manière agrégée pour améliorer les règles d'analyse. Écrivez-nous pour faire supprimer une analyse et ses fichiers téléversés ; indiquez-nous le lien de résultat. La suppression est effectuée sous 30 jours.",
  rightsTitle: "Vos droits",
  rights: {
    before: "En vertu du RGPD, vous pouvez demander ce que nous détenons à votre sujet, le faire corriger ou supprimer, et vous opposer à son utilisation. Écrivez à",
    after: ". Vous pouvez également introduire une réclamation auprès de votre autorité nationale de protection des données.",
  },
  ledgerTitle: "Le registre lui-même",
  ledgerBody: "Les fiches de financement sont des informations publiques publiées par des organismes publics. Elles peuvent nommer des personnes de contact chez les financeurs ; ces noms proviennent de la publication officielle et sont affichés tels que publiés. Demandez à l'éditeur de corriger sa fiche, ou écrivez-nous pour faire retirer un nom de notre copie.",
  changesTitle: "Modifications",
  changes: {
    before: "Cette page évolue avec le site. Le modèle actuellement utilisé pour le préremplissage est {model}. Le code source du site, y compris chaque endroit où des données sont stockées, est",
    link: "public",
    after: ".",
  },
};

const de: PrivacyContent = {
  metaTitle: "Datenschutz",
  metaDescription: "Was grantledger über Sie speichert, wo, wie lange und wie Sie es löschen lassen können.",
  kicker: "Datenschutz",
  title: "Datenschutz",
  lead: "Kurzfassung: Das Lesen des Registers speichert nichts über Sie. Eine Prüfung speichert privat, was Sie eingeben oder hochladen, damit ihre Ergebnisseite funktioniert. Ein Pro-Konto besteht aus einer E-Mail-Adresse und einem Zahlungsdatensatz. Keine Tracking-Cookies, keine Werbung, kein Weiterverkauf.",
  whoTitle: "Wer verantwortlich ist",
  whoOperates: "Aitek Labs betreibt grantledger.eu. Kontakt:",
  whoDetails: { before: "Die Angaben stehen im", link: "Impressum", after: "." },
  browsingTitle: "Das Register durchsuchen",
  browsingCookies: "Es werden keine Cookies gesetzt. Ihre Themenwahl wird im lokalen Speicher Ihres Browsers abgelegt und nie an uns übermittelt.",
  browsingAnalytics: "Auf der Website läuft kein Analyseskript.",
  browsingLogs: {
    before: "Die Seiten werden von Cloudflare ausgeliefert. Cloudflare führt für kurze Zeit übliche Serverprotokolle (IP-Adresse, User-Agent, aufgerufene Seite) zur Sicherheit und Missbrauchsverhinderung, gemäß der",
    link: "Datenschutzrichtlinie von Cloudflare",
    after: ".",
  },
  fitTitle: "Eine Eignungsprüfung durchführen",
  fitIntro: "Wenn Sie „Meine Förderung finden“ nutzen, speichern wir Ihre Angaben, um Ihre Ergebnisseite zu erstellen und aufzubewahren:",
  fitItems: [
    "Das Unternehmensprofil-Formular sowie die Website-Adresse, das PDF oder den Text, aus dem wir es auf Ihren Wunsch vorausgefüllt haben.",
    "Das Prüfergebnis: passende Ausschreibungen, Bewertungen, Lücken in der Antragsreife.",
    "Das Datum, die für das Vorausfüllen verwendeten Modell-Tokens und eine zufällige Ergebnis-ID.",
  ],
  fitPrivate: "Die Ergebnisseite ist privat und nur über ihren zufälligen Link erreichbar. Sie wird nicht aufgelistet, nicht indexiert und nicht geteilt. Wer den Link hat, kann sie öffnen; teilen Sie ihn daher nur mit Personen, denen Sie vertrauen. Ihr Browser speichert eine Liste Ihrer letzten zehn Ergebnisse im lokalen Speicher; diese Liste verlässt Ihr Gerät nie.",
  fitPrefill: {
    before: "Beim Vorausfüllen wird der von Ihnen bereitgestellte Text über Cloudflare AI Gateway an Google Gemini gesendet. Er dient nur dem Ausfüllen des Formulars und wird nicht zum Trainieren eines Modells verwendet. Siehe den",
    link: "KI-Hinweis",
    after: ".",
  },
  fitTurnstile: "Das Formular ist durch Cloudflare Turnstile geschützt, das prüft, ob eine Person und kein Skript es absendet. Turnstile unterliegt der Datenschutzrichtlinie von Cloudflare.",
  proTitle: "Pro-Konten",
  proAccount: {
    before: "Die Zahlung für Pro erstellt ein Konto unter der E-Mail-Adresse, die Sie Stripe angeben. Wir speichern diese Adresse, den Tarif, die Stripe-Sitzungs- und Kunden-IDs, den Firmennamen und die USt-IdNr., falls Sie sie eingegeben haben, sowie Ihre Anmeldedaten. Kartendaten erreichen uns nie; Stripe verarbeitet die Zahlung gemäß der",
    link: "Datenschutzrichtlinie von Stripe",
    after: " und stellt Beleg und Rechnung aus. Die Anmeldung erfolgt über einen einmalig gültigen E-Mail-Link; ein signiertes Cookie hält Sie in diesem Browser 90 Tage lang angemeldet. Gespeicherte Unternehmensprofile werden jeden Montag geprüft, und Sie erhalten nur dann eine E-Mail, wenn neue Ausschreibungen die Regeln erfüllen; jede E-Mail enthält einen Link zum Abbestellen. Schreiben Sie uns, um das Konto zu schließen: Profile und Anmelde-Tokens werden gelöscht, der Zahlungsdatensatz wird so lange aufbewahrt, wie das Rechnungslegungsrecht es verlangt.",
  },
  whereTitle: "Wo die Daten liegen",
  whereBody: "Cloudflare D1 (Datenbank) und R2 (hochgeladene Dateien) im europäischen Netz von Cloudflare. Modellaufrufe gehen über Cloudflare AI Gateway an Google.",
  retentionTitle: "Wie lange wir sie aufbewahren",
  retentionBody: "Eignungsprüfungen werden so lange aufbewahrt, wie der Ergebnislink funktionieren soll, und in aggregierter Form zur Verbesserung der Prüfregeln verwendet. Schreiben Sie uns, um eine Eignungsprüfung und ihre hochgeladenen Dateien löschen zu lassen; nennen Sie uns den Ergebnislink. Die Löschung erfolgt innerhalb von 30 Tagen.",
  rightsTitle: "Ihre Rechte",
  rights: {
    before: "Nach der DSGVO können Sie Auskunft darüber verlangen, was wir über Sie speichern, die Berichtigung oder Löschung verlangen und der Nutzung widersprechen. Schreiben Sie an",
    after: ". Sie können sich auch bei Ihrer nationalen Datenschutzbehörde beschweren.",
  },
  ledgerTitle: "Das Register selbst",
  ledgerBody: "Förderdatensätze sind öffentliche Informationen, die von öffentlichen Stellen veröffentlicht werden. Sie können Ansprechpersonen bei Fördergebern nennen; diese Namen stammen aus der amtlichen Veröffentlichung und werden so angezeigt, wie sie veröffentlicht wurden. Bitten Sie den Herausgeber, seinen Datensatz zu berichtigen, oder schreiben Sie uns, um einen Namen aus unserer Kopie entfernen zu lassen.",
  changesTitle: "Änderungen",
  changes: {
    before: "Diese Seite ändert sich mit der Website. Das derzeit für das Vorausfüllen verwendete Modell ist {model}. Der Quellcode der Website, einschließlich jeder Stelle, an der Daten gespeichert werden, ist",
    link: "öffentlich",
    after: ".",
  },
};

const es: PrivacyContent = {
  metaTitle: "Privacidad",
  metaDescription: "Qué almacena grantledger sobre usted, dónde, durante cuánto tiempo y cómo solicitar su eliminación.",
  kicker: "Privacidad",
  title: "Privacidad",
  lead: "En resumen: consultar el registro no almacena nada sobre usted. Un análisis almacena lo que usted escribe o sube, de forma privada, para que su página de resultado funcione. Una cuenta Pro es un correo electrónico y un registro de pago. Sin cookies de seguimiento, sin publicidad, sin reventa.",
  whoTitle: "Quién es el responsable",
  whoOperates: "Aitek Labs opera grantledger.eu. Contacto:",
  whoDetails: { before: "Los datos figuran en el", link: "aviso legal", after: "." },
  browsingTitle: "Consultar el registro",
  browsingCookies: "No se instala ninguna cookie. Su elección de tema se guarda en el almacenamiento local de su navegador y nunca se nos envía.",
  browsingAnalytics: "No se ejecuta ningún script de analítica en el sitio.",
  browsingLogs: {
    before: "Las páginas las sirve Cloudflare, que conserva registros de servidor estándar (dirección IP, agente de usuario, página solicitada) por seguridad y prevención de abusos, durante un breve periodo, conforme a la",
    link: "política de privacidad de Cloudflare",
    after: ".",
  },
  fitTitle: "Realizar un análisis de encaje",
  fitIntro: "Cuando utiliza «Encontrar mi ayuda», almacenamos lo que nos facilita para generar y conservar su página de resultado:",
  fitItems: [
    "El formulario de perfil de empresa y la dirección web, el PDF o el texto a partir de los cuales nos pidió rellenarlo previamente.",
    "El resultado del análisis: convocatorias coincidentes, veredictos, carencias de preparación.",
    "La fecha, los tokens de modelo usados para el rellenado previo y un identificador de resultado aleatorio.",
  ],
  fitPrivate: "La página de resultado es privada y solo accesible mediante su enlace aleatorio. No está listada, ni indexada, ni compartida. Cualquiera que tenga el enlace puede abrirla, así que compártalo solo con personas de confianza. Su navegador guarda una lista de sus últimos diez resultados en el almacenamiento local; esa lista nunca sale de su dispositivo.",
  fitPrefill: {
    before: "El rellenado previo envía el texto que usted proporciona a Google Gemini a través de Cloudflare AI Gateway. Se usa únicamente para rellenar el formulario y no se utiliza para entrenar ningún modelo. Consulte el",
    link: "aviso sobre IA",
    after: ".",
  },
  fitTurnstile: "El formulario está protegido por Cloudflare Turnstile, que comprueba que lo envía una persona y no un script. Turnstile funciona conforme a la política de privacidad de Cloudflare.",
  proTitle: "Cuentas Pro",
  proAccount: {
    before: "Pagar Pro crea una cuenta con el correo electrónico que usted facilita a Stripe. Almacenamos ese correo, el plan, los identificadores de sesión y de cliente de Stripe, el nombre de la empresa y el número de IVA si los introdujo, y sus fechas de inicio de sesión. Los datos de la tarjeta nunca nos llegan; Stripe procesa el pago conforme a la",
    link: "política de privacidad de Stripe",
    after: " y emite el recibo y la factura. El inicio de sesión se realiza mediante un enlace de correo de un solo uso; una cookie firmada le mantiene la sesión iniciada durante 90 días en ese navegador. Los perfiles de empresa que guarde se analizan cada lunes y solo recibe un correo cuando nuevas convocatorias superan las reglas; cada correo incluye un enlace para dejar de recibirlos. Escríbanos para cerrar la cuenta: los perfiles y los tokens de acceso se eliminan, y el registro de pago se conserva mientras lo exija la legislación contable.",
  },
  whereTitle: "Dónde se guardan los datos",
  whereBody: "Cloudflare D1 (base de datos) y R2 (archivos subidos) en la red europea de Cloudflare. Las llamadas al modelo van a Google a través de Cloudflare AI Gateway.",
  retentionTitle: "Cuánto tiempo los conservamos",
  retentionBody: "Los análisis de encaje se conservan mientras el enlace de resultado deba funcionar, y se usan de forma agregada para mejorar las reglas de análisis. Escríbanos para que eliminemos un análisis y sus archivos subidos; indíquenos el enlace de resultado. La eliminación se realiza en un plazo de 30 días.",
  rightsTitle: "Sus derechos",
  rights: {
    before: "En virtud del RGPD, puede solicitar qué datos tenemos sobre usted, pedir su corrección o eliminación y oponerse a su uso. Escriba a",
    after: ". También puede presentar una reclamación ante su autoridad nacional de protección de datos.",
  },
  ledgerTitle: "El propio registro",
  ledgerBody: "Las fichas de financiación son información pública publicada por organismos públicos. Pueden nombrar a personas de contacto de los financiadores; esos nombres proceden de la publicación oficial y se muestran tal como fueron publicados. Pida al editor que corrija su ficha, o escríbanos para que retiremos un nombre de nuestra copia.",
  changesTitle: "Cambios",
  changes: {
    before: "Esta página cambia cuando cambia el sitio. El modelo actualmente usado para el rellenado previo es {model}. El código fuente del sitio, incluido cada lugar donde se almacenan datos, es",
    link: "público",
    after: ".",
  },
};

const it: PrivacyContent = {
  metaTitle: "Privacy",
  metaDescription: "Cosa conserva grantledger su di voi, dove, per quanto tempo e come chiederne la rimozione.",
  kicker: "Privacy",
  title: "Privacy",
  lead: "In breve: consultare il registro non memorizza nulla su di voi. Una verifica memorizza ciò che digitate o caricate, in modo privato, affinché la sua pagina dei risultati funzioni. Un account Pro è un indirizzo e-mail e una registrazione di pagamento. Nessun cookie di tracciamento, nessuna pubblicità, nessuna rivendita.",
  whoTitle: "Chi è il responsabile",
  whoOperates: "Aitek Labs gestisce grantledger.eu. Contatto:",
  whoDetails: { before: "I dettagli sono nelle", link: "note legali", after: "." },
  browsingTitle: "Consultare il registro",
  browsingCookies: "Non viene impostato alcun cookie. La vostra scelta del tema è conservata nella memoria locale del browser e non ci viene mai inviata.",
  browsingAnalytics: "Sul sito non viene eseguito alcuno script di analisi.",
  browsingLogs: {
    before: "Le pagine sono servite da Cloudflare, che conserva i normali log del server (indirizzo IP, user agent, pagina richiesta) per sicurezza e prevenzione degli abusi, per un breve periodo, secondo la",
    link: "politica sulla privacy di Cloudflare",
    after: ".",
  },
  fitTitle: "Eseguire una verifica di idoneità",
  fitIntro: "Quando utilizzate «Trova il mio bando», conserviamo ciò che ci fornite per produrre e mantenere la vostra pagina dei risultati:",
  fitItems: [
    "Il modulo del profilo aziendale e l'indirizzo web, il PDF o il testo da cui ci avete chiesto di precompilarlo.",
    "Il risultato della verifica: bandi corrispondenti, esiti, lacune di preparazione.",
    "La data, i token del modello usati per la precompilazione e un identificativo casuale del risultato.",
  ],
  fitPrivate: "La pagina dei risultati è privata e accessibile solo tramite il suo link casuale. Non è elencata, non è indicizzata e non è condivisa. Chiunque abbia il link può aprirla, quindi condividetelo solo con persone di fiducia. Il vostro browser conserva un elenco degli ultimi dieci risultati nella memoria locale; quell'elenco non lascia mai il vostro dispositivo.",
  fitPrefill: {
    before: "La precompilazione invia il testo che fornite a Google Gemini tramite Cloudflare AI Gateway. Viene usato solo per compilare il modulo e non per addestrare alcun modello. Consultate la",
    link: "nota sull'IA",
    after: ".",
  },
  fitTurnstile: "Il modulo è protetto da Cloudflare Turnstile, che verifica che a inviarlo sia una persona e non uno script. Turnstile opera secondo la politica sulla privacy di Cloudflare.",
  proTitle: "Account Pro",
  proAccount: {
    before: "Il pagamento di Pro crea un account associato all'e-mail che fornite a Stripe. Conserviamo quell'e-mail, il piano, gli identificativi di sessione e cliente di Stripe, la ragione sociale e la partita IVA se le avete inserite, e le date di accesso. I dati della carta non ci raggiungono mai; Stripe elabora il pagamento secondo la",
    link: "politica sulla privacy di Stripe",
    after: " ed emette la ricevuta e la fattura. L'accesso avviene tramite un link e-mail monouso; un cookie firmato vi mantiene connessi per 90 giorni su quel browser. I profili aziendali che salvate vengono verificati ogni lunedì e ricevete un'e-mail solo quando nuovi bandi superano le regole; ogni e-mail contiene un link per interromperle. Scriveteci per chiudere l'account: profili e token di accesso vengono eliminati, la registrazione di pagamento è conservata per il tempo richiesto dalla normativa contabile.",
  },
  whereTitle: "Dove risiedono i dati",
  whereBody: "Cloudflare D1 (database) e R2 (file caricati) sulla rete europea di Cloudflare. Le chiamate al modello vanno a Google tramite Cloudflare AI Gateway.",
  retentionTitle: "Per quanto tempo li conserviamo",
  retentionBody: "Le verifiche di idoneità sono conservate per tutto il tempo in cui il link del risultato deve funzionare, e usate in forma aggregata per migliorare le regole di verifica. Scriveteci per far eliminare una verifica e i suoi file caricati; indicateci il link del risultato. L'eliminazione avviene entro 30 giorni.",
  rightsTitle: "I vostri diritti",
  rights: {
    before: "Ai sensi del GDPR potete chiedere quali dati conserviamo su di voi, farli correggere o eliminare e opporvi al loro uso. Scrivete a",
    after: ". Potete anche presentare reclamo alla vostra autorità nazionale per la protezione dei dati.",
  },
  ledgerTitle: "Il registro stesso",
  ledgerBody: "Le schede di finanziamento sono informazioni pubbliche pubblicate da enti pubblici. Possono indicare persone di contatto presso i finanziatori; quei nomi provengono dalla pubblicazione ufficiale e sono mostrati come pubblicati. Chiedete all'editore di correggere la sua scheda, oppure scriveteci per far rimuovere un nome dalla nostra copia.",
  changesTitle: "Modifiche",
  changes: {
    before: "Questa pagina cambia quando cambia il sito. Il modello attualmente usato per la precompilazione è {model}. Il codice sorgente del sito, compreso ogni punto in cui vengono memorizzati dati, è",
    link: "pubblico",
    after: ".",
  },
};

const pt: PrivacyContent = {
  metaTitle: "Privacidade",
  metaDescription: "O que o grantledger guarda sobre si, onde, durante quanto tempo e como pedir a sua remoção.",
  kicker: "Privacidade",
  title: "Privacidade",
  lead: "Em resumo: consultar o registo não guarda nada sobre si. Uma análise guarda o que escreve ou carrega, de forma privada, para que a sua página de resultado funcione. Uma conta Pro é um e-mail e um registo de pagamento. Sem cookies de rastreio, sem publicidade, sem revenda.",
  whoTitle: "Quem é o responsável",
  whoOperates: "A Aitek Labs opera o grantledger.eu. Contacto:",
  whoDetails: { before: "Os dados constam do", link: "aviso legal", after: "." },
  browsingTitle: "Consultar o registo",
  browsingCookies: "Não são definidos cookies. A sua escolha de tema é guardada no armazenamento local do seu navegador e nunca nos é enviada.",
  browsingAnalytics: "Nenhum script de análise é executado no site.",
  browsingLogs: {
    before: "As páginas são servidas pela Cloudflare, que mantém registos de servidor padrão (endereço IP, agente de utilizador, página pedida) para segurança e prevenção de abusos, durante um curto período, ao abrigo da",
    link: "política de privacidade da Cloudflare",
    after: ".",
  },
  fitTitle: "Executar uma verificação de adequação",
  fitIntro: "Quando utiliza «Encontrar o meu apoio», guardamos o que nos fornece para produzir e manter a sua página de resultado:",
  fitItems: [
    "O formulário de perfil da empresa e o endereço do site, o PDF ou o texto a partir dos quais nos pediu para o preencher previamente.",
    "O resultado da análise: candidaturas correspondentes, veredictos, lacunas de preparação.",
    "A data, os tokens de modelo usados no preenchimento prévio e um identificador de resultado aleatório.",
  ],
  fitPrivate: "A página de resultado é privada e acessível apenas pela sua ligação aleatória. Não está listada, indexada nem partilhada. Quem tiver a ligação pode abri-la, pelo que deve partilhá-la apenas com pessoas de confiança. O seu navegador guarda uma lista dos seus últimos dez resultados no armazenamento local; essa lista nunca sai do seu dispositivo.",
  fitPrefill: {
    before: "O preenchimento prévio envia o texto que fornece ao Google Gemini através do Cloudflare AI Gateway. É usado apenas para preencher o formulário e não para treinar qualquer modelo. Consulte o",
    link: "aviso sobre IA",
    after: ".",
  },
  fitTurnstile: "O formulário é protegido pelo Cloudflare Turnstile, que verifica que é uma pessoa, e não um script, a submetê-lo. O Turnstile funciona ao abrigo da política de privacidade da Cloudflare.",
  proTitle: "Contas Pro",
  proAccount: {
    before: "Pagar o Pro cria uma conta com o e-mail que fornece à Stripe. Guardamos esse e-mail, o plano, os identificadores de sessão e de cliente da Stripe, o nome da empresa e o número de IVA se os tiver introduzido, e as suas datas de início de sessão. Os dados do cartão nunca nos chegam; a Stripe processa o pagamento ao abrigo da",
    link: "política de privacidade da Stripe",
    after: " e emite o recibo e a fatura. O início de sessão faz-se por ligação de e-mail de utilização única; um cookie assinado mantém a sessão iniciada durante 90 dias nesse navegador. Os perfis de empresa que guardar são analisados todas as segundas-feiras e só recebe um e-mail quando novas candidaturas passam as regras; cada e-mail tem uma ligação para os parar. Escreva-nos para encerrar a conta: os perfis e os tokens de acesso são eliminados, e o registo de pagamento é mantido enquanto a legislação contabilística o exigir.",
  },
  whereTitle: "Onde ficam os dados",
  whereBody: "Cloudflare D1 (base de dados) e R2 (ficheiros carregados) na rede europeia da Cloudflare. As chamadas ao modelo vão para a Google através do Cloudflare AI Gateway.",
  retentionTitle: "Durante quanto tempo os guardamos",
  retentionBody: "As verificações de adequação são mantidas enquanto a ligação de resultado dever funcionar, e usadas de forma agregada para melhorar as regras de análise. Escreva-nos para eliminar uma verificação e os seus ficheiros carregados; indique-nos a ligação de resultado. A eliminação é feita no prazo de 30 dias.",
  rightsTitle: "Os seus direitos",
  rights: {
    before: "Ao abrigo do RGPD, pode perguntar que dados temos sobre si, pedir a sua correção ou eliminação e opor-se à sua utilização. Escreva para",
    after: ". Pode também apresentar uma reclamação junto da sua autoridade nacional de proteção de dados.",
  },
  ledgerTitle: "O próprio registo",
  ledgerBody: "Os registos de financiamento são informação pública publicada por entidades públicas. Podem indicar pessoas de contacto nos financiadores; esses nomes provêm da publicação oficial e são mostrados tal como publicados. Peça ao editor que corrija o seu registo, ou escreva-nos para remover um nome da nossa cópia.",
  changesTitle: "Alterações",
  changes: {
    before: "Esta página muda quando o site muda. O modelo atualmente usado para o preenchimento prévio é {model}. O código-fonte do site, incluindo cada local onde são guardados dados, é",
    link: "público",
    after: ".",
  },
};

const nl: PrivacyContent = {
  metaTitle: "Privacy",
  metaDescription: "Wat grantledger over u opslaat, waar, hoe lang en hoe u het kunt laten verwijderen.",
  kicker: "Privacy",
  title: "Privacy",
  lead: "Kort gezegd: het register lezen slaat niets over u op. Een screening slaat privé op wat u typt of uploadt, zodat de resultaatpagina werkt. Een Pro-account is een e-mailadres en een betaalrecord. Geen trackingcookies, geen advertenties, geen doorverkoop.",
  whoTitle: "Wie verantwoordelijk is",
  whoOperates: "Aitek Labs beheert grantledger.eu. Contact:",
  whoDetails: { before: "De gegevens staan in de", link: "juridische kennisgeving", after: "." },
  browsingTitle: "Het register raadplegen",
  browsingCookies: "Er worden geen cookies geplaatst. Uw themakeuze wordt bewaard in de lokale opslag van uw browser en nooit naar ons verzonden.",
  browsingAnalytics: "Er draait geen analysescript op de site.",
  browsingLogs: {
    before: "De pagina's worden geleverd door Cloudflare, dat voor korte tijd standaard serverlogs bijhoudt (IP-adres, user agent, opgevraagde pagina) voor beveiliging en misbruikpreventie, volgens het",
    link: "privacybeleid van Cloudflare",
    after: ".",
  },
  fitTitle: "Een geschiktheidscheck uitvoeren",
  fitIntro: "Wanneer u \"Mijn subsidie vinden\" gebruikt, slaan wij op wat u ons geeft om uw resultaatpagina te maken en te bewaren:",
  fitItems: [
    "Het bedrijfsprofielformulier en het websiteadres, de PDF of de tekst waaruit u ons vroeg het vooraf in te vullen.",
    "Het screeningresultaat: passende oproepen, oordelen, hiaten in de gereedheid.",
    "De datum, de modeltokens die voor het vooraf invullen zijn gebruikt en een willekeurige resultaat-id.",
  ],
  fitPrivate: "De resultaatpagina is privé en alleen bereikbaar via de willekeurige link. Ze wordt niet vermeld, niet geïndexeerd en niet gedeeld. Iedereen met de link kan ze openen, deel de link dus alleen met mensen die u vertrouwt. Uw browser bewaart een lijst van uw laatste tien resultaten in de lokale opslag; die lijst verlaat uw apparaat nooit.",
  fitPrefill: {
    before: "Bij het vooraf invullen wordt de tekst die u aanlevert via Cloudflare AI Gateway naar Google Gemini gestuurd. Die wordt alleen gebruikt om het formulier in te vullen en niet om een model te trainen. Zie de",
    link: "AI-kennisgeving",
    after: ".",
  },
  fitTurnstile: "Het formulier wordt beschermd door Cloudflare Turnstile, dat controleert of een persoon, en geen script, het verzendt. Turnstile valt onder het privacybeleid van Cloudflare.",
  proTitle: "Pro-accounts",
  proAccount: {
    before: "Betalen voor Pro maakt een account aan onder het e-mailadres dat u aan Stripe opgeeft. Wij slaan dat e-mailadres op, het abonnement, de Stripe-sessie- en klant-id's, de bedrijfsnaam en het btw-nummer als u die hebt ingevuld, en uw aanmelddatums. Kaartgegevens bereiken ons nooit; Stripe verwerkt de betaling volgens het",
    link: "privacybeleid van Stripe",
    after: " en geeft het betaalbewijs en de factuur uit. Aanmelden gebeurt via een e-maillink voor eenmalig gebruik; een ondertekende cookie houdt u 90 dagen aangemeld in die browser. Bedrijfsprofielen die u opslaat worden elke maandag gescreend en u ontvangt alleen een e-mail wanneer nieuwe oproepen aan de regels voldoen; elke e-mail bevat een link om ze te stoppen. Schrijf ons om het account te sluiten: profielen en aanmeldtokens worden verwijderd, het betaalrecord wordt bewaard zolang de boekhoudwetgeving dat vereist.",
  },
  whereTitle: "Waar de gegevens staan",
  whereBody: "Cloudflare D1 (database) en R2 (geüploade bestanden) op het Europese netwerk van Cloudflare. Modelaanroepen gaan via Cloudflare AI Gateway naar Google.",
  retentionTitle: "Hoe lang wij ze bewaren",
  retentionBody: "Geschiktheidschecks worden bewaard zolang de resultaatlink moet werken, en geaggregeerd gebruikt om de screeningregels te verbeteren. Schrijf ons om een geschiktheidscheck en de bijbehorende uploads te laten verwijderen; geef ons de resultaatlink. Verwijdering gebeurt binnen 30 dagen.",
  rightsTitle: "Uw rechten",
  rights: {
    before: "Onder de AVG kunt u opvragen wat wij over u bewaren, het laten corrigeren of verwijderen en bezwaar maken tegen het gebruik ervan. Schrijf naar",
    after: ". U kunt ook een klacht indienen bij uw nationale gegevensbeschermingsautoriteit.",
  },
  ledgerTitle: "Het register zelf",
  ledgerBody: "Financieringsrecords zijn openbare informatie die door overheidsinstanties wordt gepubliceerd. Ze kunnen contactpersonen bij financiers noemen; die namen komen uit de officiële publicatie en worden getoond zoals gepubliceerd. Vraag de uitgever zijn record te corrigeren, of schrijf ons om een naam uit onze kopie te laten verwijderen.",
  changesTitle: "Wijzigingen",
  changes: {
    before: "Deze pagina verandert wanneer de site verandert. Het model dat momenteel voor het vooraf invullen wordt gebruikt is {model}. De broncode van de site, inclusief elke plek waar gegevens worden opgeslagen, is",
    link: "openbaar",
    after: ".",
  },
};

const pl: PrivacyContent = {
  metaTitle: "Prywatność",
  metaDescription: "Co grantledger przechowuje na Twój temat, gdzie, jak długo i jak to usunąć.",
  kicker: "Prywatność",
  title: "Prywatność",
  lead: "W skrócie: przeglądanie rejestru nie zapisuje niczego na Twój temat. Analiza zapisuje prywatnie to, co wpisujesz lub przesyłasz, aby działała jej strona wyniku. Konto Pro to adres e-mail i zapis płatności. Bez ciasteczek śledzących, bez reklam, bez odsprzedaży.",
  whoTitle: "Kto jest odpowiedzialny",
  whoOperates: "Aitek Labs prowadzi grantledger.eu. Kontakt:",
  whoDetails: { before: "Szczegóły znajdują się w", link: "nocie prawnej", after: "." },
  browsingTitle: "Przeglądanie rejestru",
  browsingCookies: "Nie ustawiamy żadnych ciasteczek. Twój wybór motywu jest przechowywany w pamięci lokalnej przeglądarki i nigdy nie jest do nas wysyłany.",
  browsingAnalytics: "Na stronie nie działa żaden skrypt analityczny.",
  browsingLogs: {
    before: "Strony są serwowane przez Cloudflare, który przez krótki czas przechowuje standardowe logi serwera (adres IP, user agent, żądana strona) w celach bezpieczeństwa i zapobiegania nadużyciom, zgodnie z",
    link: "polityką prywatności Cloudflare",
    after: ".",
  },
  fitTitle: "Uruchamianie analizy dopasowania",
  fitIntro: "Gdy korzystasz z funkcji „Znajdź moją dotację”, zapisujemy to, co nam przekazujesz, aby utworzyć i zachować Twoją stronę wyniku:",
  fitItems: [
    "Formularz profilu firmy oraz adres strony internetowej, PDF lub tekst, na podstawie których mieliśmy go wstępnie wypełnić.",
    "Wynik analizy: dopasowane nabory, werdykty, braki w gotowości.",
    "Datę, tokeny modelu zużyte na wstępne wypełnienie oraz losowy identyfikator wyniku.",
  ],
  fitPrivate: "Strona wyniku jest prywatna i dostępna tylko przez losowy link. Nie jest wyświetlana na listach, indeksowana ani udostępniana. Każdy, kto ma link, może ją otworzyć, dlatego udostępniaj go tylko zaufanym osobom. Twoja przeglądarka przechowuje listę dziesięciu ostatnich wyników w pamięci lokalnej; ta lista nigdy nie opuszcza Twojego urządzenia.",
  fitPrefill: {
    before: "Wstępne wypełnianie wysyła podany przez Ciebie tekst do Google Gemini przez Cloudflare AI Gateway. Jest on używany wyłącznie do wypełnienia formularza i nie służy do trenowania żadnego modelu. Zobacz",
    link: "notę o AI",
    after: ".",
  },
  fitTurnstile: "Formularz jest chroniony przez Cloudflare Turnstile, który sprawdza, czy wysyła go człowiek, a nie skrypt. Turnstile działa zgodnie z polityką prywatności Cloudflare.",
  proTitle: "Konta Pro",
  proAccount: {
    before: "Opłacenie Pro tworzy konto powiązane z adresem e-mail podanym w Stripe. Przechowujemy ten adres, plan, identyfikatory sesji i klienta Stripe, nazwę firmy i numer VAT, jeśli zostały podane, oraz daty logowania. Dane karty nigdy do nas nie trafiają; Stripe przetwarza płatność zgodnie z",
    link: "polityką prywatności Stripe",
    after: " i wystawia potwierdzenie oraz fakturę. Logowanie odbywa się przez jednorazowy link e-mail; podpisane ciasteczko utrzymuje zalogowanie przez 90 dni w tej przeglądarce. Zapisane profile firm są analizowane w każdy poniedziałek, a e-mail otrzymujesz tylko wtedy, gdy nowe nabory przejdą reguły; każdy e-mail zawiera link do ich wyłączenia. Napisz do nas, aby zamknąć konto: profile i tokeny logowania są usuwane, a zapis płatności jest przechowywany tak długo, jak wymaga tego prawo rachunkowe.",
  },
  whereTitle: "Gdzie znajdują się dane",
  whereBody: "Cloudflare D1 (baza danych) i R2 (przesłane pliki) w europejskiej sieci Cloudflare. Wywołania modelu trafiają do Google przez Cloudflare AI Gateway.",
  retentionTitle: "Jak długo je przechowujemy",
  retentionBody: "Analizy dopasowania są przechowywane tak długo, jak długo ma działać link do wyniku, i wykorzystywane w formie zagregowanej do ulepszania reguł analizy. Napisz do nas, aby usunąć analizę i przesłane do niej pliki; podaj link do wyniku. Usunięcie następuje w ciągu 30 dni.",
  rightsTitle: "Twoje prawa",
  rights: {
    before: "Na mocy RODO możesz zapytać, jakie dane o Tobie przechowujemy, zażądać ich poprawienia lub usunięcia oraz sprzeciwić się ich wykorzystaniu. Napisz na adres",
    after: ". Możesz też złożyć skargę do krajowego organu ochrony danych.",
  },
  ledgerTitle: "Sam rejestr",
  ledgerBody: "Rekordy finansowania to informacje publiczne publikowane przez podmioty publiczne. Mogą wskazywać osoby kontaktowe u instytucji finansujących; te nazwiska pochodzą z oficjalnej publikacji i są wyświetlane w opublikowanej formie. Poproś wydawcę o poprawienie jego rekordu lub napisz do nas, aby usunąć nazwisko z naszej kopii.",
  changesTitle: "Zmiany",
  changes: {
    before: "Ta strona zmienia się wraz ze stroną internetową. Model obecnie używany do wstępnego wypełniania to {model}. Kod źródłowy strony, w tym każde miejsce, w którym przechowywane są dane, jest",
    link: "publiczny",
    after: ".",
  },
};

export const privacy: Record<string, PrivacyContent> = { en, fr, de, es, it, pt, nl, pl };
