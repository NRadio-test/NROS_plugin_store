-- Existing records stay untouched and unverified; new rows are central-ID business references.
ALTER TABLE users ADD COLUMN identity_kind TEXT NOT NULL DEFAULT 'legacy' CHECK(identity_kind IN ('legacy','sso'));
CREATE TABLE legacy_account_links(legacy_user_id TEXT PRIMARY KEY REFERENCES users(id),global_user_id TEXT NOT NULL REFERENCES users(id),evidence TEXT NOT NULL,admin_id TEXT NOT NULL,confirmed_at INTEGER NOT NULL);
