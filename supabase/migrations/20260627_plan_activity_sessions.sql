-- Durable plan activity telemetry for Active Recall scheduling integrity.
-- Keeps existing agent_study_plans.schedule JSON compatible while making
-- per-activity sessions queryable and auditable.

CREATE TABLE IF NOT EXISTS plan_activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES agent_study_plans(id) ON DELETE CASCADE,
  activity_id TEXT,
  plan_day INTEGER NOT NULL,
  activity_index INTEGER NOT NULL,
  activity_type TEXT NOT NULL,
  document_id UUID,
  generated_source_id TEXT,
  generated_source_type TEXT,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  planned_minutes INTEGER,
  result_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduler_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_activity_sessions_user_started
  ON plan_activity_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_activity_sessions_plan_activity
  ON plan_activity_sessions(plan_id, plan_day, activity_index, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_activity_sessions_status
  ON plan_activity_sessions(user_id, status, started_at DESC);

ALTER TABLE plan_activity_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own plan activity sessions" ON plan_activity_sessions;
CREATE POLICY "Users own plan activity sessions"
  ON plan_activity_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
