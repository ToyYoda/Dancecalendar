-- Edit links and the Organizer web upload: .scratch/dance-calendar-mvp/issues/19-edit-links.md

-- 'web': uploaded by an Organizer from an edit page. SQLite can't change a CHECK, so the table is rebuilt.
CREATE TABLE submission_new (
  id TEXT PRIMARY KEY, -- random, used in button ids
  organizer_id INTEGER NOT NULL REFERENCES organizer(id),
  flyer_key TEXT NOT NULL, -- R2 object key
  received_on TEXT NOT NULL, -- Berlin date the Flyer arrived, YYYY-MM-DD
  extraction TEXT NOT NULL, -- JSON as returned by the model
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'discarded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirm_token TEXT, -- the private link of the web confirm page (/c/<token>)
  -- 'admin': uploaded at /admin/upload under a chosen Organizer; 'admin' and 'web' get no WhatsApp reply.
  source TEXT NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'admin', 'web'))
);
INSERT INTO submission_new (id, organizer_id, flyer_key, received_on, extraction, status, created_at, confirm_token, source)
  SELECT id, organizer_id, flyer_key, received_on, extraction, status, created_at, confirm_token, source FROM submission;
DROP TABLE submission;
ALTER TABLE submission_new RENAME TO submission;
CREATE UNIQUE INDEX submission_confirm_token ON submission (confirm_token);
