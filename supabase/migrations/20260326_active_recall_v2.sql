-- Active Recall V2 Migration
-- Adds study plans, card explanations cache, and daily goal tracking

-- Enhance exam_dates with linked documents and topics
ALTER TABLE exam_dates
  ADD COLUMN IF NOT EXISTS linked_document_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_topics TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS study_plan_id UUID;

-- Study plans for exam prep
CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exam_dates(id) ON DELETE CASCADE,
  days JSONB NOT NULL DEFAULT '[]',
  total_cards INTEGER DEFAULT 0,
  estimated_hours REAL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exam_id)
);

-- AI card explanations cache
CREATE TABLE IF NOT EXISTS card_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES review_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_id, user_id)
);

-- Extend user_streaks with daily goal tracking
ALTER TABLE user_streaks
  ADD COLUMN IF NOT EXISTS daily_goal INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS daily_progress INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_progress_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS streak_freezes INTEGER DEFAULT 0;

-- RLS policies
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own study plans" ON study_plans FOR ALL USING (auth.uid() = user_id);

ALTER TABLE card_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own explanations" ON card_explanations FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_study_plans_exam ON study_plans(exam_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_card_explanations_card ON card_explanations(card_id);
CREATE INDEX IF NOT EXISTS idx_card_explanations_user ON card_explanations(user_id);
