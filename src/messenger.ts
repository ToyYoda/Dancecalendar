import * as telegram from "./telegram/api";
import * as whatsapp from "./whatsapp/graph";

// The bot talks to people through one of two messengers. A chat address is a WhatsApp number
// ("4915200000001") or a Telegram chat ("tg:123456789"); it is what the `whatsapp_number` columns
// hold, a name kept from when WhatsApp was the only channel. Media ids carry the same prefix.

export type Button = { id: string; title: string }; // WhatsApp: title max 20 characters, at most 3 buttons

const TG = "tg:";
export const isTelegram = (address: string) => address.startsWith(TG);

export function sendText(env: Env, to: string, text: string) {
  return isTelegram(to) ? telegram.sendText(env, to.slice(TG.length), text) : whatsapp.sendText(env, to, text);
}

export function sendButtons(env: Env, to: string, text: string, buttons: Button[]) {
  return isTelegram(to) ? telegram.sendButtons(env, to.slice(TG.length), text, buttons) : whatsapp.sendButtons(env, to, text, buttons);
}

export function downloadMedia(env: Env, mediaId: string) {
  return isTelegram(mediaId) ? telegram.downloadFile(env, mediaId.slice(TG.length)) : whatsapp.downloadMedia(env, mediaId);
}

// How the Admin sees an address.
export function showAddress(address: string): string {
  return isTelegram(address) ? `Telegram ${address.slice(TG.length)}` : `+${address.replace(/^\+/, "")}`;
}
