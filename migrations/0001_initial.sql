-- ============================================================
-- Discord AI Bot — Initial D1 Schema
-- Version: 4.0
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- scheduled_tasks: menyimpan task config per channel
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  cron         TEXT NOT NULL,
  action       TEXT NOT NULL,
  params       TEXT NOT NULL DEFAULT '{}',
  enabled      INTEGER NOT NULL DEFAULT 1,
  channel_id   TEXT NOT NULL,
  guild_id     TEXT NOT NULL,
  category     TEXT,
  format       TEXT,
  timezone     TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_run     TEXT,
  last_status  TEXT CHECK(last_status IN ('success','failed','pending',NULL)),
  run_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_st_enabled  ON scheduled_tasks(enabled);
CREATE INDEX IF NOT EXISTS idx_st_action   ON scheduled_tasks(action);
CREATE INDEX IF NOT EXISTS idx_st_channel  ON scheduled_tasks(channel_id);
CREATE INDEX IF NOT EXISTS idx_st_last_run ON scheduled_tasks(last_run);


-- ────────────────────────────────────────────────────────────
-- task_logs: log setiap eksekusi task
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_logs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id     TEXT NOT NULL,
  task_name   TEXT NOT NULL,
  timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
  status      TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
  message     TEXT,
  error_code  TEXT,
  duration_ms INTEGER,
  trace_id    TEXT,
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tl_task_time ON task_logs(task_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tl_status    ON task_logs(status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tl_trace     ON task_logs(trace_id);


-- ────────────────────────────────────────────────────────────
-- content_history: riwayat artikel yang sudah dipublish
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_history (
  id               TEXT PRIMARY KEY,
  trace_id         TEXT NOT NULL,
  category         TEXT NOT NULL,
  format           TEXT NOT NULL,
  depth            TEXT NOT NULL,
  topic            TEXT NOT NULL,
  topic_normalized TEXT NOT NULL,
  angle            TEXT,
  reason           TEXT,
  trending_score   REAL,
  trigger_type     TEXT NOT NULL DEFAULT 'cron',
  sections_count   INTEGER DEFAULT 0,
  word_count       INTEGER DEFAULT 0,
  provider_used    TEXT,
  model_used       TEXT,
  total_ms         INTEGER,
  discord_message_id TEXT,
  discord_channel_id TEXT,
  published_at     TEXT NOT NULL DEFAULT (datetime('now')),
  reactions        INTEGER DEFAULT 0,
  comments         INTEGER DEFAULT 0,
  engagement_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_ch_published    ON content_history(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_topic        ON content_history(topic_normalized);
CREATE INDEX IF NOT EXISTS idx_ch_format_time  ON content_history(format, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_category     ON content_history(category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_trace        ON content_history(trace_id);


-- ────────────────────────────────────────────────────────────
-- pipeline_metrics: observability per pipeline run
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_metrics (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trace_id         TEXT NOT NULL,
  format           TEXT NOT NULL,
  category         TEXT NOT NULL,
  trigger_type     TEXT NOT NULL,
  strategist_ms    INTEGER,
  research_ms      INTEGER,
  media_ms         INTEGER,
  vision_ms        INTEGER,
  generator_ms     INTEGER,
  publish_ms       INTEGER,
  total_ms         INTEGER NOT NULL,
  generator_attempts INTEGER DEFAULT 1,
  provider_used    TEXT,
  model_used       TEXT,
  subrequests_used INTEGER,
  subrequests_max  INTEGER DEFAULT 50,
  success          INTEGER NOT NULL DEFAULT 1,
  error_message    TEXT,
  error_phase      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_created  ON pipeline_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_success  ON pipeline_metrics(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_provider ON pipeline_metrics(provider_used);
CREATE INDEX IF NOT EXISTS idx_pm_trace    ON pipeline_metrics(trace_id);
CREATE INDEX IF NOT EXISTS idx_pm_format   ON pipeline_metrics(format, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- content_cache: short-lived cache untuk external API results
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_cache (
  cache_key  TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  source     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cc_expires ON content_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cc_source  ON content_cache(source);


-- ────────────────────────────────────────────────────────────
-- dead_letter_queue: pesan yang gagal setelah max retries
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id       TEXT,
  trace_id      TEXT,
  queue_message TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_phase   TEXT,
  error_count   INTEGER NOT NULL DEFAULT 1,
  first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
  resolved      INTEGER NOT NULL DEFAULT 0,
  resolved_at   TEXT,
  resolution    TEXT,
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_dlq_unresolved ON dead_letter_queue(resolved, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_dlq_trace      ON dead_letter_queue(trace_id);


-- ────────────────────────────────────────────────────────────
-- provider_health: track status provider AI
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_health (
  provider             TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_calls          INTEGER NOT NULL DEFAULT 0,
  total_successes      INTEGER NOT NULL DEFAULT 0,
  total_failures       INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms       INTEGER,
  last_failure_at      TEXT,
  last_success_at      TEXT,
  disabled_until       TEXT,
  disabled_reason      TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ────────────────────────────────────────────────────────────
-- webhook_events: log incoming webhook events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source     TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload    TEXT NOT NULL,
  processed  INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_we_source  ON webhook_events(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_we_proc    ON webhook_events(processed, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- plugin_registry: daftar format/platform plugin aktif
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plugin_registry (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK(type IN ('format','platform','source')),
  name        TEXT NOT NULL,
  version     TEXT NOT NULL DEFAULT '1.0.0',
  config      TEXT NOT NULL DEFAULT '{}',
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pr_type    ON plugin_registry(type, enabled);


-- ────────────────────────────────────────────────────────────
-- distribution_log: log hasil distribusi ke social media
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distribution_log (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  content_id      TEXT NOT NULL,
  platform        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
  external_post_id TEXT,
  error_message   TEXT,
  duration_ms     INTEGER,
  distributed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (content_id) REFERENCES content_history(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dl_content  ON distribution_log(content_id);
CREATE INDEX IF NOT EXISTS idx_dl_platform ON distribution_log(platform, distributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dl_status   ON distribution_log(status, distributed_at DESC);
