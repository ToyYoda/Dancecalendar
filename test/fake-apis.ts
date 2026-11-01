import { vi } from "vitest";

// Plays Meta's Graph API and the Anthropic API at the fetch boundary.
// `sent` collects every WhatsApp message the bot sends, in order.

export type SentMessage = { to: string; text: string; buttons: { id: string; title: string }[] };

export function fakeApis(options: { extraction?: object; anthropicError?: string } = {}) {
  const sent: SentMessage[] = [];
  const anthropicCalls: any[] = [];

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const req = new Request(input as RequestInfo, init);
    const url = new URL(req.url);

    if (url.hostname === "graph.facebook.com" && req.method === "POST" && url.pathname.endsWith("/1000/messages")) {
      const body: any = await req.json();
      sent.push({
        to: body.to,
        text: body.type === "text" ? body.text.body : body.interactive.body.text,
        buttons: body.type === "interactive" ? body.interactive.action.buttons.map((b: any) => b.reply) : [],
      });
      return Response.json({ messages: [{ id: "wamid.OUT" }] });
    }
    if (url.hostname === "graph.facebook.com" && req.method === "GET") {
      const mediaId = url.pathname.split("/").pop();
      return Response.json({ url: `https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${mediaId}`, mime_type: "image/jpeg" });
    }
    if (url.hostname === "lookaside.fbsbx.com") {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } });
    }
    if (url.hostname === "api.anthropic.com") {
      anthropicCalls.push(await req.json());
      if (options.anthropicError) {
        return Response.json({ type: "error", error: { type: "invalid_request_error", message: options.anthropicError } }, { status: 400 });
      }
      return Response.json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: JSON.stringify(options.extraction ?? flyer()) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 300 },
      });
    }
    throw new Error(`Unexpected fetch in test: ${req.method} ${req.url}`);
  });

  return { sent, anthropicCalls, fetchSpy, texts: () => sent.map((m) => m.text) };
}

// What the model returns for a Flyer, in the schema of src/extraction/schema.json.
export function flyer(events: Partial<FlyerEvent>[] = [{}]) {
  return {
    is_event_flyer: true,
    flyer_language: "de",
    display_name_on_flyer: "Salsa Kassel",
    events: events.map((e) => ({ ...flyerEvent(), ...e })),
  };
}

export type FlyerEvent = ReturnType<typeof flyerEvent>;

export function flyerEvent() {
  return {
    title: "Salsa Night",
    type: "party",
    styles: ["salsa", "bachata"],
    start_date: berlinDate(3),
    weekday_on_flyer: "",
    start_time: "21:00",
    intro_class_time: "20:00",
    end_date: "",
    end_time: "02:00",
    venue_name: "Kulturfabrik Salzmann",
    venue_address: "Sandershäuser Str. 34",
    city: "Kassel",
    price_text: "8 €",
    level: "",
    registration_required: false,
    description: "",
    series: { is_series: false, rule_text: "", frequency: "none", explicit_dates: [] },
    uncertain_fields: [] as string[],
    notes: "",
  };
}

export function berlinDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}
