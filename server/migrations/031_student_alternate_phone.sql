-- 031: alternate_phone_number on users — a second contact number a
-- student can add from their profile screen (e.g. a parent/guardian's
-- number), separate from the primary phone_number used for sign-in
-- and M-Pesa. Nullable, optional, no default.
ALTER TABLE users ADD COLUMN alternate_phone_number TEXT;
