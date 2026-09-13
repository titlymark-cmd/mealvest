-- 024: menu item image URL
--
-- Deliberately just a TEXT URL column, not a file-upload/binary
-- storage system — this environment has no image storage
-- infrastructure (S3/Cloudinary/etc.) configured, and per the
-- explicit instruction not to fake upload functionality, this adds
-- exactly the field a real upload flow would eventually write into
-- (a hosted image's URL) without pretending uploads work today. A
-- hotel can paste an already-hosted image URL now; real device
-- upload becomes a client-side-only addition later, writing to this
-- same column via the existing updateMenuItem endpoint — no schema
-- change needed when that's built.
ALTER TABLE menu_items
  ADD COLUMN image_url TEXT;
