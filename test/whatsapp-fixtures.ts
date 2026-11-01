// Webhook payloads shaped like Meta's WhatsApp Cloud API deliveries, signed with the test app secret.

export const BOT_PHONE_NUMBER_ID = "1000";
export const ORGANIZER_NUMBER = "4915200000001";

let counter = 0;
const nextId = () => `wamid.TEST${++counter}`;

function envelope(message: object) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "4915204333041", phone_number_id: BOT_PHONE_NUMBER_ID },
              contacts: [{ profile: { name: "Test" }, wa_id: (message as { from: string }).from }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

const timestamp = () => String(Math.floor(Date.now() / 1000));

export function textMessage(body: string, from = ORGANIZER_NUMBER, id = nextId()) {
  return envelope({ from, id, timestamp: timestamp(), type: "text", text: { body } });
}

export function imageMessage(mediaId: string, from = ORGANIZER_NUMBER, id = nextId()) {
  return envelope({ from, id, timestamp: timestamp(), type: "image", image: { id: mediaId, mime_type: "image/jpeg" } });
}

export function documentMessage(from = ORGANIZER_NUMBER, id = nextId()) {
  return envelope({ from, id, timestamp: timestamp(), type: "document", document: { id: "doc1", mime_type: "application/pdf" } });
}

export function buttonReply(buttonId: string, from = ORGANIZER_NUMBER, id = nextId()) {
  return envelope({
    from,
    id,
    timestamp: timestamp(),
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id: buttonId, title: "x" } },
  });
}

export async function sign(body: string, secret = "test-app-secret"): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signedPost(payload: object, secret?: string): Promise<Request> {
  const body = JSON.stringify(payload);
  return new Request("http://dancecalendar.test/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": await sign(body, secret) },
    body,
  });
}
