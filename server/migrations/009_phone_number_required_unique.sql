-- 009: phone_number as a required, unique identifier
--
-- DECISION: phone_number is the PRIMARY identifier for MEALVEST students,
-- with email kept as a required secondary identifier. Justification:
-- Kenyan university students overwhelmingly have one consistent,
-- actively-checked phone number tied to M-Pesa (which the rest of
-- MEALVEST already depends on for payments), whereas university-issued
-- emails are inconsistently checked and personal emails vary. Phone
-- number also gives a natural path to SMS-based verification/OTP
-- later without adding a new identifier. Email stays required
-- because Google OAuth is keyed on it and password-reset-by-email is
-- still the most standard recovery path — so both are unique and
-- required, but login/duplicate-account checks treat phone_number as
-- primary.
ALTER TABLE users
  ALTER COLUMN phone_number SET NOT NULL;

CREATE UNIQUE INDEX idx_users_phone_number ON users (phone_number);
