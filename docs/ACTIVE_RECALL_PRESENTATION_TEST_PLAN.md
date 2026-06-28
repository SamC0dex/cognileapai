# Active Recall Presentation Test Plan

Purpose: prove that SM-2 scheduling, Study Agent adaptation, and plan activity constraints work from the algorithm layer through the persisted app workflow.

## What To Prove

1. A rated card gets a new `interval_days` and `next_review_at` that match its rating.
2. The same rating also updates review counters, recall layer, session results, and streak data.
3. Undo restores the previous SM-2 state instead of leaving hidden counter drift.
4. Plan activity sessions persist start/completion telemetry and survive reload.
5. The Study Agent adapts future plan days from learning evidence while preserving completed/current days.

## SM-2 Rating Truth Table

Use this as the expected behavior when explaining ratings:

| Rating | Meaning | Expected scheduling behavior |
| --- | --- | --- |
| `0` | Again / blackout | Reset repetitions to `0`, reduce ease, next review in about `1 minute` |
| `1` | Incorrect after seeing answer | Reset repetitions to `0`, reduce ease, next review in about `10 minutes` |
| `2` | Hard fail | Reset repetitions to `0`, reduce ease, next review in about `10 minutes` |
| `3` | Correct with difficulty | Increase repetitions; first pass schedules `1 day`, second pass `6 days`, later pass uses `interval * ease` |
| `4` | Correct after hesitation | Same interval ladder as pass, with less ease penalty than `3` |
| `5` | Easy | Same interval ladder as pass, ease increases; fast response can extend interval by `5%` |

Extra modifiers:

- `ai_interval_multiplier` multiplies the interval.
- Average response time over `12000ms` shortens passed-card intervals by `10%`.
- Average response time under `3000ms` lengthens passed-card intervals by `5%`.
- Difficulty `hard` applies an extra ease reduction on failures.

## Deterministic Algorithm Checks

Run these as a code-level proof against `src/lib/sm2.ts`:

1. New card, rating `0`:
   - Input: `repetitions=0`, `easeFactor=2.5`, `intervalDays=0`
   - Expected: `repetitions=0`, `easeFactor=2.3`, `intervalDays=0.00069`

2. New card, rating `2`:
   - Expected: `repetitions=0`, `easeFactor=2.3`, `intervalDays=0.00694`

3. New card, rating `3`:
   - Expected: `repetitions=1`, `easeFactor=2.36`, `intervalDays=1`

4. Second correct review, rating `5`:
   - Input: `repetitions=1`, `easeFactor=2.5`, `intervalDays=1`
   - Expected: `repetitions=2`, `easeFactor=2.6`, `intervalDays=6`

5. Mature card, rating `5`, fast response:
   - Input: `repetitions=2`, `easeFactor=2.5`, `intervalDays=6`, `avgResponseTimeMs=2000`
   - Expected: base `15`, fast multiplier `15.75`, new ease `2.6`

6. Mature card, rating `3`, slow response:
   - Input: `repetitions=2`, `easeFactor=2.5`, `intervalDays=6`, `avgResponseTimeMs=13000`
   - Expected: base `15`, slow multiplier `13.5`, new ease `2.36`

## Database Verification Queries

Before rating a card, capture the row:

```sql
select
  id,
  question,
  topic,
  ease_factor,
  interval_days,
  repetitions,
  next_review_at,
  last_reviewed_at,
  recall_layer,
  total_reviews,
  correct_reviews,
  consecutive_correct,
  average_response_time_ms,
  lapse_count
from review_cards
where id = '<CARD_ID>';
```

After rating through the UI or `/api/active-recall/review`, run the same query and verify:

- `interval_days` matches the SM-2 expected value.
- `next_review_at` is approximately now plus `interval_days`.
- `total_reviews` increased by `1`.
- `correct_reviews` increased only for ratings `3`, `4`, or `5`.
- `consecutive_correct` increments on pass and resets on fail.
- `last_reviewed_at` is set.
- `recall_layer` follows `computeLayerTransition()`.

Check the review session result:

```sql
select
  id,
  cards_reviewed,
  cards_correct,
  cards_incorrect,
  results
from review_sessions
where id = '<SESSION_ID>';
```

Expected:

- `cards_reviewed` increments.
- `cards_correct` or `cards_incorrect` increments based on rating.
- `results` contains the card id, rating, response time, previous layer, and new layer.

## Undo Proof

Use one reviewed card where the UI has a previous-state snapshot.

Expected after Undo:

- `review_cards` returns to the captured previous `ease_factor`, `interval_days`, `repetitions`, `next_review_at`, `recall_layer`, counters, response time, and lapse count.
- `review_sessions.results` removes the matching result.
- `cards_reviewed`, `cards_correct`, and `cards_incorrect` decrement safely.

This is the strongest proof that the app is not only scheduling but can also correct accidental ratings without corrupting progress.

## Activity Constraint Proof

Start a plan activity from the plan page, complete it, reload the page, then verify:

```sql
select
  id,
  plan_day,
  activity_index,
  activity_type,
  topic,
  status,
  started_at,
  completed_at,
  duration_ms,
  planned_minutes,
  result_metrics,
  scheduler_context
from plan_activity_sessions
where plan_id = '<PLAN_ID>'
order by started_at desc
limit 5;
```

Expected:

- Starting activity creates a `plan_activity_sessions` row with `status='in_progress'`.
- Completing activity updates it to `status='completed'`.
- `duration_ms` is positive.
- `result_metrics` reflects activity type, topic, planned minutes, reviewed/generated counts where available.
- `scheduler_context` preserves why the scheduler chose the activity.
- After page reload, the UI still shows the activity as completed/tracked.

## Study Agent Adaptation Proof

Seed or use real review history with at least:

- one weak topic: low accuracy, misses, slow response, lapses, or high due load.
- one strong topic: high accuracy with at least two reviews.
- one completed/current day in the plan.
- one or more future days still open.

Call adaptation from the UI or:

```http
POST /api/active-recall/agent/adapt-plan
Content-Type: application/json

{
  "planId": "<PLAN_ID>",
  "request": "I am weak in <TOPIC>; make tomorrow more practice-heavy but keep today's completed work unchanged."
}
```

Expected API behavior:

- It builds learning context from `review_cards`, `review_sessions`, and `plan_activity_sessions`.
- It refuses to adapt if there is no evidence and no user request.
- It preserves all days `<= currentDay`.
- It rewrites only future days.
- Adapted activities include `schedulerReason`, `schedulerBucket`, `schedulerWeight`, `expectedOutcome`, and `rescheduleReason`.
- The response explains weak topics, strong topics, preserved days, and days adjusted.

Database proof:

```sql
select
  id,
  current_day,
  total_activities,
  schedule,
  updated_at
from agent_study_plans
where id = '<PLAN_ID>';
```

Verify:

- completed/current day objects are byte-for-byte logically unchanged.
- future days now mention weak topics or requested constraints.
- future activity metadata explains why each activity was scheduled.

## Presentation Demo Script

1. Show the SM-2 truth table and say ratings map to deterministic intervals.
2. Open a due card, rate it, and show the changed `interval_days` / `next_review_at`.
3. Explain that session counters are updated in the same transaction path.
4. Undo the rating and show the row restored.
5. Complete one planned activity, reload, and show it remains tracked.
6. Run Adapt Plan with a weak-topic request.
7. Show that today/completed days did not change and future days now focus on the weak topic.

## Accuracy Standard

For the presentation, the claim should be:

> SM-2 scheduling is deterministic and directly verifiable row-by-row. The Study Agent is AI-assisted, so we verify it by evidence ingestion, immutable completed days, future-only schedule changes, persisted scheduler rationale, and visible reload-safe activity telemetry.

