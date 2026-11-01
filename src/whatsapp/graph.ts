// WhatsApp Cloud API calls: https://developers.facebook.com/docs/whatsapp/cloud-api

const GRAPH = "https://graph.facebook.com/v26.0";

export type Button = { id: string; title: string }; // title max 20 characters, at most 3 buttons

export async function sendText(env: Env, to: string, text: string) {
  await post(env, { to, type: "text", text: { body: text, preview_url: false } });
}

// Reply buttons can't carry more than 1024 characters of body text, so a long text goes first on its own.
export async function sendButtons(env: Env, to: string, text: string, buttons: Button[]) {
  const short = text.length <= 1024;
  if (!short) await sendText(env, to, text);
  await post(env, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: short ? text : "Wie soll es weitergehen?" },
      action: { buttons: buttons.map((reply) => ({ type: "reply", reply })) },
    },
  });
}

async function post(env: Env, message: object) {
  const res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
}

// Media URLs expire after 5 minutes, so the Flyer is downloaded right away.
export async function downloadMedia(env: Env, mediaId: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const auth = { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) throw new Error(`WhatsApp media lookup failed: ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: auth });
  if (!file.ok) throw new Error(`WhatsApp media download failed: ${file.status}`);
  return { bytes: await file.arrayBuffer(), mimeType: mime_type };
}
