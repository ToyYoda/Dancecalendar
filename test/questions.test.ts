import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { berlinDate, fakeApis, flyer, knownVenue, type FakePlace } from "./fake-apis";
import { deliver, feed, formFrom, get, post } from "./flow";
import { buttonReply, imageMessage, ORGANIZER_NUMBER, textMessage } from "./whatsapp-fixtures";

const MUSA: FakePlace = { name: "Musa", street: "Hagenweg", housenumber: "2a", postcode: "37081", city: "Göttingen", lat: 51.55, lng: 9.92 };
const EXIL: FakePlace = { name: "EXIL", street: "Weender Landstraße", housenumber: "5", postcode: "37073", city: "Göttingen", lat: 51.54, lng: 9.93 };

beforeEach(async () => {
  await env.DB.batch([
    ...["event", "submission", "venue", "admin_request", "contact", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name, first_name) VALUES (1, ?, 'Salsa Kassel', 'Ana')").bind(
      ORGANIZER_NUMBER,
    ),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name) VALUES (2, '4915200000002', 'Bachata Göttingen')"),
    knownVenue(env.DB),
  ]);
});

afterEach(() => vi.restoreAllMocks());

type Api = ReturnType<typeof fakeApis>;
const last = (api: Api) => api.sent.at(-1)!;
const tap = (api: Api, title: string) => deliver(buttonReply(last(api).buttons.find((b) => b.title === title)!.id));
const reply = (text: string) => deliver(textMessage(text));
const publish = (api: Api) => tap(api, "Veröffentlichen");

describe("a missing start time", () => {
  const twoEvents = flyer([{}, { title: "Bachata Sunday", start_date: berlinDate(4), start_time: "" }]);

  it("is asked about before the summary, suggesting the Flyer's other start time", async () => {
    const api = fakeApis({ extraction: twoEvents });

    await deliver(imageMessage("media1"));

    expect(last(api).text).toContain("„Bachata Sunday“");
    expect(last(api).text).toContain("finde ich keine Anfangszeit");
    expect(last(api).buttons.map((b) => b.title)).toEqual(["21:00", "Andere Uhrzeit", "Event weglassen"]);

    await tap(api, "21:00");

    expect(last(api).text).toContain("Ich habe 2 Events");
    await publish(api);
    expect((await feed()).match(/class="time">21:00/g)).toHaveLength(2);
  });

  it("takes a typed time, and asks again when it can't read it", async () => {
    const api = fakeApis({ extraction: flyer([{ start_time: "" }]) });
    await deliver(imageMessage("media1"));
    expect(last(api).buttons.map((b) => b.title)).toEqual(["Andere Uhrzeit", "Event weglassen"]);
    await tap(api, "Andere Uhrzeit");
    expect(last(api).text).toContain("Schick mir die Uhrzeit");

    await reply("abends");
    expect(last(api).text).toContain("nicht verstanden");
    await reply("20.30 Uhr");

    expect(last(api).text).toContain("20:30");
    expect(last(api).text).not.toContain("bitte prüfen");
    await publish(api);
    expect(await feed()).toContain("20:30");
  });

  it("leaves the Event out on Event weglassen and publishes the rest", async () => {
    const api = fakeApis({ extraction: twoEvents });
    await deliver(imageMessage("media1"));

    await tap(api, "Event weglassen");

    expect(last(api).text).toContain("Ich habe 1 Event");
    expect(last(api).text).toContain("Weggelassen: Bachata Sunday");
    await publish(api);
    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).not.toContain("Bachata Sunday");
  });

  it("ignores a late tap on an answered question while the next one waits", async () => {
    // The next question will be about a duplicate of Salsa Night.
    await env.DB.prepare("INSERT INTO event (title, type, starts_at, venue_id, organizer_id) VALUES ('Bachata Party', 'party', ?, 1, 2)")
      .bind(`${berlinDate(3)}T21:30`)
      .run();
    const api = fakeApis({ extraction: twoEvents });
    await deliver(imageMessage("media1"));
    const question = last(api).buttons;
    await deliver(buttonReply(question[0].id));
    expect(last(api).text).toContain("doppelt?");

    await deliver(buttonReply(question[2].id)); // "Event weglassen", meant for Bachata Sunday

    expect(last(api).text).toContain("schon beantwortet");
    await deliver(buttonReply(api.sent.findLast((m) => m.text.includes("doppelt?"))!.buttons[0].id));
    await publish(api);
    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).toContain("Bachata Sunday");
  });
});

describe("a new Venue", () => {
  const atMusa = flyer([{ venue_name: "Musa", venue_address: "", city: "Göttingen" }]);

  it("is looked up and confirmed in the chat, and stored with its coordinates", async () => {
    const api = fakeApis({ extraction: atMusa, places: { musa: MUSA } });

    await deliver(imageMessage("media1"));

    expect(last(api).text).toContain("„Musa“ kenne ich noch nicht. Ist es das hier?");
    expect(last(api).text).toContain("📍 Musa, Hagenweg 2a, 37081 Göttingen");
    expect(last(api).buttons.map((b) => b.title)).toEqual(["Ja, genau", "Nein, andere Adresse"]);
    await tap(api, "Ja, genau");
    expect(last(api).text).toContain("Hagenweg 2a");
    expect(last(api).text).not.toContain("bitte prüfen");

    await publish(api);

    const venue = await env.DB.prepare("SELECT name, address, lat, lng FROM venue WHERE name = 'Musa'").first();
    expect(venue).toEqual({ name: "Musa", address: "Hagenweg 2a, 37081 Göttingen", lat: 51.55, lng: 9.92 });
    expect(api.geocoded).toHaveLength(1);
  });

  it("is asked about once for all Events of the Flyer there", async () => {
    const api = fakeApis({
      extraction: flyer([
        { venue_name: "Musa", venue_address: "" },
        { title: "Bachata Sunday", venue_name: "musa", venue_address: "", start_date: berlinDate(4) },
      ]),
      places: { musa: MUSA },
    });
    await deliver(imageMessage("media1"));

    await tap(api, "Ja, genau");

    expect(last(api).text).toContain("Ich habe 2 Events");
    await publish(api);
    const { results } = await env.DB.prepare("SELECT DISTINCT venue_id FROM event").all();
    expect(results).toHaveLength(1);
  });

  it("takes a typed address on Nein and asks again with what that finds", async () => {
    const api = fakeApis({ extraction: flyer([{ venue_name: "Exil", venue_address: "", city: "" }]), places: { weender: EXIL, exil: MUSA } }); // the first lookup finds the wrong place
    await deliver(imageMessage("media1"));
    await tap(api, "Nein, andere Adresse");
    expect(last(api).text).toContain("Schick mir die Adresse");

    await reply("Weender Landstr. 5, Göttingen");

    // Looked up by the address alone, so the place shows as just that address.
    expect(last(api).text).toContain("📍 Weender Landstraße 5, 37073 Göttingen");
    await tap(api, "Ja, genau");
    await publish(api);
    const venue = await env.DB.prepare("SELECT lat, lng FROM venue WHERE name = 'Exil'").first();
    expect(venue).toEqual({ lat: 51.54, lng: 9.93 });
  });

  it("can be entered without an address when it isn't on the map", async () => {
    const api = fakeApis({ extraction: flyer([{ venue_name: "Tanzschule Pelzer", venue_address: "", city: "" }]) });

    await deliver(imageMessage("media1"));

    expect(last(api).text).toContain("finde es auch nicht auf der Karte");
    await tap(api, "Ohne Adresse");
    await publish(api);
    const venue = await env.DB.prepare("SELECT address, lat FROM venue WHERE name = 'Tanzschule Pelzer'").first();
    expect(venue).toEqual({ address: null, lat: null });
  });

  it("can be typed in right away when it isn't on the map", async () => {
    const api = fakeApis({ extraction: flyer([{ venue_name: "Tanzschule Pelzer", venue_address: "", city: "" }]), places: { "Obere": MUSA } });
    await deliver(imageMessage("media1"));

    await reply("Obere Königsstr. 1, Kassel");

    expect(last(api).text).toContain("Ist es das hier?");
    await tap(api, "Ja, genau");
    await publish(api);
    const venue = await env.DB.prepare("SELECT lat FROM venue WHERE name = 'Tanzschule Pelzer'").first();
    expect(venue).toEqual({ lat: 51.55 });
  });

  it("is looked up by its printed address when the Flyer has one", async () => {
    const api = fakeApis({ extraction: flyer([{ venue_name: "Salsa Bar", venue_address: "Friedrich-Ebert-Str. 1", city: "Kassel" }]), places: { friedrich: MUSA } });

    await deliver(imageMessage("media1"));

    expect(api.geocoded).toEqual(["photon: Friedrich-Ebert-Str. 1, Kassel"]);
    expect(last(api).text).toContain("„Salsa Bar“ kenne ich noch nicht. Ist es das hier?");
  });

  it("falls back to Nominatim when Photon fails", async () => {
    const api = fakeApis({ extraction: atMusa, places: { musa: MUSA }, photonDown: true });

    await deliver(imageMessage("media1"));

    expect(api.geocoded.map((g) => g.split(":")[0])).toEqual(["photon", "nominatim"]);
    expect(last(api).text).toContain("📍 Musa, Hagenweg 2a, 37081 Göttingen");
  });

  it("comes after the missing start time", async () => {
    const api = fakeApis({ extraction: flyer([{ venue_name: "Musa", venue_address: "", start_time: "" }]), places: { musa: MUSA } });
    await deliver(imageMessage("media1"));
    expect(last(api).text).toContain("Anfangszeit");

    await tap(api, "Andere Uhrzeit");
    await reply("22:00");

    expect(last(api).text).toContain("kenne ich noch nicht");
  });

  it("shows its match on the confirm page, and publishing from there stores the coordinates", async () => {
    const api = fakeApis({ extraction: flyer([{ venue_name: "Musa", venue_address: "", start_date: "" }]), places: { musa: MUSA, weender: EXIL } });
    await deliver(imageMessage("media1"));
    await tap(api, "Ja, genau");
    await tap(api, "Ändern ✏️");
    const link = last(api).text.match(/https:\/\/dancecalendar\.test\/c\/\S+/)![0];
    const page = await (await get(link)).text();
    expect(page).toContain("auf der Karte gefunden: Musa, Hagenweg 2a, 37081 Göttingen");
    const fields = formFrom(page);
    fields.set("start_date.0", berlinDate(2));
    fields.set("venue_name.0", "Exil");
    fields.set("venue_address.0", "Weender Landstr. 5");

    await post(link, fields.toString(), { "content-type": "application/x-www-form-urlencoded" });

    const venue = await env.DB.prepare("SELECT lat FROM venue WHERE name = 'Exil'").first();
    expect(venue).toEqual({ lat: 51.54 });
  });
});

describe("a reposted Flyer", () => {
  async function postedBefore(api: Api) {
    await deliver(imageMessage("media1"));
    await publish(api);
    return last(api).text.match(/https:\/\/dancecalendar\.test\/e\/\S+/)![0];
  }

  it("is asked about, and Ja, Update replaces the existing Event, which keeps its edit link", async () => {
    const api = fakeApis();
    const editLink = await postedBefore(api);
    const update = fakeApis({ extraction: flyer([{ start_time: "20:00" }]) });

    await deliver(imageMessage("media2"));

    expect(last(update).text).toContain("Den kenne ich schon: „Salsa Night“");
    expect(last(update).text).toContain("Beginn 20:00 statt 21:00");
    await tap(update, "Ja, Update");
    expect(last(update).text).toContain("ersetzt dein bestehendes Event");
    await publish(update);

    expect(last(update).text).toContain(editLink);
    expect(last(update).text).toContain("aktualisiert");
    const { results } = await env.DB.prepare("SELECT starts_at FROM event").all<{ starts_at: string }>();
    expect(results.map((r) => r.starts_at.slice(11))).toEqual(["20:00"]);
  });

  it("becomes a second Event on Nein, neues Event", async () => {
    const api = fakeApis();
    await postedBefore(api);

    await deliver(imageMessage("media2"));
    await tap(api, "Nein, neues Event");
    await publish(api);

    const { results } = await env.DB.prepare("SELECT id FROM event").all();
    expect(results).toHaveLength(2);
  });
});

describe("a likely duplicate of another Organizer's Event", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      "INSERT INTO event (title, type, starts_at, ends_at, venue_id, organizer_id) VALUES ('Bachata Party', 'party', ?, ?, 1, 2)",
    )
      .bind(`${berlinDate(3)}T22:00`, `${berlinDate(4)}T03:00`)
      .run();
  });

  it("is asked about, and Beide behalten publishes both", async () => {
    const api = fakeApis();

    await deliver(imageMessage("media1"));

    expect(last(api).text).toContain("„Bachata Party“ (Bachata Göttingen");
    expect(last(api).text).toContain("doppelt?");
    expect(last(api).buttons.map((b) => b.title)).toEqual(["Beide behalten", "Meins weglassen"]);
    await tap(api, "Beide behalten");
    expect(last(api).text).not.toContain("doppelt?");
    await publish(api);
    const { results } = await env.DB.prepare("SELECT id FROM event").all();
    expect(results).toHaveLength(2);
  });

  it("publishes nothing when the only Event is left out", async () => {
    const api = fakeApis();
    await deliver(imageMessage("media1"));

    await tap(api, "Meins weglassen");

    expect(last(api).text).toContain("Alles weggelassen");
    const { results } = await env.DB.prepare("SELECT id FROM event").all();
    expect(results).toHaveLength(1);
  });
});
