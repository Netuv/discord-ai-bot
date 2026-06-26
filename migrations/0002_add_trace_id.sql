-- 0002: Add missing trace_id columns to content_history & add trace_id fallback
-- Some tables created from an earlier version of 0001_initial.sql may lack trace_id.

ALTER TABLE content_history ADD COLUMN trace_id TEXT NOT NULL DEFAULT '';

-- Also ensure pipeline_metrics has it (it should, but be safe)
-- SQLite: ALTER TABLE ... ADD COLUMN IF NOT EXISTS doesn't exist
-- We rely on the migration being applied once.
