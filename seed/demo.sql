-- One demo Event for the walking skeleton, dated tomorrow so it shows in the week feed.
-- Run: npx wrangler d1 execute dancecalendar --remote --file seed/demo.sql   (or --local)
INSERT OR IGNORE INTO organizer (id, whatsapp_number, display_name) VALUES (1, '+490000000000', 'Demo Salsa Kassel');
INSERT OR IGNORE INTO venue (id, name, address) VALUES (1, 'Demo-Tanzsaal', 'Kassel');
INSERT INTO event (title, type, styles, starts_at, intro_class_at, venue_id, organizer_id)
VALUES ('Demo Salsa Night', 'party', '["salsa"]', date('now', '+1 day') || 'T21:00', date('now', '+1 day') || 'T20:00', 1, 1);
