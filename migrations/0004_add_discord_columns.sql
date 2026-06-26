-- 0004: Add remaining missing columns to content_history
-- reactions and comments already exist from 0001

ALTER TABLE content_history ADD COLUMN discord_message_id TEXT DEFAULT '';
ALTER TABLE content_history ADD COLUMN discord_channel_id TEXT DEFAULT '';
