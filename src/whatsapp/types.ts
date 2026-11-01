// The parts of a WhatsApp Cloud API inbound message the bot reads.
export type InboundMessage = {
  id: string;
  from: string; // sender's number, digits only, e.g. "4915200000001"
  timestamp: string; // unix seconds
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string };
  interactive?: { type: string; button_reply?: { id: string; title: string } };
};
