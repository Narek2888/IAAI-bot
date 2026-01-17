ALTER TABLE email_otps
ADD COLUMN IF NOT EXISTS purpose TEXT;

ALTER TABLE email_otps
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_otps_user_purpose ON email_otps(user_id, purpose);
