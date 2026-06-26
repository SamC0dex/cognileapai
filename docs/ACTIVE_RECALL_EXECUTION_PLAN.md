# Active Recall Execution Plan

Status: Module 4 checkpoint complete; ready for Module 5
Owner: Project agents working on CogniLeapAI Active Recall
Core rule: do not expand scope until the current module is complete and verified.

Checkpoint rule: after each module passes automated and user-flow verification, commit the module as its own checkpoint before starting the next module. This keeps regressions easy to isolate and revert without losing unrelated progress.

Experience rule: UI/UX quality is not optional polish. Any module that changes user-facing behavior must preserve or improve the app's clean, smooth, thematically consistent experience before it can be considered complete.

## Product Definition

Active Recall is the hero learning feature of CogniLeapAI.

It is not only manual flashcards or quizzes. It is an AI-guided system where a user selects a document, chats with the study agent, receives a personalized study plan, generates the right material only when needed, reviews that material, and can ask the agent to adapt future work based on performance.

The name stays **Active Recall**. Internally, it includes:

- Learn: summaries, study guides, notes, explanations, mind maps.
- Practice: quizzes, guided questions, flashcards.
- Remember: due cards, SM-2 spaced repetition, weak-topic review, mastery tracking.

## Non-Negotiable MVP Flow

The feature is not complete until this full flow works:

- [ ] User opens Active Recall.
- [ ] User selects a document.
- [ ] Study agent asks or infers setup details:
  - goal
  - deadline or exam date
  - daily available study time
  - current understanding level
  - preferred intensity
- [ ] Agent creates a personalized study plan.
- [ ] Dashboard shows today's plan clearly.
- [ ] User can generate today's material on demand.
- [ ] Generated material is connected to the plan and review system.
- [ ] User completes the review or activity.
- [ ] Progress updates in the dashboard.
- [ ] User can ask the agent to adapt future days based on performance.
- [ ] Notifications can remind the user about planned study and due reviews.
- [ ] Predictive/readiness data exists enough for the agent to make adaptation suggestions.

## Stop Line

Stop polishing when this demo is reliable:

> I selected a document, the agent made a plan, today's task was generated on demand, I reviewed it, and the system updated what I should do next.

Do not block completion on:

- [ ] Weekly reports.
- [ ] Full autonomous background adaptation.
- [ ] Generating the whole plan's study material upfront.
- [ ] Advanced analytics dashboards beyond the minimum readiness and weak-topic context.
- [ ] Telegram-specific polish unless the basic notification flow is already stable.
- [ ] Large UI redesigns unrelated to the core flow.

## Current Known State

Already present in the codebase:

- [x] Active Recall dashboard route.
- [x] Review card database model.
- [x] SM-2 scheduling logic.
- [x] Review session page.
- [x] Flashcard sync into review cards.
- [x] Quiz sync into review cards.
- [x] Agent study plan tables and routes.
- [x] Exam date support.
- [x] AI chat/sidebar surface.
- [x] Notification-related schema/routes.
- [x] Predictive/analytics route surface.
- [x] Mind map sync/review pieces.

Known gaps or risks:

- [ ] Undo sends `undo: true`, but the review API currently does not implement undo handling.
- [ ] There are two review/session stores; the active review flow should have one clear source of truth.
- [ ] Sync count reporting can be misleading because duplicate upserts are counted as synced.
- [ ] Existing synced cards may not refresh content when generated material changes.
- [ ] Mind map group review exists in the store but is not clearly wired into the review page.
- [ ] Agent plan activity types need to support Learn, Practice, and Remember work, not only flashcards/quizzes/mind maps.
- [ ] Predictive analysis should first serve agent adaptation, not a large standalone analytics product.

## Module 0: Orientation And Guardrails

Goal: make sure every agent starts from the same understanding.

### Tasks

- [x] Read this file fully.
- [x] Read `AGENTS.md`.
- [x] Inspect current Active Recall routes, stores, API routes, and migrations before editing.
- [x] Confirm unrelated worktree changes and do not overwrite them.
- [x] Update this file after each module with current status and notes.

### Verification Gate

- [x] Agent can explain the current Active Recall flow from document selection to review completion.
- [x] Agent identifies the exact files being changed before editing.
- [x] No implementation starts before scope is tied to one module below.
- [x] Module checkpoint decision is documented before continuing.

## Module 1: Plan Model And Activity Types

Status: Complete

Goal: define the study plan spine so Active Recall supports learning from scratch and long-term retention.

### Required Activity Types

Use a small controlled set first:

- [x] `study_guide`
- [x] `summary`
- [x] `smart_notes`
- [x] `mindmap`
- [x] `flashcards`
- [x] `quiz`
- [x] `review_due_cards`

### Tasks

- [x] Audit existing `AgentStudyPlan`, `PlanScheduleDay`, and `PlanActivity` types.
- [x] Update types so activities can represent Learn, Practice, and Remember tasks.
- [x] Ensure each activity can store:
  - activity type
  - document id
  - topic or section
  - planned duration
  - generation status
  - generated source id when material exists
  - completion status
- [x] Keep backward compatibility with existing plans where reasonable.
- [x] Avoid generating all study material during plan creation.

### Verification Gate

- [x] Typecheck passes.
- [x] Existing plan routes still compile.
- [x] A plan can represent a beginner path with summaries/study guides before quizzes.
- [x] A plan can represent a retention path with due reviews and flashcards.
- [x] User-flow/browser verification completed before checkpoint commit.
- [x] UI/UX review completed before checkpoint commit.
- [x] Module checkpoint commit created.

## Module 2: Agent Onboarding And Plan Creation

Status: Complete

Goal: make the agent create useful personalized plans from document context and user chat.

### Tasks

- [x] Audit `src/app/api/active-recall/agent/create-plan/route.ts`.
- [x] Ensure the agent considers:
  - selected document
  - document size
  - document difficulty if available or inferred
  - user goal
  - deadline/exam date
  - daily available time
  - current understanding
  - preferred intensity
- [x] Produce a schedule with daily activities, not pre-generated materials.
- [x] Include Learn activities for users starting from scratch.
- [x] Include Practice and Remember activities for users who already understand the topic.
- [x] Store enough onboarding context for future adaptation.

### Verification Gate

- [x] Creating a plan for "new to this topic" includes Learn activities before heavy testing.
- [x] Creating a plan for "already studied, need retention" prioritizes review, flashcards, and quiz.
- [x] Plan creation does not generate all study material upfront.
- [x] Typecheck passes.
- [x] User-flow/browser verification completed before checkpoint commit.
- [x] UI/UX review completed before checkpoint commit.
- [x] Module checkpoint commit created.

## Module 3: Dashboard And Today's Plan

Status: Complete

Goal: make the Active Recall dashboard show exactly what the user should do next.

### Tasks

- [x] Audit `ActiveRecallDashboard`, `ActivePlanCard`, and today's plan routes.
- [x] Show today's planned activities in a clear sequence.
- [x] Show whether each activity is not generated, ready, completed, or blocked.
- [x] Add a clear "Generate today's material" or per-activity generation action.
- [x] Do not show advanced analytics as the primary call to action.
- [x] Make empty state guide the user to select a document and chat with the agent.

### Verification Gate

- [x] A user can tell what to do today within 5 seconds.
- [x] Empty state does not imply Active Recall is only manual flashcards.
- [x] Today's activity state persists after reload.
- [x] Typecheck passes.
- [x] User-flow/browser verification completed before checkpoint commit.
- [x] UI/UX review completed before checkpoint commit.
- [x] Module checkpoint commit created.

## Module 4: On-Demand Material Generation

Status: Complete

Goal: generate only the material needed for today's activities, reducing cost and setup time.

### Tasks

- [x] Connect each activity type to existing study tool generation where possible.
- [x] Generate material for one selected activity or today's due set.
- [x] Save generated material source ids back to the plan activity.
- [x] Sync flashcards and quizzes to review cards after generation.
- [x] Add or verify mind map sync only if mind map activity is enabled.
- [x] Handle generation failure with a retry state.

### Verification Gate

- [x] User can generate today's flashcards from a plan activity.
- [x] User can generate today's quiz from a plan activity.
- [x] Generated flashcards/quizzes appear in Active Recall review when appropriate.
- [x] Existing ready material is reused instead of regenerated accidentally.
- [x] Pending material is not hidden behind old due-card review actions.
- [x] New on-demand plans do not auto-link unrelated old generated cards on plan detail load.
- [x] Failed or provider-blocked generation returns the activity to a visible Retry state.
- [x] Typecheck passes.
- [x] User-flow/browser verification completed for ready, pending, generating, and blocked states.
- [x] UI/UX review completed for ready, pending, generating, and blocked states.
- [x] Module checkpoint commit created.

### Module 4 Verification Notes

- Implemented per-activity generation on plan detail rows using the existing study tool generator, plan activity generation-state persistence, and Active Recall sync for flashcards, quizzes, and mind maps.
- Browser-tested an existing ready plan at `/active-recall/plan/ffaec381-fad1-40a9-9303-4519e5d246ca`: ready activities now show Review/Revisit actions, not Generate, and the page loads without runtime errors.
- Created a controlled smoke-test plan at `/active-recall/plan/271fd123-ab16-47dd-956b-7bd7c30da976` with pending flashcard and quiz activities. Dashboard showed `Needs material` rows and the primary `Prepare Today's Material` CTA.
- Browser-tested flashcard and quiz Generate actions. Both entered disabled `Generating` state correctly, then the configured Kie provider returned `403 Your request was blocked`; both activities recovered to `Blocked` with `Retry`.
- Provider health checks confirmed Kie returns 403 when the Gemini endpoint receives an OpenAI SDK body with a `model` field, but succeeds with Kie's documented model-in-URL request shape. Updated Kie/Gemini non-streaming requests to call Kie directly with content-array messages and no `model` field in the body.
- Moved plan activity review-card sync into `/api/study-tools/generate` when the request includes `planId`, `planDay`, and `activityIndex`, so a successful generation now atomically saves material, links review cards to the plan, and updates the activity to `ready`.
- Re-tested the smoke plan after the Kie fix in the in-app browser. Flashcards and quiz both entered disabled `Generating`, completed to `Ready`, exposed `Review` actions, and updated plan stats.
- Database verification for smoke plan `271fd123-ab16-47dd-956b-7bd7c30da976`: flashcard activity ready with source `41a9ef9e-3a5c-409d-99e7-a41d2c2a6d2c`, quiz activity ready with source `ddfb0f79-f96c-4bb6-97a1-0a009d92150a`, 16 review cards attached to the plan (`10` flashcard, `6` quiz), 12 currently due.
- Verification commands: `pnpm typecheck` passed; `pnpm lint` passed with pre-existing warnings.
- Fixed the smoke-test issues found during browser verification: generating rows no longer expose Review prematurely, pending on-demand plans no longer auto-link unrelated old document cards, and empty/blocked plans no longer show a misleading start-session CTA.
- Keep old generated material as legacy-valid review content during MVP hardening. Do not remove it until the full Active Recall flow is stable and there is a deliberate migration/removal module near the end.

## Module 5: Review Loop Stabilization

Status: Partial stabilization complete

Goal: make the review engine reliable before adding more intelligence.

### Tasks

- [x] Fix undo handling in `/api/active-recall/review`.
- [x] Decide the canonical review store and remove or quarantine duplicate session logic.
- [x] Fix sync result counting for new vs existing cards.
- [x] Decide whether content updates should refresh existing card question/answer/options while preserving SM-2 state.
- [ ] Verify session completion updates:
  - reviewed count
  - accuracy
  - due count
  - streak
  - recent sessions
- [x] Ensure closing a session does not lose or double-count ratings.

### Verification Gate

- [x] Rating a card updates `review_cards` correctly.
- [x] Undo reverts card state and session result correctly, or undo is hidden.
- [ ] Dashboard stats update after a completed review.
- [x] Duplicate sync does not inflate synced counts.
- [x] Typecheck passes.
- [ ] Build passes.
- [x] User-flow/browser verification completed before checkpoint commit.
- [x] UI/UX review completed before checkpoint commit.
- [x] Module checkpoint commit created.

### Module 5 Verification Notes

- Canonical review path for the MVP is `src/lib/active-recall-review-store.ts` plus `src/app/active-recall/review/page.tsx`. The older `active-recall-store` review session methods remain quarantined for compatibility and should not be expanded.
- Undo now sends a full previous card snapshot and `/api/active-recall/review` restores SM-2 fields, review counters, lapse count, average response time, last review timestamp, session results, and session counters.
- Browser-tested `/active-recall/review?plan_id=271fd123-ab16-47dd-956b-7bd7c30da976`: revealed a card, rated `Good`, verified the UI advanced to `1/12`, then clicked `Undo` and verified the UI returned to `0/12` on the same card.
- Database verification for card `979e757f-c146-4d56-b0ca-b7f6d363ba83`: after rating, review counters/session result incremented; after Undo, card fields returned to the captured prior state and session `7cf87b53-93d2-44e2-ae7f-eef0111e7086` returned to `cards_reviewed: 0`, `cards_correct: 0`, `cards_incorrect: 0`, and empty `results`.
- Duplicate sync counting now pre-checks existing cards, inserts only new review cards, and reports existing counts without overwriting SM-2/content state. This was fixed in both `/api/active-recall/sync` and the plan-aware study-tool generation sync helper.
- Content update decision for MVP: preserve existing review card content and SM-2 state on duplicate sync. A later migration can add explicit content refresh if needed.
- Verification commands: `pnpm typecheck` passed; `pnpm lint` passed with pre-existing warnings.
- Remaining Module 5 work before full completion: run a complete session through the summary/dashboard path and verify dashboard stats, streaks, recent sessions, and build.

## Module 6: Performance Memory For Adaptation

Goal: store and expose enough performance context for the agent to adapt future plan days on request.

### Minimum Agent Context

- [ ] weak topics
- [ ] strong topics
- [ ] missed cards/questions
- [ ] slow response topics
- [ ] due load
- [ ] mastery layer distribution
- [ ] recent session accuracy
- [ ] exam/deadline distance

### Tasks

- [ ] Audit stats, predictive analytics, and session analysis routes.
- [ ] Create or stabilize one API endpoint the agent can use as learning context.
- [ ] Keep the output compact and actionable.
- [ ] Avoid building a large analytics dashboard in this module.

### Verification Gate

- [ ] Agent can fetch a concise learning context for a user/document/plan.
- [ ] Context includes weak areas from actual performance.
- [ ] Typecheck passes.
- [ ] User-flow/browser verification completed before checkpoint commit.
- [ ] UI/UX review completed before checkpoint commit.
- [ ] Module checkpoint commit created.

## Module 7: User-Requested Plan Adaptation

Goal: allow the user to ask the agent to adjust future study work based on performance.

### Tasks

- [ ] Audit `agent/adapt-plan`.
- [ ] Use the performance context from Module 6.
- [ ] Only modify future incomplete activities.
- [ ] Keep completed days immutable.
- [ ] Explain changes to the user in plain language.
- [ ] Support requests like:
  - "Make tomorrow easier."
  - "Focus more on my weak topics."
  - "I only have 30 minutes tomorrow."
  - "My exam moved earlier."

### Verification Gate

- [ ] Adaptation changes future plan activities.
- [ ] Completed activities are not rewritten.
- [ ] User sees a clear explanation of what changed.
- [ ] Typecheck passes.
- [ ] User-flow/browser verification completed before checkpoint commit.
- [ ] UI/UX review completed before checkpoint commit.
- [ ] Module checkpoint commit created.

## Module 8: Notifications

Goal: add simple reminders that support the plan without becoming the main project.

### Required Notifications

- [ ] daily study reminder
- [ ] due cards reminder
- [ ] exam countdown reminder if exam date exists

### Tasks

- [ ] Audit notification preference routes and UI.
- [ ] Confirm push subscription flow works.
- [ ] Make reminders plan-aware where possible.
- [ ] Keep quiet hours and timezone behavior correct.
- [ ] Defer weekly reports.
- [ ] Defer Telegram polish unless already stable.

### Verification Gate

- [ ] User can enable/disable reminders.
- [ ] Timezone is respected.
- [ ] Daily reminder can point to today's plan.
- [ ] Typecheck passes.
- [ ] User-flow/browser verification completed before checkpoint commit.
- [ ] UI/UX review completed before checkpoint commit.
- [ ] Module checkpoint commit created.

## Module 9: Predictive Readiness

Goal: provide enough prediction to help the agent and user decide what to study next.

### Tasks

- [ ] Audit predictive analytics implementation.
- [ ] Provide a simple readiness score per plan/document.
- [ ] Provide weak topic list.
- [ ] Provide estimated due load.
- [ ] Provide suggested next focus.
- [ ] Show only lightweight user-facing UI unless the core flow is already complete.

### Verification Gate

- [ ] Agent can use readiness data for plan adaptation.
- [ ] User can see a simple "ready / needs work" signal.
- [ ] No large dashboard work blocks completion.
- [ ] Typecheck passes.
- [ ] User-flow/browser verification completed before checkpoint commit.
- [ ] UI/UX review completed before checkpoint commit.
- [ ] Module checkpoint commit created.

## Module 10: Final Demo Hardening

Goal: make the hero feature demoable without fragile paths.

### Tasks

- [ ] Run through a full document-to-plan-to-generation-to-review demo.
- [ ] Fix visible UI confusion.
- [ ] Hide incomplete tabs or features that distract from the core loop.
- [ ] Ensure empty/loading/error states are clear.
- [ ] Keep copy aligned with the broad Active Recall promise:
  - understand
  - practice
  - remember
- [ ] Avoid introducing new major features.

### Verification Gate

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] Full manual demo passes.
- [ ] This file is updated with final module statuses.
- [ ] User-flow/browser verification completed before checkpoint commit.
- [ ] UI/UX review completed before checkpoint commit.
- [ ] Module checkpoint commit created.

## Deferred Work

These are valuable but not required before the semester deadline:

- [ ] Full autonomous background adaptation.
- [ ] Full weekly reports.
- [ ] Deep predictive analytics dashboard.
- [ ] Multi-channel notification polish.
- [ ] Full mind map group-review experience if it slows the core flow.
- [ ] Advanced plan version history.
- [ ] Collaborative or teacher-facing planning.

## Agent Working Protocol

Every implementation agent must follow this sequence:

1. Pick exactly one module.
2. Mark the module as in progress in this file.
3. Inspect relevant code before editing.
4. Make the smallest coherent set of changes.
5. Run the module verification gate.
6. Run user-based verification with browser tooling where the module has visible user behavior.
7. Run UI/UX review for affected screens and states.
8. Fix any broken, confusing, ugly, inconsistent, or half-baked behavior found during user-flow or UI/UX testing.
9. Re-run the relevant automated checks after fixes.
10. Update the checkboxes and add notes if needed.
11. Commit the verified module as a standalone checkpoint before starting the next module.
12. Do not start the next module until the current one passes verification and has a checkpoint commit.

## User-Based Testing Protocol

For every module that changes user-facing behavior, the agent must test as a real user before calling the module complete.

- Start the app locally with `pnpm dev` or use an already-running local server.
- Use browser tooling to open the affected route and exercise the actual workflow.
- Prefer the in-app browser or Playwright-style browser tools over only reading code.
- Test happy paths, empty states, loading states, and obvious failure states.
- Verify that buttons, forms, navigation, generated state, persistence after reload, and visible copy match the module goal.
- Take screenshots or record concise observations when useful for debugging.
- If browser testing is blocked by auth, missing env vars, missing data, or external service limits, document the blocker and run the closest possible local/API-level verification instead.
- Do not mark user-flow verification complete when only `pnpm typecheck` has run.

## UI/UX Review Protocol

For every module that affects screens, flows, empty states, loading states, errors, or copy, the agent must review visual and interaction quality before completion.

- Match the existing CogniLeapAI visual language: clean, modern, calm, study-focused, and consistent with current Active Recall components.
- Verify the primary task is obvious within a few seconds and does not feel like a backend feature exposed raw to the user.
- Check desktop and mobile/responsive layouts when the affected surface is responsive.
- Confirm spacing, hierarchy, icons, copy, button labels, disabled/loading states, and error states feel intentional.
- Avoid clutter, unrelated analytics, or premature advanced controls when the current module's flow should be simple.
- Do not add UI that looks bolted on, generic, visually noisy, or inconsistent with the surrounding theme.
- Use browser screenshots or direct browser inspection when visual behavior changed.
- Treat confusing, ugly, overlapping, or janky UI as a module blocker, not deferred polish.

## Checkpoint Commit Protocol

Each module should end with a small, reviewable commit after verification.

- Commit only the files intentionally changed for that module.
- Do not include unrelated worktree changes.
- Use a clear message such as `active recall module 2 plan onboarding`.
- If there are pre-existing unrelated changes, leave them unstaged.
- If a module fails later, use the checkpoint to inspect or revert that module without disturbing other work.
- Do not proceed to the next module until the checkpoint commit exists, unless the user explicitly pauses before committing.

## Progress Log

### 2026-06-26

- Created this execution plan.
- Current recommendation: start with Module 1, then Module 2, then Module 3.
- Do not start with notifications or predictive dashboards before the core plan spine is stable.
- Module 0 completed.
  - Read `docs/ACTIVE_RECALL_EXECUTION_PLAN.md` and `AGENTS.md`.
  - Inspected Active Recall pages/components, stores, API routes, sync/review flow, and migrations.
  - Current flow: user selects documents in the Active Recall AI sidebar; the agent can create a plan from selected document ids; create-plan builds a schedule from existing/synced review cards and stores it in `agent_study_plans`; dashboard and plan detail fetch active plans and today's plan; review page fetches due cards by plan/source filters, starts a review session, submits ratings to the SM-2 review API, completes the session, and marks matching plan activities complete.
  - Main Module 1 boundary: `PlanActivity` is currently limited to `flashcard_review`, `quiz_session`, and `mindmap_review`, so it cannot yet represent Learn activities such as study guides, summaries, or smart notes, nor generation status/source ids.
  - Unrelated worktree changes observed and left untouched: `package.json`, `pnpm-lock.yaml`, `src/components/theme-provider.tsx`, `pnpm-workspace.yaml`.
  - Module 0 changed only this file: `docs/ACTIVE_RECALL_EXECUTION_PLAN.md`.
- Module 1 completed.
  - Added canonical plan activity types for Learn, Practice, and Remember: `study_guide`, `summary`, `smart_notes`, `mindmap`, `flashcards`, `quiz`, and `review_due_cards`.
  - Expanded `PlanActivity` so activities can carry `documentId`, `plannedMinutes`, `generationStatus`, `generatedSourceId`, `generatedSourceType`, and `completionStatus`.
  - Kept legacy aliases `flashcard_review`, `quiz_session`, and `mindmap_review` readable for existing saved plans.
  - Updated create-plan and adaptation prompts to schedule material without generating it upfront.
  - Updated dashboard/plan detail rendering and review-session completion mapping for canonical and legacy activity types.
  - Verification: `pnpm typecheck` passed.
  - Files changed for Module 1: `src/types/active-recall.ts`, `src/app/api/active-recall/agent/create-plan/route.ts`, `src/app/api/active-recall/agent/plans/[id]/route.ts`, `src/app/active-recall/plan/[id]/page.tsx`, `src/app/active-recall/review/page.tsx`, `src/components/active-recall/v2/active-plan-card.tsx`, `src/lib/active-recall-prompts.ts`, and `docs/ACTIVE_RECALL_EXECUTION_PLAN.md`.
- Module 2 completed.
  - `create-plan` now accepts and normalizes goal, deadline/exam date, daily available minutes, current understanding, preferred intensity, and prior knowledge.
  - Planning now uses verified selected document ids plus document metadata: page count, bytes, chunk count, actual tokens, processing status, file type, section titles, inferred size, and inferred difficulty.
  - Stored onboarding context now includes user setup details, document context, available material counts, weak topics, and strong topics for later adaptation.
  - Added a post-generation alignment guard so beginner plans start with Learn activities and retention-oriented plans prioritize due review, flashcards, and quizzes.
  - Updated the Study Agent `CREATE_PLAN` action schema and onboarding checklist to collect Module 2 setup fields.
  - Verification: `pnpm typecheck` passed.
  - User-flow verification: authenticated `/active-recall` dashboard loaded real plans, due counts, stats, review actions, and the Study Agent panel without a stuck skeleton.
  - UI/UX verification: Study Agent onboarding surface remained visually consistent on desktop and mobile width; text wrapped cleanly, controls stayed reachable, and the composer enabled correctly after entering plan details.
  - Checkpoint status: Modules 1-2 are captured in the pre-Module 3 checkpoint.
  - Files changed for Module 2: `src/app/api/active-recall/agent/create-plan/route.ts`, `src/lib/active-recall-prompts.ts`, and `docs/ACTIVE_RECALL_EXECUTION_PLAN.md`.
- Plan protocol updated after Module 2 discussion.
  - Added per-module checkpoint commits after thorough verification.
  - Added required user-based/browser testing before module completion for user-facing changes.
  - Added guidance to avoid staging unrelated worktree changes during checkpoint commits.
- UI/UX protocol added.
  - UI/UX quality is now a required module gate for user-facing changes.
  - Visual consistency, smooth workflows, responsive layout, loading/empty/error states, and thematic fit must be verified before checkpoint commits.
- Module 3 completed.
  - Dashboard plan cards now clamp stale current-day display, show ordered today's activities when available, and expose clear next actions for due review or material preparation.
  - Plan detail now has a dedicated Today's Plan section before analytics/progress, with activity state chips for ready, needs material, generating, blocked, and done.
  - Active Recall layout now avoids mobile document overflow by collapsing the app sidebar on narrow viewports and constraining the route header/tab layout.
  - Verification: `pnpm typecheck` passed; `pnpm lint` passed with existing warnings.
  - User-flow/UI verification: authenticated dashboard and plan detail were tested in browser on desktop and 390px mobile viewport; today's plan rendered after reload, stale day overflow was gone, and mobile document scroll width matched viewport width.
