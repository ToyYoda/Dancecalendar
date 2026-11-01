import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { Layout } from "./layout";

// Impressum (§ 18 MStV), privacy policy, Terms of Use and data deletion, in German and with ?lang=en in English.
// The operator's name, address and email are Worker secrets, so they stay out of the public repo.
// Sources and the pre-launch checklist: .scratch/dance-calendar-mvp/research/legal-requirements.md
// The retention periods here must match retention.ts, tips.tsx and application.tsx.

type Lang = "de" | "en";
type Operator = { name: string; address: string[]; email: string };

export const legalPages = new Hono<{ Bindings: Env }>();

const PAGES: Record<string, { de: string; en: string; body: (op: Operator, lang: Lang) => Child }> = {
  "/impressum": { de: "Impressum", en: "Imprint", body: (op, lang) => (lang === "en" ? <ImprintEn op={op} /> : <ImpressumDe op={op} />) },
  "/datenschutz": { de: "Datenschutzerklärung", en: "Privacy policy", body: (op, lang) => (lang === "en" ? <PrivacyEn op={op} /> : <PrivacyDe op={op} />) },
  "/nutzungsbedingungen": { de: "Nutzungsbedingungen", en: "Terms of Use", body: (op, lang) => (lang === "en" ? <TermsEn op={op} /> : <TermsDe op={op} />) },
  "/datenloeschung": { de: "Datenlöschung", en: "Data deletion", body: (op, lang) => (lang === "en" ? <DeletionEn op={op} /> : <DeletionDe op={op} />) },
};

const UPDATED = { de: "Stand: 1. November 2026", en: "Last updated: 1 November 2026" }; // bump when the text changes

const CSS = `
  main li { border: 0; padding: .25rem 0; }
  main ul { list-style: disc; padding-left: 1.25rem; }
  .lang { float: right; }
  .box { border: 2px solid #333; padding: .5rem 1rem; margin: 1rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  td, th { border: 1px solid #ccc; padding: .3rem .4rem; text-align: left; vertical-align: top; }
`;

for (const [path, page] of Object.entries(PAGES)) {
  legalPages.get(path, (c) => {
    const lang: Lang = c.req.query("lang") === "en" ? "en" : "de";
    const op = operator(c.env);
    return c.html(
      <Layout title={`${page[lang]} – DanceCalendar`} lang={lang} head={<style>{CSS}</style>}>
        <a class="lang" href={lang === "en" ? path : `${path}?lang=en`}>
          {lang === "en" ? "Deutsch" : "English"}
        </a>
        <h1>{page[lang]}</h1>
        <main>{page.body(op, lang)}</main>
        <p>
          <small>{UPDATED[lang]}</small>
        </p>
      </Layout>,
    );
  });
}

function operator(env: Env): Operator {
  if (!env.OPERATOR_NAME || !env.OPERATOR_ADDRESS || !env.CONTACT_EMAIL) console.warn("legal pages: OPERATOR_NAME, OPERATOR_ADDRESS or CONTACT_EMAIL not set");
  return {
    name: env.OPERATOR_NAME ?? "",
    address: (env.OPERATOR_ADDRESS ?? "").split(",").map((s) => s.trim()),
    email: env.CONTACT_EMAIL ?? "",
  };
}

function Address(props: { op: Operator }) {
  return (
    <p>
      {props.op.name}
      {props.op.address.map((line) => (
        <>
          <br />
          {line}
        </>
      ))}
    </p>
  );
}

function Mail(props: { op: Operator }) {
  return <a href={`mailto:${props.op.email}`}>{props.op.email}</a>;
}

const HBDI = (
  <>
    Der Hessische Beauftragte für Datenschutz und Informationsfreiheit, Gustav-Stresemann-Ring 1, 65189 Wiesbaden,{" "}
    <a href="https://datenschutz.hessen.de">datenschutz.hessen.de</a>
  </>
);

// ---------- Impressum ----------

function ImpressumDe(props: { op: Operator }) {
  return (
    <>
      <h2>Angaben gemäß § 18 Abs. 1 MStV und § 5 DDG</h2>
      <Address op={props.op} />
      <h2>Kontakt</h2>
      <p>
        E-Mail: <Mail op={props.op} />
      </p>
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <Address op={props.op} />
      <p>
        DanceCalendar ist ein privates, kostenloses und nicht kommerzielles Angebot. Die Events tragen Veranstalter*innen selbst ein oder die Community
        schickt sie als Tipp; für ihre Angaben sind die Veranstalter*innen verantwortlich.
      </p>
      <h2 id="melden">Event melden oder entfernen lassen</h2>
      <p>
        Stimmt ein Event nicht, verletzt es Rechte (z. B. an einem Flyer oder Foto) oder bist du darauf genannt und möchtest das nicht? Schreib an{" "}
        <Mail op={props.op} /> mit dem Link zum Event. Wir prüfen das schnell und entfernen, was nicht hierher gehört.
      </p>
    </>
  );
}

function ImprintEn(props: { op: Operator }) {
  return (
    <>
      <h2>Information under § 18(1) MStV and § 5 DDG</h2>
      <Address op={props.op} />
      <h2>Contact</h2>
      <p>
        Email: <Mail op={props.op} />
      </p>
      <h2>Responsible for content under § 18(2) MStV</h2>
      <Address op={props.op} />
      <p>
        DanceCalendar is a private, free and non-commercial service. Events are added by their Organizers or sent in by the community as Tips; Organizers are
        responsible for what they post.
      </p>
      <h2 id="melden">Report an Event or have it removed</h2>
      <p>
        Is an Event wrong, does it infringe someone's rights (for example in a Flyer or photo), or are you named on it and don't want to be? Write to{" "}
        <Mail op={props.op} /> with the link to the Event. We check quickly and remove what doesn't belong here.
      </p>
      <p>The German version of this page is the binding one.</p>
    </>
  );
}

// ---------- Privacy policy ----------

function PrivacyDe(props: { op: Operator }) {
  const op = props.op;
  return (
    <>
      <p>
        DanceCalendar zeigt Partnertanz-Events (Salsa, Bachata, West Coast Swing, Kizomba, Urban Kiz …) rund um Kassel und Göttingen. Hier steht, welche
        personenbezogenen Daten dabei verarbeitet werden, warum und wie lange.
      </p>

      <h2>1. Verantwortlicher</h2>
      <Address op={op} />
      <p>
        E-Mail: <Mail op={op} />. Eine Datenschutzbeauftragte ist nicht vorgeschrieben und nicht benannt.
      </p>

      <h2>2. Kurz gesagt</h2>
      <ul>
        <li>
          Keine Cookies, kein Tracking, keine Analyse- oder Werbedienste. Darum gibt es kein Cookie-Banner. Inhalte Dritter lädt nur die Karte zum
          Ortwählen, und erst, wenn du sie öffnest (Abschnitt 3).
        </li>
        <li>Tänzer*innen brauchen kein Konto. Filter stehen nur in der Adresse (URL) der Seite.</li>
        <li>Telefonnummern und wer einen Tipp geschickt hat, erscheinen nie öffentlich.</li>
      </ul>

      <h2>3. Website besuchen</h2>
      <p>
        Beim Aufruf verarbeitet unser Hoster Cloudflare technisch nötige Daten wie IP-Adresse, Browser, aufgerufene Adresse und Zeitpunkt, um die Seite
        auszuliefern und vor Angriffen zu schützen. Fehler- und Zugriffsprotokolle werden nach höchstens 7 Tagen gelöscht. Rechtsgrundlage: Art. 6 Abs. 1
        lit. f DSGVO (sicherer Betrieb der Website).
      </p>
      <p>
        Damit Entfernungen von dir aus gelten, fragt die Seite deinen Browser nach deinem Standort; der Browser fragt dich um Erlaubnis. Gibst du ihn frei,
        stehen die auf etwa einen Kilometer gerundeten Koordinaten in der Adresse der Seite. Sie dienen nur dem Filter nach Entfernung und werden nicht
        gespeichert. Ohne Freigabe siehst du alle Events ohne Entfernungen.
      </p>
      <p>
        Öffnest du „Auf Karte wählen“, lädt dein Browser Kartenbilder von OpenFreeMap (openfreemap.org). Dabei erhält OpenFreeMap deine IP-Adresse und die
        Kartenausschnitte, die du ansiehst. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (die von dir gewählte Karte anzeigen). Ohne Öffnen der Karte wird
        nichts dorthin übertragen.
      </p>

      <h2>4. Der WhatsApp-Bot</h2>
      <p>
        Wenn du dem Bot schreibst, verarbeiten wir deine Telefonnummer, deine Nachrichten und die Flyer, die du schickst, um daraus Events zu machen und dir zu
        antworten. Rechtsgrundlage für Veranstalter*innen ist Art. 6 Abs. 1 lit. b DSGVO (Nutzung nach den <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>
        ), für alle anderen Art. 6 Abs. 1 lit. f DSGVO (unser Interesse, den Kalender zu betreiben und Tipps anzunehmen).
      </p>
      <p>
        Die Nachrichten laufen über WhatsApp Ireland Limited (Meta), das sie für uns als Auftragsverarbeiter überträgt. Einige Daten (z. B. Metadaten deiner
        Nutzung) verarbeitet WhatsApp in eigener Verantwortung, siehe die{" "}
        <a href="https://www.whatsapp.com/legal/privacy-policy-eea">Datenschutzrichtlinie von WhatsApp</a>.
      </p>
      <p>
        Schreibst du „Admin“, speichern wir deine Nummer, damit sich der Admin bei dir meldet. Mit <strong>STOP</strong> bekommst du keine Nachrichten mehr;
        dass du STOP geschrieben hast, merken wir uns, damit es dabei bleibt.
      </p>

      <h2>5. Flyer lesen mit KI</h2>
      <p>
        Den Flyer liest ein KI-Modell von Anthropic aus (Titel, Datum, Uhrzeit, Ort, Stil). Dafür geht das Bild an Anthropic. Anthropic nutzt die Daten nicht
        zum Training seiner Modelle und löscht sie nach kurzer Zeit. Das Ergebnis prüfst du (oder bei Tipps der Admin), bevor es veröffentlicht wird. Es gibt
        keine automatisierte Entscheidung im Sinne von Art. 22 DSGVO.
      </p>

      <h2>6. Veranstalter*innen</h2>
      <p>
        Bei der Anmeldung speichern wir deinen Anzeigenamen (öffentlich bei deinen Events), deinen Vornamen (nur für den Admin) und deine WhatsApp-Nummer (nie
        öffentlich). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Die Daten bleiben, solange du angemeldet bist. Hörst du auf oder wirst du entfernt, löschen
        wir deine künftigen Events sofort und deine übrigen Daten spätestens nach 3 Monaten. Wird eine Nummer wegen eines Verstoßes gesperrt, behalten wir nur
        die Nummer, damit die Sperre wirkt (Art. 6 Abs. 1 lit. f DSGVO).
      </p>

      <h2>7. Tipps</h2>
      <p>
        Schickst du einen Flyer, der nicht von dir ist, prüft ihn der Admin. Wer den Tipp geschickt hat, wird nie gezeigt. Wird er freigegeben, erscheint das
        Event mit dem Flyer und dem Hinweis „von der Community hinzugefügt“. Nicht bearbeitete Tipps und deine Antwort „ist ein Tipp“ löschen wir nach 30 Tagen.
      </p>

      <h2>8. Veröffentlichte Events und Personen auf Flyern</h2>
      <p>
        Events zeigen, was auf dem Flyer steht, und den Flyer selbst. Darauf können Namen oder Fotos von Lehrer*innen, DJs oder Gästen sein. Diese Daten stammen
        vom Flyer, den Veranstalter*innen oder die Community geschickt haben (Art. 14 DSGVO). Wir zeigen sie nur beim jeweiligen Event, nie auf Personenseiten
        oder in einer Personensuche. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (öffentlich angekündigte Events auffindbar machen). Möchtest du nicht genannt
        oder gezeigt werden, schreib uns; wir entfernen dich umgehend.
      </p>

      <h2>9. Orte finden</h2>
      <p>
        Um die Entfernung zu einem Ort zu berechnen, schicken wir Name und Adresse des Veranstaltungsorts (keine Daten über dich) an die Geodienste Photon
        (komoot GmbH, Deutschland) und Nominatim (OpenStreetMap Foundation, Vereinigtes Königreich, für das ein Angemessenheitsbeschluss der EU gilt).
      </p>

      <h2>10. Empfänger und Übermittlung in Drittländer</h2>
      <table>
        <tr>
          <th>Dienst</th>
          <th>Wofür</th>
          <th>Absicherung</th>
        </tr>
        <tr>
          <td>Cloudflare, Inc. (USA)</td>
          <td>Hosting, Datenbank und Flyer-Speicher (gespeichert in der EU), E-Mail an den Admin</td>
          <td>Auftragsverarbeitungsvertrag; EU-US Data Privacy Framework und EU-Standardvertragsklauseln</td>
        </tr>
        <tr>
          <td>Anthropic (USA)</td>
          <td>Flyer mit KI lesen</td>
          <td>Auftragsverarbeitungsvertrag mit EU-Standardvertragsklauseln</td>
        </tr>
        <tr>
          <td>WhatsApp Ireland Limited (Irland)</td>
          <td>Nachrichten des Bots</td>
          <td>WhatsApp Business Data Processing Terms; für Unterauftragnehmer in den USA Data Privacy Framework bzw. Standardvertragsklauseln</td>
        </tr>
      </table>

      <h2>11. Speicherdauer</h2>
      <ul>
        <li>Events und ihre Flyer: bis 90 Tage nach dem Termin.</li>
        <li>Eingereichte Flyer, die veröffentlicht oder verworfen wurden: 90 Tage; nie bestätigte Flyer: 30 Tage.</li>
        <li>Flyer einer nicht abgeschlossenen Anmeldung: 24 Stunden.</li>
        <li>Tipps und die Antwort „ist ein Tipp“: 30 Tage.</li>
        <li>„Admin“-Anfragen: 90 Tage. Kennungen eingehender Nachrichten (gegen doppelte Zustellung): 7 Tage.</li>
        <li>Dass wir dich begrüßt haben und ob du STOP geschrieben hast: solange der Bot läuft, auf Wunsch löschen wir es.</li>
        <li>Wöchentliche Sicherungen der Datenbank werden nach 8 Wochen überschrieben. Gelöschte Daten verschwinden spätestens dann auch dort.</li>
      </ul>

      <h2>12. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und
        Datenübertragbarkeit (Art. 20). Schreib dazu an <Mail op={op} />; wir antworten innerhalb eines Monats. Siehe auch{" "}
        <a href="/datenloeschung">Datenlöschung</a>.
      </p>
      <div class="box">
        <strong>Widerspruchsrecht (Art. 21 DSGVO):</strong> Soweit wir Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeiten, kannst du jederzeit aus
        Gründen, die sich aus deiner besonderen Situation ergeben, widersprechen – zum Beispiel, wenn du auf einem Event genannt oder gezeigt wirst. Wir
        verarbeiten die Daten dann nicht mehr, es sei denn, es gibt zwingende schutzwürdige Gründe.
      </div>
      <p>Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei: {HBDI}.</p>

      <h2>13. Pflicht zur Angabe</h2>
      <p>Du musst uns keine Daten geben. Ohne deine Telefonnummer kannst du den Bot aber nicht nutzen; den Kalender ansehen kannst du immer.</p>
    </>
  );
}

function PrivacyEn(props: { op: Operator }) {
  const op = props.op;
  return (
    <>
      <p>
        DanceCalendar lists partner-dance Events (Salsa, Bachata, West Coast Swing, Kizomba, Urban Kiz …) around Kassel and Göttingen. This page explains which
        personal data is processed, why, and for how long. The German version is the binding one.
      </p>

      <h2>1. Controller</h2>
      <Address op={op} />
      <p>
        Email: <Mail op={op} />. A data protection officer is not required and has not been appointed.
      </p>

      <h2>2. In short</h2>
      <ul>
        <li>
          No cookies, no tracking, no analytics or advertising services. That's why there is no cookie banner. Only the map for picking a place loads
          third-party content, and only once you open it (section 3).
        </li>
        <li>Dancers need no account. Filters live only in the page address (URL).</li>
        <li>Phone numbers, and who sent a Tip, are never shown publicly.</li>
      </ul>

      <h2>3. Visiting the website</h2>
      <p>
        When you open a page, our host Cloudflare processes technically necessary data such as your IP address, browser, the address requested and the time, to
        deliver the page and protect it from attacks. Error and access logs are deleted after 7 days at most. Legal basis: Art. 6(1)(f) GDPR (running the
        website securely).
      </p>
      <p>
        So that distances are measured from you, the page asks your browser for your location, and the browser asks you for permission. If you allow it, the
        coordinates, rounded to about a kilometre, sit in the page address. They are used only to filter by distance and are not stored. Without permission you
        see every Event, without distances.
      </p>
      <p>
        If you open "Pick on map", your browser loads map images from OpenFreeMap (openfreemap.org), which receives your IP address and the map areas you view.
        Legal basis: Art. 6(1)(f) GDPR (showing the map you chose). Nothing is sent there unless you open the map.
      </p>

      <h2>4. The WhatsApp bot</h2>
      <p>
        When you message the bot, we process your phone number, your messages and the Flyers you send, to turn them into Events and to reply. For Organizers the
        legal basis is Art. 6(1)(b) GDPR (use under the <a href="/nutzungsbedingungen?lang=en">Terms of Use</a>); for everyone else Art. 6(1)(f) GDPR (our
        interest in running the calendar and accepting Tips).
      </p>
      <p>
        Messages are carried by WhatsApp Ireland Limited (Meta) as our processor. WhatsApp processes some data (such as metadata about your use) as an independent
        controller; see <a href="https://www.whatsapp.com/legal/privacy-policy-eea">WhatsApp's privacy policy</a>.
      </p>
      <p>
        If you write "Admin", we store your number so the Admin can get back to you. Send <strong>STOP</strong> and you get no more messages; we remember that
        you sent STOP so that it stays that way.
      </p>

      <h2>5. Reading Flyers with AI</h2>
      <p>
        An AI model by Anthropic reads the Flyer (title, date, time, Venue, style), so the image is sent to Anthropic. Anthropic does not use the data to train
        its models and deletes it after a short time. You (or, for Tips, the Admin) check the result before it is published. There is no automated decision
        within the meaning of Art. 22 GDPR.
      </p>

      <h2>6. Organizers</h2>
      <p>
        When you sign up we store your Display name (public on your Events), your first name (for the Admin only) and your WhatsApp number (never public). Legal
        basis: Art. 6(1)(b) GDPR. The data is kept while you are registered. If you stop or are removed, we delete your future Events at once and the rest of
        your data within 3 months. If a number is blocked for a breach, we keep only the number so the block works (Art. 6(1)(f) GDPR).
      </p>

      <h2>7. Tips</h2>
      <p>
        If you send a Flyer that isn't yours, the Admin reviews it. Who sent a Tip is never shown. If approved, the Event appears with the Flyer, marked "added by
        the community". Unreviewed Tips and your answer "it's a Tip" are deleted after 30 days.
      </p>

      <h2>8. Published Events and people on Flyers</h2>
      <p>
        Events show what the Flyer says, and the Flyer itself. It may name or show teachers, DJs or guests. This data comes from the Flyer sent by the Organizer
        or the community (Art. 14 GDPR). We show it only on that Event, never on pages about people or in a people search. Legal basis: Art. 6(1)(f) GDPR (making
        publicly announced events findable). If you don't want to be named or shown, write to us and we'll remove you promptly.
      </p>

      <h2>9. Finding Venues</h2>
      <p>
        To work out distances, we send a Venue's name and address (no data about you) to the geocoding services Photon (komoot GmbH, Germany) and Nominatim
        (OpenStreetMap Foundation, United Kingdom, covered by an EU adequacy decision).
      </p>

      <h2>10. Recipients and transfers outside the EU</h2>
      <table>
        <tr>
          <th>Service</th>
          <th>Used for</th>
          <th>Safeguard</th>
        </tr>
        <tr>
          <td>Cloudflare, Inc. (USA)</td>
          <td>Hosting, database and Flyer storage (stored in the EU), email to the Admin</td>
          <td>Data processing agreement; EU-US Data Privacy Framework and EU Standard Contractual Clauses</td>
        </tr>
        <tr>
          <td>Anthropic (USA)</td>
          <td>Reading Flyers with AI</td>
          <td>Data processing agreement with EU Standard Contractual Clauses</td>
        </tr>
        <tr>
          <td>WhatsApp Ireland Limited (Ireland)</td>
          <td>The bot's messages</td>
          <td>WhatsApp Business Data Processing Terms; for sub-processors in the USA the Data Privacy Framework or Standard Contractual Clauses</td>
        </tr>
      </table>

      <h2>11. How long we keep data</h2>
      <ul>
        <li>Events and their Flyers: up to 90 days after the date.</li>
        <li>Submitted Flyers that were published or discarded: 90 days; Flyers never confirmed: 30 days.</li>
        <li>The Flyer of an unfinished sign-up: 24 hours.</li>
        <li>Tips and the answer "it's a Tip": 30 days.</li>
        <li>"Admin" requests: 90 days. Ids of incoming messages (against double delivery): 7 days.</li>
        <li>That we greeted you and whether you sent STOP: while the bot runs; we delete it on request.</li>
        <li>Weekly database backups are overwritten after 8 weeks. Deleted data disappears from them by then at the latest.</li>
      </ul>

      <h2>12. Your rights</h2>
      <p>
        You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and data portability (Art.
        20). Write to <Mail op={op} />; we answer within one month. See also <a href="/datenloeschung?lang=en">Data deletion</a>.
      </p>
      <div class="box">
        <strong>Right to object (Art. 21 GDPR):</strong> Where we process data on the basis of Art. 6(1)(f) GDPR, you can object at any time on grounds relating
        to your particular situation – for example if you are named or shown on an Event. We then stop processing the data unless there are compelling
        legitimate grounds.
      </div>
      <p>You can complain to a data protection supervisory authority, for example: {HBDI}.</p>

      <h2>13. Do you have to give us data?</h2>
      <p>No. Without your phone number you can't use the bot, but you can always browse the calendar.</p>
    </>
  );
}

// ---------- Terms of Use ----------

function TermsDe(props: { op: Operator }) {
  return (
    <>
      <h2>1. Worum es geht</h2>
      <p>
        DanceCalendar ist ein kostenloser Community-Kalender für Paartanz-Events (Salsa, Bachata, West Coast Swing, Kizomba, Urban Kiz und andere Paartänze),
        betrieben privat von {props.op.name}. Es gibt keinen Anspruch darauf, dass ein Event erscheint oder der Kalender jederzeit erreichbar ist.
      </p>

      <h2>2. Veranstalter*innen</h2>
      <p>
        Veranstalter*in wirst du über den Anmeldelink des Bots, indem du diese Bedingungen akzeptierst. Deine Angaben müssen stimmen. Mehrere Personen können
        unter demselben Anzeigenamen eintragen.
      </p>

      <h2>3. Was in den Kalender gehört</h2>
      <p>
        Nur öffentlich zugängliche Paartanz-Events: Partys, Workshops, Kurse, Festivals. Keine anderen Inhalte, keine Werbung für anderes, nichts Rechtswidriges.
      </p>

      <h2>4. Deine Flyer: Rechte und Erlaubnis</h2>
      <ul>
        <li>
          Du versicherst, dass du die nötigen Rechte an jedem Flyer hast, den du schickst – an Gestaltung, Texten und Fotos – und dass die abgebildeten Personen
          einverstanden sind.
        </li>
        <li>
          Du erlaubst DanceCalendar kostenlos und nicht exklusiv, den Flyer und seine Inhalte im Kalender zu zeigen und ihn dafür mit KI auszulesen. Die Erlaubnis
          endet für die Zukunft, wenn du das Event löschst oder es uns schreibst.
        </li>
        <li>Machen Dritte wegen deines Flyers Ansprüche geltend, stellst du den Betreiber davon frei.</li>
      </ul>

      <h2>5. Prüfen und Verantwortung</h2>
      <p>
        Eine KI liest deine Flyer aus. Prüfe das Ergebnis, bevor du veröffentlichst; für die Richtigkeit deiner Events bist du verantwortlich. Deine Bearbeitungslinks
        sind privat – gib sie nur an Personen weiter, die deine Events bearbeiten dürfen.
      </p>

      <h2>6. Tipps</h2>
      <p>
        Jede*r kann den Flyer eines fremden Events als Tipp schicken. Der Admin prüft Tipps, bevor sie erscheinen; sie sind als „von der Community hinzugefügt“
        gekennzeichnet. Veranstalter*innen können verlangen, dass ein Tipp zu ihrem Event entfernt wird.
      </p>

      <h2>7. Entfernen und Sperren</h2>
      <p>
        Der Admin darf Events bearbeiten, Flyer entfernen, Events löschen und Veranstalter*innen sperren – etwa wenn ein Event kein Paartanz ist, nicht stimmt
        oder Rechte verletzt. Meldungen gehen an <Mail op={props.op} /> (siehe <a href="/impressum#melden">Event melden</a>).
      </p>

      <h2>8. Haftung</h2>
      <p>
        Alle Angaben stammen von Flyern und ohne Gewähr. Für den kostenlosen Dienst haftet der Betreiber nur bei Vorsatz und grober Fahrlässigkeit; die Haftung
        für Schäden an Leben, Körper und Gesundheit bleibt unberührt.
      </p>

      <h2>9. Änderungen und Recht</h2>
      <p>
        Diese Bedingungen können sich ändern; es gilt die Fassung auf dieser Seite. Es gilt deutsches Recht. Wie wir mit Daten umgehen, steht in der{" "}
        <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>
    </>
  );
}

function TermsEn(props: { op: Operator }) {
  return (
    <>
      <p>This translation is for convenience; the German version is the binding one.</p>
      <h2>1. What this is</h2>
      <p>
        DanceCalendar is a free community calendar for partner-dance Events (Salsa, Bachata, West Coast Swing, Kizomba, Urban Kiz and other partner dances), run
        privately by {props.op.name}. There is no right to have an Event listed or to the calendar being available at all times.
      </p>

      <h2>2. Organizers</h2>
      <p>
        You become an Organizer through the bot's sign-up link by accepting these Terms. Your details must be correct. Several people can post under the same
        Display name.
      </p>

      <h2>3. What belongs in the calendar</h2>
      <p>Only partner-dance Events open to the public: Parties, Workshops, Courses, Festivals. No other content, no advertising for other things, nothing illegal.</p>

      <h2>4. Your Flyers: rights and permission</h2>
      <ul>
        <li>You confirm that you hold the necessary rights to every Flyer you send – design, text and photos – and that the people shown have agreed.</li>
        <li>
          You allow DanceCalendar, free of charge and non-exclusively, to show the Flyer and its contents in the calendar and to read it with AI for that purpose.
          The permission ends for the future when you delete the Event or tell us.
        </li>
        <li>If third parties make claims because of your Flyer, you indemnify the operator against them.</li>
      </ul>

      <h2>5. Checking and responsibility</h2>
      <p>
        An AI reads your Flyers. Check the result before you publish; you are responsible for your Events being correct. Your edit links are private – share them
        only with people allowed to edit your Events.
      </p>

      <h2>6. Tips</h2>
      <p>
        Anyone can send the Flyer of someone else's Event as a Tip. The Admin reviews Tips before they appear; they are marked "added by the community". Organizers
        can ask for a Tip about their Event to be removed.
      </p>

      <h2>7. Removal and blocking</h2>
      <p>
        The Admin may edit Events, remove Flyers, delete Events and block Organizers – for example when an Event isn't partner dance, is wrong, or infringes
        rights. Reports go to <Mail op={props.op} /> (see <a href="/impressum?lang=en#melden">Report an Event</a>).
      </p>

      <h2>8. Liability</h2>
      <p>
        All details come from Flyers and are without guarantee. For this free service the operator is liable only for intent and gross negligence; liability for
        injury to life, body or health is unaffected.
      </p>

      <h2>9. Changes and law</h2>
      <p>
        These Terms may change; the version on this page applies. German law applies. How we handle data is in the{" "}
        <a href="/datenschutz?lang=en">privacy policy</a>.
      </p>
    </>
  );
}

// ---------- Data deletion ----------

function DeletionDe(props: { op: Operator }) {
  return (
    <>
      <p>
        Schreib dem Bot <strong>STOP</strong>, dann bekommst du keine Nachrichten mehr von ihm. Mit START meldest du dich wieder an.
      </p>
      <p>
        Als Veranstalter*in kannst du einzelne Events jederzeit über ihren Bearbeitungslink absagen. Möchtest du ganz aufhören, schreib dem Bot „Admin“ oder an{" "}
        <Mail op={props.op} />.
      </p>
      <p>
        Möchtest du, dass wir deine Daten löschen (Telefonnummer, Nachrichten, Flyer und deine Events), schreib an <Mail op={props.op} />, am besten mit der
        Telefonnummer, um die es geht. Wir löschen innerhalb eines Monats und bestätigen dir die Löschung. Aus den wöchentlichen Sicherungen verschwinden die
        Daten spätestens nach 8 Wochen.
      </p>
      <p>
        Was wir ohnehin nach welcher Zeit löschen, steht in der <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>
    </>
  );
}

function DeletionEn(props: { op: Operator }) {
  return (
    <>
      <p>
        Send the bot <strong>STOP</strong> and it won't message you any more. Send START to sign up again.
      </p>
      <p>
        As an Organizer you can cancel any Event at any time through its edit link. If you want to stop altogether, write "Admin" to the bot or email{" "}
        <Mail op={props.op} />.
      </p>
      <p>
        If you want us to delete your data (phone number, messages, Flyers and your Events), email <Mail op={props.op} />, ideally with the phone number concerned.
        We delete within one month and confirm the deletion to you. The data disappears from the weekly backups after 8 weeks at the latest.
      </p>
      <p>
        What we delete anyway, and when, is in the <a href="/datenschutz?lang=en">privacy policy</a>.
      </p>
    </>
  );
}
