import type { Child } from "hono/jsx";
import { Layout } from "./layout";

// The site's one look, shared by the calendar (src/overview.tsx) and the Organizer's pages: the area at
// /veranstalter, the edit and confirm pages. Outfit from this site (no font host learns who looks), one
// teal, light cards on a pale ground. The bar on top names the two ways to add an Event: the Telegram
// bot and the Organizer area here.

export const BOT = "DanceCalBot"; // the Telegram bot's username
export const BOT_URL = `https://t.me/${BOT}`;

const FONTS = `@font-face{font-family:"Outfit";font-weight:100 900;font-style:normal;font-display:swap;src:url(/fonts/outfit-latin-wght-normal.woff2) format("woff2");}`;

export const SITE_CSS = `${FONTS}
  :root { color-scheme:light; --paper:#faf7f4; --card:#fff; --ink:#1f1426; --mute:#6a5f68; --hair:#e6dde1; --line:rgb(31 20 38 / .1); --wash:#f2ecee;
          --accent:#7a1e3a; --accent-ink:#651830; --tint:#f2e4e8; --step:#f2a65a; --off:#a3271b; --off-tint:#fbe6e3; --warm:#7a4f00; --warm-tint:#fbefd6;
          --r:16px; --r-sm:10px; --shadow:0 1px 2px rgb(31 20 38 / .06), 0 18px 44px -24px rgb(31 20 38 / .35);
          --sans:"Outfit", system-ui, sans-serif; --stick:0px; --g:16px; }
  html { background:var(--paper); scroll-padding-top:calc(var(--stick) + 12px); }
  body { max-width:none; margin:0; padding:0; background:var(--paper); color:var(--ink); font:400 16px/1.5 var(--sans);
         font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
  a { color:inherit; text-decoration:none; }
  ::selection { background:var(--accent); color:#fff; }
  :focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:6px; }
  .lbl, .facts dt { font-size:13px; font-weight:500; color:var(--mute); }
  @media (min-width:960px) { :root { --g:max(32px, calc((100vw - 1180px) / 2)); } }

  /* the bar: the mark and the name, the ways to add an Event, the links on the right */
  .mast { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 12px; padding:14px var(--g); background:var(--card); border-bottom:1px solid var(--line); }
  .mast .home { display:flex; flex-direction:column; min-width:0; flex:1 1 15rem; } /* on a phone the links wrap below */
  .mast .name { display:inline-flex; align-items:center; gap:8px; font:600 26px/1 var(--sans); letter-spacing:-.035em; white-space:nowrap; }
  .mast .name .mark { flex:none; }
  .mast .name .d { color:var(--accent); }
  .mast .sub { display:block; margin-top:4px; font-size:13px; color:var(--mute); }
  .mast .meta { display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; }
  .mast .lang { font-size:14px; font-weight:500; padding:6px 12px; border-radius:99px; border:1px solid var(--line); white-space:nowrap; transition:background .15s; }
  .mast .lang:hover { background:var(--wash); }
  .mast .about { font-size:14px; font-weight:500; color:var(--accent-ink); white-space:nowrap; text-decoration:underline; text-underline-offset:3px; }
  .mast .add { flex-basis:100%; order:3; margin:0; padding:8px 14px; line-height:1.6; border-radius:var(--r-sm); background:var(--tint); font-size:14px; color:var(--accent-ink); }
  .mast .add b { font-weight:500; color:var(--ink); }
  .mast .add a { font-weight:500; text-decoration:underline; text-underline-offset:3px; white-space:nowrap; }
  .mast .add svg { vertical-align:-3px; margin-right:4px; }
  @media (min-width:960px) { .mast { padding-top:16px; padding-bottom:16px; } }

  /* the night band: the bar in plum, the type light, "date" and the Telegram link in apricot; on the calendar the
     ink couple dances in it */
  .mast.night { position:relative; overflow:hidden; background:var(--ink); color:#f4eef1; border-bottom:0; }
  .mast.night > :not(.ink) { position:relative; z-index:1; }
  .mast.night .ink { position:absolute; inset:0; width:100%; height:100%; z-index:0; }
  .mast.night .name .d { color:var(--step); }
  .mast.night .mark > rect:first-child { stroke:rgb(255 255 255 / .28); stroke-width:1.5; }
  .mast.night .sub { color:#c9b9c3; }
  .mast.night .about { color:#f4eef1; }
  .mast.night .lang { border-color:rgb(255 255 255 / .25); }
  .mast.night .lang:hover { background:rgb(255 255 255 / .1); }
  .mast.night .add { background:rgb(255 255 255 / .08); color:#f4eef1; }
  .mast.night .add b, .mast.night .add a { color:#fff; }
  .mast.night :focus-visible { outline-color:var(--step); }

  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; font:500 15px var(--sans); height:44px; padding:0 20px; border-radius:99px; border:1px solid rgb(31 20 38 / .2); background:var(--card); color:var(--ink); cursor:pointer; transition:background .15s, transform .15s; }
  .btn:hover { background:var(--wash); }
  .btn:active { transform:scale(.97); }
  .btn.solid { background:var(--accent); border-color:var(--accent); color:#fff; }
  .btn.solid:hover { background:var(--accent-ink); }
  .btn.danger { color:var(--off); border-color:rgb(163 39 27 / .35); }
  .btn.danger:hover { background:var(--off-tint); }
  .btn:disabled { opacity:.35; cursor:default; }
  .btn[hidden] { display:none !important; }

  /* the footer */
  body > footer { margin:32px var(--g) 0; padding:20px 0 32px; border-top:1px solid var(--line); font-size:14px; line-height:1.9; color:var(--mute); }
  body > footer a { color:var(--ink); text-decoration:underline; text-decoration-color:var(--hair); text-underline-offset:3px; }
  body > footer a:hover { text-decoration-color:currentColor; }
`;

const TelegramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M21.9 4.6 18.7 19.7c-.2 1-.9 1.3-1.7.8l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 13.4 1.9 11.9c-1-.3-1-1 .2-1.5l18.4-7.1c.9-.3 1.6.2 1.4 1.3z" />
  </svg>
);

const T = {
  de: { sub: "wo heute getanzt wird", add: "Neues Event eintragen:", bot: "per Telegram an @DanceCalBot", or: "oder", web: "hier auf der Website" },
  en: { sub: "where to dance tonight", add: "Add an Event:", bot: "on Telegram via @DanceCalBot", or: "or", web: "here on the website" },
};

// The bar on every page. `home` is where the name leads (the calendar keeps its filters), `children` the
// links on the right; `add` shows the two ways to add an Event, `ink` lets the ink couple dance in the band.
export function Masthead(props: { lang?: "de" | "en"; home?: string; add?: boolean; ink?: boolean; children?: Child }) {
  const t = T[props.lang ?? "de"];
  return (
    <header class="mast night">
      {props.ink && <canvas class="ink" data-ink="/ink/couple.png" aria-hidden="true"></canvas>}
      <a class="home" href={props.home ?? "/"}>
        {/* The mark, a week grid in which three days light up diagonally like the steps of a dance diagram, then the
            name in lower case: "step" in ink, "date" in bordeaux. */}
        <span class="name" role="img" aria-label="Stepdate">
          <svg class="mark" width="26" height="26" viewBox="0 0 30 30" aria-hidden="true">
            <rect width="30" height="30" rx="8" fill="#1f1426" />
            <g fill="#faf7f4" opacity=".35">
              <rect x="5" y="5" width="5" height="5" rx="1.2" />
              <rect x="12.5" y="5" width="5" height="5" rx="1.2" />
              <rect x="5" y="12.5" width="5" height="5" rx="1.2" />
              <rect x="20" y="12.5" width="5" height="5" rx="1.2" />
              <rect x="12.5" y="20" width="5" height="5" rx="1.2" />
              <rect x="20" y="20" width="5" height="5" rx="1.2" />
            </g>
            <g fill="#f2a65a">
              <rect x="20" y="5" width="5" height="5" rx="1.2" />
              <rect x="12.5" y="12.5" width="5" height="5" rx="1.2" />
              <rect x="5" y="20" width="5" height="5" rx="1.2" />
            </g>
          </svg>
          <span aria-hidden="true">
            step<span class="d">date</span>
          </span>
        </span>
        <span class="sub">{t.sub}</span>
      </a>
      {props.children && <span class="meta">{props.children}</span>}
      {props.add && (
        <p class="add">
          <b>{t.add}</b>{" "}
          <a href={BOT_URL}>
            <TelegramIcon />
            {t.bot}
          </a>{" "}
          {t.or} <a href="/veranstalter">{t.web}</a>
        </p>
      )}
      {props.ink && <script src="/ink/couple.js" defer />}
    </header>
  );
}

// The Organizer's pages: the bar, then one narrow column of panels, forms and lists, made for a phone.
export const PAGE_CSS = `
  .wrap { max-width:680px; margin:0 auto; padding:20px var(--g) 8px; }
  .wrap h1 { margin:4px 0 6px; font:500 28px/1.2 var(--sans); letter-spacing:-.02em; }
  .wrap h2 { margin:28px 0 10px; font:500 19px/1.3 var(--sans); letter-spacing:-.01em; }
  .wrap p { margin:8px 0; }
  .lead { color:var(--mute); }
  .wrap .about { font-weight:500; color:var(--accent-ink); text-decoration:underline; text-underline-offset:3px; }
  .panel { margin:16px 0; padding:18px; background:var(--card); border-radius:var(--r); box-shadow:var(--shadow), 0 0 0 1px var(--line); }
  .panel > :first-child { margin-top:0; } .panel > :last-child { margin-bottom:0; }
  .stack { display:grid; gap:10px; }
  .row2 { display:flex; flex-wrap:wrap; gap:10px; }
  .row2 > .btn { flex:1 1 180px; }
  .wide { width:100%; }
  .note { padding:10px 14px; border-radius:var(--r-sm); background:var(--tint); color:var(--accent-ink); }
  .note.bad { background:var(--off-tint); color:var(--off); }
  .note.warn { background:var(--warm-tint); color:var(--warm); }
  .hint { font-size:14px; color:var(--mute); }
  .back { display:inline-flex; align-items:center; gap:6px; margin:0 0 8px; font-size:15px; font-weight:500; color:var(--accent-ink); }
  .wrap form > label:not(.check):not(.choice):not(.drop) { display:block; margin:14px 0 4px; font-size:14px; font-weight:500; color:var(--mute); }
  .wrap input:not([type=checkbox]):not([type=radio]):not([type=file]), .wrap select, .wrap textarea { width:100%; box-sizing:border-box; height:44px; padding:0 12px;
    border:1px solid rgb(31 20 38 / .18); border-radius:var(--r-sm); background:var(--card); color:var(--ink); font:400 16px var(--sans); }
  .wrap input:focus, .wrap select:focus { outline:2px solid var(--accent); outline-offset:0; border-color:transparent; }
  label.check { display:flex; gap:10px; align-items:flex-start; margin:16px 0; font-size:15px; }
  label.check input { margin-top:4px; width:18px; height:18px; accent-color:var(--accent); flex:none; }
  .choices { display:grid; gap:8px; margin:12px 0; }
  label.choice { display:flex; gap:12px; align-items:flex-start; padding:12px 14px; border-radius:var(--r-sm); box-shadow:0 0 0 1px var(--line); cursor:pointer; }
  label.choice:has(input:checked) { box-shadow:0 0 0 2px var(--accent); background:var(--tint); }
  label.choice input { margin-top:4px; accent-color:var(--accent); }
  label.choice span { display:grid; } label.choice small { color:var(--mute); font-size:14px; }
  .drop { position:relative; display:grid; place-items:center; align-content:center; gap:6px; min-height:140px; padding:20px; border:2px dashed rgb(122 30 58 / .35); border-radius:var(--r); background:var(--tint); text-align:center; color:var(--accent-ink); cursor:pointer; }
  .drop:hover, .drop:focus-within { border-color:var(--accent); }
  .drop input { position:absolute; inset:0; opacity:0; cursor:pointer; }
  .drop b { font-size:17px; font-weight:500; } .drop small { color:var(--mute); font-size:14px; } .drop svg { color:var(--accent); }
  .drop img { max-height:180px; max-width:100%; border-radius:8px; }
  .evs { display:grid; gap:2px; margin:0; padding:0; list-style:none; }
  .ev { display:grid; grid-template-columns:72px minmax(0, 1fr); gap:14px; align-items:center; padding:12px 6px; border-bottom:1px solid var(--line); }
  .ev:last-child { border-bottom:0; }
  .ev img, .ev .none { width:72px; height:96px; object-fit:contain; border-radius:8px; background:var(--wash); }
  .ev .when { font-size:14px; color:var(--mute); }
  .ev h3 { margin:2px 0; font:500 17px/1.3 var(--sans); }
  .ev .where { font-size:14px; color:var(--mute); }
  .ev .acts { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
  .ev .acts .btn { height:36px; padding:0 14px; font-size:14px; }
  .ev.off h3 { text-decoration:line-through; color:var(--mute); }
  .tag { display:inline-block; margin-left:6px; padding:1px 8px; border-radius:99px; font-size:12px; font-weight:500; background:var(--off-tint); color:var(--off); vertical-align:2px; }
  .tag.wait { background:var(--warm-tint); color:var(--warm); }
  details.more summary { cursor:pointer; font-weight:500; color:var(--accent-ink); margin:20px 0 6px; }
  .tg { display:flex; align-items:center; justify-content:center; gap:10px; }
  .or { display:flex; align-items:center; gap:12px; margin:14px 0; color:var(--mute); font-size:14px; }
  .or::before, .or::after { content:""; flex:1; height:1px; background:var(--line); }
  .code { font:500 22px/1 var(--sans); letter-spacing:.12em; }
  .spin { width:18px; height:18px; border-radius:50%; border:2px solid var(--tint); border-top-color:var(--accent); animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation:none; } }
`;

// A chosen Flyer shows in its drop field before it's uploaded.
const DROP_SCRIPT = `document.querySelectorAll(".drop input").forEach(function(i){i.addEventListener("change",function(){var d=i.closest(".drop"),f=i.files&&i.files[0];if(!f)return;d.querySelector("b").textContent=f.name;var s=d.querySelector("svg");if(s)s.style.display="none";var img=d.querySelector("img");if(!img){img=document.createElement("img");img.alt="";d.insertBefore(img,d.firstChild)}img.src=URL.createObjectURL(f);d.querySelector("small").textContent="Tippe, um ein anderes Bild zu wählen";})});`;

// One Organizer page: the bar (with "Deine Events" and, when logged in, "Abmelden"), then the column.
export function SitePage(props: { title: string; head?: Child; css?: string; nav?: Child; children: Child }) {
  return (
    <Layout
      title={`${props.title} – Stepdate`}
      head={
        <>
          <link rel="preload" href="/fonts/outfit-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin="" />
          <style dangerouslySetInnerHTML={{ __html: SITE_CSS + PAGE_CSS + (props.css ?? "") }} />
          {props.head}
        </>
      }
    >
      <Masthead>{props.nav ?? <a class="about" href="/veranstalter">Deine Events</a>}</Masthead>
      <main class="wrap">{props.children}</main>
      <script dangerouslySetInnerHTML={{ __html: DROP_SCRIPT }} />
    </Layout>
  );
}
