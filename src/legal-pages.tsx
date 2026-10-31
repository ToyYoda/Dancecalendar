import { Layout } from "./layout";

// Interim text so Meta's Live mode has URLs to point at. The full Impressum, privacy policy and
// Terms of Use replace these in ticket 27 (legal pages).

const contact = "[Name und Kontakt des Betreibers folgen mit dem Impressum]";

export function PrivacyPolicy() {
  return (
    <Layout title="Datenschutz – DanceCalendar">
      <h1>Datenschutzerklärung</h1>
      <p><em>Vorläufige Fassung.</em></p>
      <h2>Verantwortlich</h2>
      <p>{contact}</p>
      <h2>Welche Daten wir verarbeiten</h2>
      <ul>
        <li>Wenn du dem DanceCalendar-Bot auf WhatsApp schreibst: deine Telefonnummer, deine Nachrichten und die Flyer, die du schickst.</li>
        <li>Wenn du Veranstalter*in bist: deinen Anzeigenamen und deinen Vornamen.</li>
        <li>Die Veranstaltungen, die aus den Flyern entstehen.</li>
      </ul>
      <p>Wir nutzen die Daten nur, um Tanzveranstaltungen im Kalender zu zeigen.</p>
      <h2>Dienstleister</h2>
      <ul>
        <li>Cloudflare (Hosting und Speicherung, in der EU)</li>
        <li>Anthropic (KI, die Flyer liest)</li>
        <li>Meta (WhatsApp)</li>
      </ul>
      <h2>Speicherdauer</h2>
      <p>Vergangene Veranstaltungen und ihre Flyer löschen wir etwa drei Monate nach dem Termin, Tipps innerhalb von 30 Tagen.</p>
      <h2>Kein Tracking</h2>
      <p>Diese Seite setzt keine Cookies und nutzt keine Analyse- oder Werbedienste.</p>
      <h2>Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch sowie auf Beschwerde bei einer
        Datenschutz-Aufsichtsbehörde. Siehe auch <a href="/datenloeschung">Datenlöschung</a>.
      </p>
    </Layout>
  );
}

export function DataDeletion() {
  return (
    <Layout title="Datenlöschung – DanceCalendar">
      <h1>Datenlöschung</h1>
      <p><em>Vorläufige Fassung.</em></p>
      <p>Schreib dem Bot <strong>STOP</strong>, dann bekommst du keine Nachrichten mehr von ihm.</p>
      <p>
        Wenn du möchtest, dass wir deine Daten löschen (Telefonnummer, Nachrichten, Flyer und deine Veranstaltungen), wende
        dich an: {contact}. Wir löschen innerhalb eines Monats und bestätigen dir die Löschung.
      </p>
    </Layout>
  );
}
