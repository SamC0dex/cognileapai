-- Active Recall V3 Migration
-- Mind map integration, agent study plans, plan-linked cards

-- Expand source_type to include mindmap
ALTER TABLE review_cards DROP CONSTRAINT IF EXISTS review_cards_source_type_check;
ALTER TABLE review_cards ADD CONSTRAINT review_cards_source_type_check
  CHECK (source_type IN ('flashcard', 'quiz', 'mindmap'));

-- Link cards to study plans
ALTER TABLE review_cards ADD COLUMN IF NOT EXISTS plan_id UUID;
CREATE INDEX IF NOT EXISTS idx_review_cards_plan ON review_cards(plan_id);

-- Agent study plans (general-purpose, not just exam-linked)
CREATE TABLE IF NOT EXISTS agent_study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_ids UUID[] DEFAULT '{}',
  exam_id UUID REFERENCES exam_dates(id) ON DELETE SET NULL,
  onboarding_context JSONB NOT NULL DEFAULT '{}',
  schedule JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','archived')),
  current_day INTEGER DEFAULT 0,
  total_activities INTEGER DEFAULT 0,
  completed_activities INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_study_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own agent plans" ON agent_study_plans FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_agent_plans_user ON agent_study_plans(user_id);

-- Add plan context to review sessions
ALTER TABLE review_sessions ADD COLUMN IF NOT EXISTS plan_id UUID;
ALTER TABLE review_sessions ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'mixed';
