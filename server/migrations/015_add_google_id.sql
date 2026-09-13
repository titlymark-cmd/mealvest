-- 015: google_id for Google Sign-In
--
-- Nullable + unique: a user is either password-based (password_hash
-- set, google_id null) or Google-based (google_id set, password_hash
-- may be null — see authService.loginWithGoogle) or, if they later
-- link both, both set. google_id stores Google's stable, unique
-- "sub" claim from the verified ID token — NOT the email, because
-- emails can technically be reused/changed at Google's end in edge
-- cases, whereas sub never changes for a given Google account.
ALTER TABLE users
  ADD COLUMN google_id TEXT UNIQUE;

CREATE INDEX idx_users_google_id ON users (google_id);
