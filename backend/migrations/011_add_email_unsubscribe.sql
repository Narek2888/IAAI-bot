-- Add email unsubscribe support
-- - email_unsubscribed: opt-out flag for non-transactional emails (e.g. vehicle updates)
-- - unsubscribe_token: per-user token used in unsubscribe links

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;

-- Allow fast token lookup; permits multiple NULLs
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unsubscribe_token
ON users(unsubscribe_token)
WHERE unsubscribe_token IS NOT NULL;
