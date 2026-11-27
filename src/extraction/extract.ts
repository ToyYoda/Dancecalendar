import Anthropic from "@anthropic-ai/sdk";
import prompt from "./prompt.md";
import schema from "./schema.json";
import type { Place } from "../geocode";
import { startAtIntroClass } from "./checks";
import type { Rule } from "../series";

// One Sonnet 5.5 call per Flyer at effort medium, v4 prompt (v2 plus: a party without a printed start begins when its intro class ends; year_on_flyer) and the v2 schema plus year_on_flyer
// (.scratch/dance-calendar-mvp/issues/13-extraction-accuracy.md). eval/extract_eval.py reads the same files.

export type ExtractedEvent = {
  title: string;
  type: "party" | "workshop" | "festival";
  styles: string[];
  start_date: string;
  weekday_on_flyer: string;
  year_on_flyer: string;
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
} & HeldAnswers;

// Not from the model: what the Organizer answered while the Flyer was held (src/whatsapp/questions.ts).
export type HeldAnswers = {
  answered?: Partial<Record<"repost" | "date" | "rule" | "time" | "venue" | "tip" | "duplicate", true>>;
  dropped?: boolean; // "Event weglassen" / "Meins weglassen"
  update_of?: number; // a repost: the Organizer's existing Event this one replaces
  update_series?: number; // the Series of the Event a repost may replace
  replaces_tip?: number; // "Ja, dasselbe": the Tip Event this one replaces, deleted on publish
  venue_guess?: { query: string; place: Place | null }; // the geocoder's answer for these venue fields
  series_rule?: Rule | null; // the Series rule the Organizer chose; null = just this date (src/series.ts `heldRule`)
  date_from_rule?: string; // a Series Flyer without a printed date: the date the confirm page worked out from its rule
};

export type Extraction = {
  is_event_flyer: boolean;
  flyer_language: string;
  organizer_name_on_flyer: string;
  events: ExtractedEvent[];
};

const NOT_A_FLYER: Extraction = { is_event_flyer: false, flyer_language: "other", organizer_name_on_flyer: "", events: [] };

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
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: toBase64(image) } },
          { type: "text", text: `Flyer received on ${receivedOn}.` },
        ],
      },
    ],
  });

  if (response.stop_reason !== "end_turn") return NOT_A_FLYER;
  const text = response.content.find((b) => b.type === "text");
  if (text?.type !== "text") return NOT_A_FLYER;
  const extraction = JSON.parse(text.text) as Extraction;
  return { ...extraction, events: extraction.events.map(startAtIntroClass) };
}

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}
