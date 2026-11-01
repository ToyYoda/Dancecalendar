-- Series and Courses: .scratch/dance-calendar-mvp/issues/22-series-and-courses.md
-- `series.rule` is JSON {freq, n?, text?, anchor} (src/series.ts).

-- The fields every occurrence shares, as the Series edit link last set them: JSON (src/series.ts `Template`).
ALTER TABLE series ADD COLUMN template TEXT NOT NULL DEFAULT '{}';
-- The last rule date that has an Event; the daily cron generates the dates after it.
ALTER TABLE series ADD COLUMN generated_until TEXT NOT NULL DEFAULT '';
-- The private Series link (/s/<token>).
ALTER TABLE series ADD COLUMN edit_token TEXT;
CREATE UNIQUE INDEX series_edit_token ON series (edit_token);

-- An occurrence changed through its own edit link: Series edits leave it alone.
ALTER TABLE event ADD COLUMN detached INTEGER NOT NULL DEFAULT 0;
CREATE INDEX event_series ON event (series_id);
