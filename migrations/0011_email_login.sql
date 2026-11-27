-- Logging in at /veranstalter with an email address (ADR 0006): a link in an email, sent through Brevo.

-- web_login now also holds email logins: provider 'email', subject the address in lowercase. SQLite
-- can't change a CHECK, so the table is rebuilt with the same rows.
CREATE TABLE web_login_new (
  provider TEXT NOT NULL CHECK (provider IN ('google', 'email')),
  subject TEXT NOT NULL,
  address TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, subject)
);
INSERT INTO web_login_new (provider, subject, address, email, created_at) SELECT provider, subject, address, email, created_at FROM web_login;
DROP TABLE web_login;
ALTER TABLE web_login_new RENAME TO web_login;

-- A link that was emailed. `id` is the SHA-256 of the link's token, so the table alone logs nobody in.
-- The link works for 15 minutes and once (`used_at`). Rows stay a day so that the number of mails per
-- address and per day can be capped, then the hourly cron deletes them.
CREATE TABLE email_login (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT
);
CREATE INDEX email_login_email ON email_login (email, created_at);
