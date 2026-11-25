-- Organizers post under their own name: no Display name, no private first name.
-- Decision: docs/adr/0003-organizer-personal-name.md, .scratch/dance-calendar-mvp/issues/32-organizer-name-and-groups.md
-- Numbered 0010 because 0009 is taken by web login on the prototype/design-review branch.

-- Existing Display names become names as they are; nothing is merged.
ALTER TABLE organizer RENAME COLUMN display_name TO name;
ALTER TABLE organizer DROP COLUMN first_name;

-- The extraction's name from the Flyer is now `organizer_name_on_flyer`; rename it in Flyers still held.
UPDATE submission
SET extraction = json_set(json_remove(extraction, '$.display_name_on_flyer'), '$.organizer_name_on_flyer', json_extract(extraction, '$.display_name_on_flyer'))
WHERE json_type(extraction, '$.display_name_on_flyer') IS NOT NULL;
UPDATE application
SET extraction = json_set(json_remove(extraction, '$.display_name_on_flyer'), '$.organizer_name_on_flyer', json_extract(extraction, '$.display_name_on_flyer'))
WHERE extraction IS NOT NULL AND json_type(extraction, '$.display_name_on_flyer') IS NOT NULL;
