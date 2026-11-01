import Anthropic from "@anthropic-ai/sdk";
import prompt from "./prompt.md";
import schema from "./schema.json";

// One Sonnet 5.5 call per Flyer at effort medium, v2 prompt and schema
// (.scratch/dance-calendar-mvp/issues/13-extraction-accuracy.md). eval/extract_eval.py reads the same files.

export type ExtractedEvent = {
  title: string;
  type: "party" | "workshop" | "festival";
  styles: string[];
  start_date: string;
  weekday_on_flyer: string;
  start_time: string;
  intro_class_time: string;
  end_date: string;
  end_time: string;
  venue_name: string;
  venue_address: string;
  city: string;
  price_text: string;
  level: string;
  registration_required: boolean;
  description: string;
  series: { is_series: boolean; rule_text: string; frequency: string; explicit_dates: string[] };
  uncertain_fields: string[];
  notes: string;
};

export type Extraction = {
  is_event_flyer: boolean;
  flyer_language: string;
  display_name_on_flyer: string;
  events: ExtractedEvent[];
};

const NOT_A_FLYER: Extraction = { is_event_flyer: false, flyer_language: "other", display_name_on_flyer: "", events: [] };

export async function extractFlyer(apiKey: string, image: ArrayBuffer, mediaType: string, receivedOn: string): Promise<Extraction> {
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 16000,
    system: prompt.trimEnd(),
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    // On a policy decline, the API re-runs the request on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: Buffer.from(image).toString("base64") } },
          { type: "text", text: `Flyer received on ${receivedOn}.` },
        ],
      },
    ],
  });

  if (response.stop_reason !== "end_turn") return NOT_A_FLYER;
  const text = response.content.find((b) => b.type === "text");
  return text?.type === "text" ? (JSON.parse(text.text) as Extraction) : NOT_A_FLYER;
}
