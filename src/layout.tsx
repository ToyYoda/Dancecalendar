import type { Child } from "hono/jsx";

export function Layout(props: { title: string; lang?: "de" | "en"; head?: Child; children: Child }) {
  return (
    <html lang={props.lang ?? "de"}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <style>{`
          body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 40rem; padding: 1rem; line-height: 1.4; }
          h2 { font-size: 1rem; margin: 1.5rem 0 .5rem; }
          ul { list-style: none; padding: 0; margin: 0; }
          li { padding: .5rem 0; border-bottom: 1px solid #ddd; }
          footer { margin-top: 2rem; font-size: .875rem; }
        `}</style>
        {props.head}
      </head>
      <body>
        {props.children}
        <Footer lang={props.lang ?? "de"} />
      </body>
    </html>
  );
}

// The legal pages (src/legal-pages.tsx) and the OpenStreetMap credit for geocoded Venues, on every page.
function Footer(props: { lang: "de" | "en" }) {
  const en = props.lang === "en";
  const q = en ? "?lang=en" : "";
  return (
    <footer>
      <a href={`/impressum${q}`}>{en ? "Imprint" : "Impressum"}</a> · <a href={`/datenschutz${q}`}>{en ? "Privacy" : "Datenschutz"}</a> ·{" "}
      <a href={`/nutzungsbedingungen${q}`}>{en ? "Terms" : "Nutzungsbedingungen"}</a> ·{" "}
      <a href={`/datenloeschung${q}`}>{en ? "Data deletion" : "Datenlöschung"}</a> ·{" "}
      <a href={`/impressum${q}#melden`}>{en ? "Report an Event" : "Event melden"}</a>
      <br />
      {en ? "Location data" : "Ortsdaten"} © <a href="https://www.openstreetmap.org/copyright">{en ? "OpenStreetMap contributors" : "OpenStreetMap-Mitwirkende"}</a> (ODbL)
    </footer>
  );
}
