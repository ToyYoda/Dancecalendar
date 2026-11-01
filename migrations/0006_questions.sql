-- Blocking questions in chat: .scratch/dance-calendar-mvp/issues/21-blocking-questions.md

-- The question waiting for a typed answer ("Andere Uhrzeit", a Venue's address): JSON {kind, i}.
-- The other answers live on the held Events in `extraction`.
ALTER TABLE submission ADD COLUMN awaiting TEXT;
