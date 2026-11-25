-- The Organizer area at /veranstalter (src/portal.tsx): logging in on the website with Telegram or Google.
-- An address is what the organizer.whatsapp_number column holds: "tg:<chat id>", a WhatsApp number, or
-- "web:<random>" for someone who logged in with Google only and has no chat with the bot.

-- A logged-in browser. `id` is the SHA-256 of the cookie's value, so the table alone logs nobody in.
CREATE TABLE web_session (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX web_session_address ON web_session (address);

-- A Telegram login in progress: the browser opens t.me/DanceCalBot?start=login-<code>, the bot asks
-- "Warst du das?", and a yes sets `address`. `browser` is the SHA-256 of a cookie only the browser that
-- started the login has, so a link someone else was sent logs in nobody but its starter. 10 minutes.
CREATE TABLE login_request (
  code TEXT PRIMARY KEY,
  browser TEXT NOT NULL,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);

-- A Google account (its `sub`) and the address it logs in as; the email is shown to its owner only.
CREATE TABLE web_login (
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  subject TEXT NOT NULL,
  address TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, subject)
);
