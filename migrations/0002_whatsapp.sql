-- WhatsApp bot state: .scratch/dance-calendar-mvp/issues/17-whatsapp-happy-path.md

-- Meta may deliver a message more than once; the message id makes it idempotent.
CREATE TABLE inbound_message (
  message_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every number that has written to the bot: first-reply disclosure and STOP.
CREATE TABLE contact (
  whatsapp_number TEXT PRIMARY KEY,
  greeted_at TEXT,
  opted_out_at TEXT
);

-- "Admin" typed in the chat: someone wants a human.
CREATE TABLE admin_request (
  id INTEGER PRIMARY KEY,
  whatsapp_number TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A Flyer received from an Organizer, held until Veröffentlichen or Verwerfen.
CREATE TABLE submission (
  id TEXT PRIMARY KEY, -- random, used in button ids
  organizer_id INTEGER NOT NULL REFERENCES organizer(id),
  flyer_key TEXT NOT NULL, -- R2 object key
  received_on TEXT NOT NULL, -- Berlin date the Flyer arrived, YYYY-MM-DD
  extraction TEXT NOT NULL, -- JSON as returned by the model
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'discarded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE event ADD COLUMN edit_token TEXT;
CREATE UNIQUE INDEX event_edit_token ON event (edit_token);
