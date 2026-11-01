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
        <footer>
          <a href="/datenschutz">Datenschutz</a> · <a href="/datenloeschung">Datenlöschung</a>
        </footer>
      </body>
    </html>
  );
}
