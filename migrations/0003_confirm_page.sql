-- Web confirm page and Admin Flyer upload: .scratch/dance-calendar-mvp/issues/18-confirm-page-and-admin-upload.md

-- The private link of the web confirm page (/c/<token>), set on [Ändern] or at an Admin upload.
ALTER TABLE submission ADD COLUMN confirm_token TEXT;
CREATE UNIQUE INDEX submission_confirm_token ON submission (confirm_token);

-- 'admin': uploaded at /admin/upload under a chosen Organizer, so nobody gets a WhatsApp reply.
ALTER TABLE submission ADD COLUMN source TEXT NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'admin'));
