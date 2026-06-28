# Active Recall Agent Full-Potential Test Matrix

Purpose: test how smart, personalized, and reliable the Study Agent is under presentation pressure.

## Success Standard

The agent is successful only if it:

- uses the selected document and existing plan/card data, not generic advice.
- asks for missing critical inputs before creating a plan.
- creates plans with varied Learn -> Practice -> Remember activities.
- generates only today's requested material on demand.
- adapts future days from weak topics, strong topics, due load, review history, and tracked activity sessions.
- preserves completed/current work during adaptation.
- exposes failure states and retry paths instead of silently pretending work succeeded.

## Test 1: Personalization From Context

Prompt:

```text
I have 2 days for my AI exam. I am weak in Bayes theorem and Markov chains, but okay with linear regression. I can study 45 minutes daily. Make this intense but realistic.
```

Pass criteria:

- Agent references the deadline, weak topics, and available time.
- It chooses an intensive short plan.
- It schedules more quiz/flashcard work for weak topics.
- It does not produce a generic 7-day plan.
- If document selection is missing, it asks for the document first instead of inventing one.

## Test 2: Tool Choice Intelligence

Prompt:

```text
For this document, generate only what helps me understand the big picture first. Don't make quiz questions yet.
```

Pass criteria:

- Agent chooses summary, study guide, smart notes, or mind map.
- It does not generate quiz.
- If using mind maps, it includes topic-focused generation rather than one giant map.
- Generated material is tied to the selected document id.

## Test 3: Plan Creation Action Quality

Prompt:

```text
Create a 5-day plan for this document. My goal is exam prep, I have 30 minutes daily, I know the basics, and I want standard intensity.
```

Pass criteria:

- `CREATE_PLAN` action includes `documentIds`, `durationDays`, `dailyAvailableMinutes`, `currentUnderstanding`, and `preferredIntensity`.
- Created schedule has exactly 5 days.
- Activity count varies naturally based on time and urgency.
- Activities include `schedulerReason`, `schedulerBucket`, `schedulerWeight`, and `expectedOutcome`.
- Day 1 respects prior knowledge: basics known means it can start with practice/review, not only passive reading.

## Test 4: Unsatisfied User Adaptation

Prompt from a plan page:

```text
This plan feels too generic. I keep failing Bayes theorem. Make tomorrow more practice-heavy and reduce passive reading.
```

Pass criteria:

- Agent emits `ADAPT_PLAN`.
- Request text is passed through.
- Adaptation preserves days `<= currentDay`.
- Future days include more Bayes theorem flashcards/quiz/review.
- Future passive reading is reduced, not removed entirely if learning context still needs it.
- The response explains what changed and why.

## Test 5: Failure And Retry

Force a generation failure by using a blocked provider or invalid generation target.

Pass criteria:

- Activity changes to `generating` while request runs.
- On failure, activity becomes `failed` / visible `Blocked`.
- Retry button appears.
- The plan does not mark the activity ready or completed.
- A later successful retry updates `generatedSourceId`, `generatedSourceType`, `cardCount`, and `generationStatus='ready'`.

## Test 6: Memory From Activity Sessions

Complete a non-card activity, reload, then adapt.

Pass criteria:

- `plan_activity_sessions` records the activity type, topic, status, duration, result metrics, and scheduler context.
- Reload still shows tracked study time.
- Adaptation prompt includes recent non-card activity sessions.
- Adapted future days reflect completed activity history.

## Test 7: Due-Card Scheduling Integrity

Rate at least three cards:

- one `Again`
- one `Good`
- one `Easy`

Pass criteria:

- `Again` is due in about one minute.
- `Good` first pass is due in one day.
- `Easy` mature card extends the interval.
- Due-card review pressure appears in plan adaptation when due load is high.

## Test 8: Safety Against Bad Actions

Prompt:

```text
What should I review today?
```

Pass criteria:

- Agent may recommend review, but must not start review unless explicitly asked.

Prompt:

```text
Start my review session now.
```

Pass criteria:

- Agent may emit `START_REVIEW`.

## Presentation Demo Order

1. Run `node scripts/verify-sm2.mjs`.
2. Run `node scripts/verify-agent-prompts.mjs`.
3. Create or open a plan with weak/strong topic data.
4. Generate one activity and show ready state.
5. Force or explain failure handling with blocked state and Retry.
6. Rate cards and show next review timestamps.
7. Ask for adaptation from the plan page and show future-only changes with scheduler reasons.

## Immediate Fix Rule

If any test fails:

- prompt/action failure: fix `src/lib/active-recall-prompts.ts` or `src/components/active-recall/v2/ai-chat-sidebar.tsx`.
- plan structure failure: fix `src/app/api/active-recall/agent/create-plan/route.ts`.
- adaptation failure: fix `src/app/api/active-recall/agent/adapt-plan/route.ts` or `src/lib/active-recall-learning-context.ts`.
- activity telemetry failure: fix `src/app/api/active-recall/agent/plans/[id]/route.ts` and plan detail UI.
- SM-2 failure: fix `src/lib/sm2.ts` and rerun `scripts/verify-sm2.mjs`.

