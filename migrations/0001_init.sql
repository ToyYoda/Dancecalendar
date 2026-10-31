-- Domain model: .scratch/dance-calendar-mvp/issues/06-event-data-model.md
-- Local times (starts_at, ends_at, intro_class_at) are Europe/Berlin wall-clock "YYYY-MM-DDTHH:MM".

CREATE TABLE organizer (
  id INTEGER PRIMARY KEY,
  whatsapp_number TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  first_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  blocked_at TEXT
);

CREATE TABLE venue (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A Course is a Series of Workshops with registration_required = 1.
CREATE TABLE series (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER REFERENCES organizer(id),
  rule TEXT NOT NULL, -- JSON: weekly, every N weeks, or Nth weekday of the month
  registration_required INTEGER NOT NULL DEFAULT 0,
  last_sign_of_life TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE event (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('party', 'workshop', 'festival')),
  styles TEXT NOT NULL DEFAULT '[]', -- JSON array from: salsa, bachata, kizomba, urban_kiz, wcs
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  intro_class_at TEXT, -- Parties only
  level TEXT, -- Workshops only, free text from the Flyer
  description TEXT,
  price TEXT,
  link TEXT,
  venue_id INTEGER NOT NULL REFERENCES venue(id),
  organizer_id INTEGER REFERENCES organizer(id), -- empty for an unassigned Tip Event
  shown_as TEXT, -- Tip Events: the name taken from the Flyer
  is_tip INTEGER NOT NULL DEFAULT 0,
  flyer_key TEXT, -- R2 object key
  series_id INTEGER REFERENCES series(id),
  cancelled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX event_starts_at ON event (starts_at);
