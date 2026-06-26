-- 0003 (safe): Add missing word_count column to content_history
-- Other columns already exist from 0001

ALTER TABLE content_history ADD COLUMN word_count INTEGER DEFAULT 0;
