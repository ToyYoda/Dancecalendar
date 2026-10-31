import { Hono } from "hono";
import { DataDeletion, PrivacyPolicy } from "./legal-pages";
import { loadWeek, WeekFeed } from "./week-feed";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => c.html(<WeekFeed events={await loadWeek(c.env.DB, new Date())} />));
app.get("/datenschutz", (c) => c.html(<PrivacyPolicy />));
app.get("/datenloeschung", (c) => c.html(<DataDeletion />));

export default app;
