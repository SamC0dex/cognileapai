-- ============================================
-- ActiveRecall: AI-Powered Spaced Repetition
-- Migration: 20260325
-- ============================================

-- ============================================
-- TABLE: review_cards
-- Core SM-2 tracking, one row per reviewable item
-- ============================================
CREATE TABLE IF NOT EXISTS review_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source linking
  source_type TEXT NOT NULL CHECK (source_type IN ('flashcard', 'quiz')),
  source_id TEXT NOT NULL,
  source_set_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Card content (denormalized for fast access)
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  options JSONB,
  correct_answer INTEGER,
  topic TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),

  -- SM-2 algorithm state
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,

  -- Multi-layer recall state (1=ABSORB, 2=RECOGNIZE, 3=RETRIEVE, 4=MASTERED)
  recall_layer INTEGER NOT NULL DEFAULT 1 CHECK (recall_layer BETWEEN 1 AND 4),

  -- AI adjustment overrides
  ai_interval_multiplier REAL NOT NULL DEFAULT 1.0,
  ai_notes TEXT,

  -- Performance stats
  total_reviews INTEGER NOT NULL DEFAULT 0,
  correct_reviews INTEGER NOT NULL DEFAULT 0,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  average_response_time_ms INTEGER,
  lapse_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_review_cards_user_due ON review_cards(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_review_cards_user_document ON review_cards(user_id, document_id);
CREATE INDEX IF NOT EXISTS idx_review_cards_user_layer ON review_cards(user_id, recall_layer);
CREATE INDEX IF NOT EXISTS idx_review_cards_source_set ON review_cards(user_id, source_set_id);

-- ============================================
-- TABLE: review_sessions
-- Tracks each review session for analytics
-- ============================================
CREATE TABLE IF NOT EXISTS review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  cards_reviewed INTEGER NOT NULL DEFAULT 0,
  cards_correct INTEGER NOT NULL DEFAULT 0,
  cards_incorrect INTEGER NOT NULL DEFAULT 0,

  results JSONB NOT NULL DEFAULT '[]'::jsonb,

  total_time_ms INTEGER,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_sessions_user ON review_sessions(user_id, started_at DESC);

-- ============================================
-- TABLE: notification_preferences
-- User notification settings
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  push_enabled BOOLEAN NOT NULL DEFAULT false,
  push_subscription JSONB,

  telegram_enabled BOOLEAN NOT NULL DEFAULT false,

  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  daily_reminder_time TIME DEFAULT '09:00',
  max_notifications_per_day INTEGER NOT NULL DEFAULT 3,

  daily_summary_enabled BOOLEAN NOT NULL DEFAULT true,
  weekly_report_enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

-- ============================================
-- TABLE: telegram_connections
-- Telegram bot account linking
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  telegram_chat_id BIGINT NOT NULL,
  telegram_username TEXT,
  link_token TEXT,
  link_token_expires_at TIMESTAMPTZ,

  is_active BOOLEAN NOT NULL DEFAULT true,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id),
  UNIQUE(telegram_chat_id)
);

-- ============================================
-- TABLE: weekly_reports
-- AI-generated weekly learning reports
-- ============================================
CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  week_start DATE NOT NULL,
  week_end DATE NOT NULL,

  report_markdown TEXT NOT NULL,
  stats JSONB NOT NULL,

  sent_telegram BOOLEAN NOT NULL DEFAULT false,
  sent_push BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, week_start)
);

-- ============================================
-- TABLE: learning_analytics
-- Per-topic retention and forgetting curve data
-- ============================================
CREATE TABLE IF NOT EXISTS learning_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  topic TEXT,

  retention_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_retention REAL,
  decay_rate REAL,
  optimal_interval_days REAL,
  ai_difficulty_assessment TEXT CHECK (ai_difficulty_assessment IN ('fast-learner', 'needs-repetition', 'stable')),

  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, document_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_learning_analytics_user ON learning_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_analytics_retention ON learning_analytics(user_id, current_retention);

-- ============================================
-- TABLE: exam_dates
-- User exam dates for pre-exam coaching
-- ============================================
CREATE TABLE IF NOT EXISTS exam_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  exam_date DATE NOT NULL,
  reminder_days_before INTEGER[] DEFAULT '{7, 3, 1}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_dates_user ON exam_dates(user_id, exam_date);

-- ============================================
-- EXTEND: user_streaks (add review-specific fields)
-- ============================================
ALTER TABLE user_streaks
  ADD COLUMN IF NOT EXISTS total_cards_reviewed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_review_date DATE;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- review_cards
ALTER TABLE review_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own review cards"
  ON review_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own review cards"
  ON review_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own review cards"
  ON review_cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own review cards"
  ON review_cards FOR DELETE
  USING (auth.uid() = user_id);

-- review_sessions
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions"
  ON review_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions"
  ON review_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON review_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification prefs"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification prefs"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification prefs"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- telegram_connections
ALTER TABLE telegram_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own telegram connection"
  ON telegram_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own telegram connection"
  ON telegram_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own telegram connection"
  ON telegram_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own telegram connection"
  ON telegram_connections FOR DELETE
  USING (auth.uid() = user_id);

-- weekly_reports
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weekly reports"
  ON weekly_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weekly reports"
  ON weekly_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- learning_analytics
ALTER TABLE learning_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analytics"
  ON learning_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analytics"
  ON learning_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analytics"
  ON learning_analytics FOR UPDATE
  USING (auth.uid() = user_id);

-- exam_dates
ALTER TABLE exam_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exam dates"
  ON exam_dates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exam dates"
  ON exam_dates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exam dates"
  ON exam_dates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exam dates"
  ON exam_dates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- HELPER: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_active_recall_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_review_cards_timestamp
BEFORE UPDATE ON review_cards
FOR EACH ROW
EXECUTE FUNCTION update_active_recall_timestamp();

CREATE TRIGGER update_notification_preferences_timestamp
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_active_recall_timestamp();

CREATE TRIGGER update_learning_analytics_timestamp
BEFORE UPDATE ON learning_analytics
FOR EACH ROW
EXECUTE FUNCTION update_active_recall_timestamp();
