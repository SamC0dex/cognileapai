-- ============================================
-- Adaptive Learning System Migration
-- Adds columns for post-session analysis, smart scheduling, and stuck card detection
-- ============================================

-- Track post-session analysis status on review_sessions
ALTER TABLE review_sessions
ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS analysis_result JSONB;

-- Smart scheduling priority score and stuck card detection on review_cards
ALTER TABLE review_cards
ADD COLUMN IF NOT EXISTS priority_score REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS stuck_since TIMESTAMPTZ;

-- Index for priority-based card ordering (filtering done at query time)
CREATE INDEX IF NOT EXISTS idx_review_cards_priority
ON review_cards (user_id, priority_score DESC, next_review_at);

-- Index for stuck card detection queries
CREATE INDEX IF NOT EXISTS idx_review_cards_stuck
ON review_cards (user_id, stuck_since)
WHERE stuck_since IS NOT NULL;
