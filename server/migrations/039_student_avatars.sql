-- 039: student profile pictures
--
-- Same Storage pattern as hotel-images (migration-less bucket, since
-- Supabase Storage bucket metadata lives in storage.buckets in this
-- same Postgres database) — a separate bucket, not reused, so a
-- student's avatar and a hotel's menu photos stay in distinct,
-- independently-manageable namespaces.
ALTER TABLE students ADD COLUMN avatar_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('student-avatars', 'student-avatars', true, 4194304, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
