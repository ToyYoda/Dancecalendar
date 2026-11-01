-- Organizer application: .scratch/dance-calendar-mvp/issues/20-organizer-application.md

-- A Flyer from an unregistered number, held while its sender applies; deleted after 24 hours.
CREATE TABLE application (
  id TEXT PRIMARY KEY, -- random, used in button ids; becomes the submission's id on resume
  whatsapp_number TEXT NOT NULL,
  flyer_key TEXT NOT NULL, -- R2 object key
  mime_type TEXT NOT NULL,
  received_on TEXT NOT NULL, -- Berlin date the Flyer arrived, YYYY-MM-DD
  extraction TEXT, -- JSON, once the Flyer is read (after "Ja, meine")
  token TEXT UNIQUE, -- the single-use apply link /a/<token>, set on "Ja, meine"
  completed_at TEXT, -- the form was submitted
  resumed_at TEXT, -- the held Flyer moved on to a submission and its summary
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- "Nein, ist ein Tipp": this number sends Tips, so the bot doesn't ask again.
ALTER TABLE contact ADD COLUMN tip_at TEXT;
