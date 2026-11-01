-- Tips: .scratch/dance-calendar-mvp/issues/24-tips.md

-- A Tip is a submission without an Organizer ('tip'), held for the Admin's review at /admin/tips.
-- SQLite can't drop a NOT NULL or change a CHECK, so the table is rebuilt.
CREATE TABLE submission_new (
  id TEXT PRIMARY KEY, -- random, used in button ids
  organizer_id INTEGER REFERENCES organizer(id), -- empty for a Tip
  flyer_key TEXT NOT NULL, -- R2 object key
  received_on TEXT NOT NULL, -- Berlin date the Flyer arrived, YYYY-MM-DD
  extraction TEXT NOT NULL, -- JSON as returned by the model
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'discarded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirm_token TEXT, -- the private link of the web confirm page (/c/<token>, a Tip's /admin/tips/<token>)
  -- 'admin': uploaded at /admin/upload under a chosen Organizer; 'admin', 'web' and 'tip' get no WhatsApp reply.
  source TEXT NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'admin', 'web', 'tip')),
  awaiting TEXT -- the question waiting for a typed answer: JSON {kind, i}
);
INSERT INTO submission_new (id, organizer_id, flyer_key, received_on, extraction, status, created_at, confirm_token, source, awaiting)
  SELECT id, organizer_id, flyer_key, received_on, extraction, status, created_at, confirm_token, source, awaiting FROM submission;
DROP TABLE submission;
ALTER TABLE submission_new RENAME TO submission;
CREATE UNIQUE INDEX submission_confirm_token ON submission (confirm_token);

-- A Tip Series: the name its generated Events are shown under while it has no Organizer.
ALTER TABLE series ADD COLUMN shown_as TEXT;
