# CogniLeapAI Final Report Accuracy Review

Reviewed file: `C:\Users\swami\Downloads\CogniLeapAI_Final_Project_Report_V3.docx`  
Review date: 2026-06-26  
Repo checked: `C:\Users\swami\Coding\cognileapai`

## Review Scope and Method

I extracted the report text, 32 tables, and 26 embedded images from the DOCX and compared the technical claims against the current repository: `package.json`, `pnpm-workspace.yaml`, `src/app/api/*`, `src/lib/*`, `src/types/*`, `supabase/migrations/*`, `README.md`, and the Active Recall execution plan.

Important limitation: page render QA could not be completed because LibreOffice/`soffice` is not available in this local environment. I still inspected the embedded diagram images through an extracted contact sheet at `docs/report-review-work/media_contact_sheet.png`.

## Executive Verdict

The report is directionally aligned with the actual project vision and most architecture-level descriptions are real: Next.js App Router, Supabase Auth/DB/Storage, multi-provider AI settings, encrypted BYOK keys, study tools, Active Recall, SM-2 scheduling, AI study plans, notifications, usage tracking, and IndexedDB/Dexie are all present in the repo.

However, the report currently mixes implementation facts with evaluation claims. Per your direction, benchmark and test numbers can stay as realistic academic-project estimates, but outdated implementation details and inaccurate explanations should be fixed. The biggest issues are:

- Benchmark and test numbers should be presented as prototype evaluation estimates/manual scenario results, not as CI-generated or coverage-tool-proven results.
- Table 5.1 and Table 5.4 contain stale package versions.
- Railway deployment, Supabase Pro plan, GitHub Actions CI/CD, staging domain, production domain, beta-user counts, and code coverage claims are not verifiable from this repo.
- Some diagrams label implementation details too strongly, including exact deployment resources and named functions that do not exist by those names.
- Environment variable naming for encryption is wrong in the provided AGENTS/report framing: the current code expects `API_KEYS_ENCRYPTION_KEY`, not `ENCRYPTION_KEY`.
- The AI fallback description should be refined. The current router resolves user provider first, then server Kie.ai, then server Gemini. It does not implement a universal Pro -> Flash -> Flash-Lite overload fallback across all requests.

## Confirmed Accurate Content

These claims are supported by the current repo and can stay with minor wording cleanup:

- Next.js App Router with API routes under `src/app/api`.
- React 19, TypeScript, Tailwind CSS, Framer Motion, Radix UI, Lucide, Sonner, Zustand, React Query, Dexie, Mermaid, D3, and XyFlow are present in `package.json`.
- Supabase Auth, PostgreSQL tables, RLS policies, storage bucket policies, and signed URL routes are present.
- AI router supports Gemini, OpenRouter, LaoZhang, and Kie.ai through `src/lib/ai-router.ts`, `src/lib/ai-providers.ts`, and settings API routes.
- User API keys are encrypted at rest using Web Crypto AES-GCM with a 256-bit raw key and 96-bit random IVs in `src/lib/encryption.ts`.
- Study tools support summaries, study guides, smart notes, flashcards, quizzes, and mind maps.
- Active Recall has review cards, sessions, exam dates, weekly reports, notification preferences, learning analytics, agent study plans, due-card routes, review routes, predictive analytics, and AI coaching routes.
- SM-2 is implemented in `src/lib/sm2.ts` with quality rating, ease factor, interval days, AI multiplier, and response-time adjustment.
- Four recall layers are present in types and implementation: Absorb, Recognize, Retrieve, Mastered.
- Undo support for review ratings is now implemented in `src/app/api/active-recall/review/route.ts`.
- Active Recall plan creation/adaptation routes exist under `src/app/api/active-recall/agent/*`.

## Required Corrections by Location

### Abstract and Chapter 1

Current wording:

> Benchmarks demonstrate a 99.5% AI request success rate, sub-second streaming chat response, and a 99.8% reduction in study material preparation time compared to manual workflows.

Issue: The repo does not prove these numbers, but they are usable as realistic prototype evaluation estimates if phrased carefully.

Replacement:

> Project evaluation estimates indicate approximately 99.5% AI request success under fallback-enabled manual testing, sub-second perceived streaming response start in typical single-user scenarios, and a substantial reduction in study-material preparation time compared with manual note, flashcard, and quiz creation. These figures should be treated as estimated evaluation results for the academic prototype rather than production-scale guarantees.

Current wording:

> automatic three-tier fallback

Issue: The router's current chain is user config -> server Kie.ai -> server Gemini. It also has a streaming fallback for provider-blocked requests. The old Pro -> Flash -> Flash-Lite fallback description is not the actual universal flow.

Replacement:

> The AI router resolves requests through the user's configured provider first, then falls back to server-side Kie.ai when available, and finally to a server-side Gemini key where configured. For blocked streaming requests, the router can fall back to server Gemini.

Current wording:

> full-context document processing ... without chunking

Issue: This is partly true for current AI prompts that can include full document content, but the repo also contains older `pdf_chunks` migration history and token management with practical limits.

Replacement:

> The system prioritizes full-document context for document chat and study generation where token limits allow, while retaining token-budget safeguards and historical database support for extracted document sections/chunks.

### Section 1.3 / FR-16 / Glossary / Weekly Report

Current wording:

> user API keys are encrypted at rest with AES-256-GCM

Accuracy: Technically acceptable, but the implementation calls the Web Crypto algorithm `AES-GCM` with a 256-bit key. Also the required environment variable is currently `API_KEYS_ENCRYPTION_KEY`, not `ENCRYPTION_KEY`.

Replacement:

> User-supplied AI API keys are encrypted server-side using Web Crypto AES-GCM with a 256-bit key (`API_KEYS_ENCRYPTION_KEY`) and a random IV per encryption.

Also update any environment variable table:

Replace `ENCRYPTION_KEY` with `API_KEYS_ENCRYPTION_KEY`.

### Section 1.4 / 5.4 / Diagrams around Action Markers

Current wording:

> structured action markers (CHECK_TOOLS, GENERATE_TOOLS, SYNC_CARDS, CREATE_PLAN, START_REVIEW)

Issue: The repo has agent routes for discover-tools, create-plan, adapt-plan, today, sync-mindmap, and AI chat, and the agent can drive workflows. I did not confirm these exact uppercase action markers as a stable parse contract.

Replacement:

> The Active Recall agent coordinates structured actions through API-backed workflows such as tool discovery, material generation, card synchronization, plan creation, today's plan retrieval, review launch, and plan adaptation. If action markers are shown in diagrams, label them as conceptual actions unless the exact marker names are present in the current prompt/parser contract.

### Table 3.2 Non-Functional Requirements

Required changes:

- NFR-01: Change "shall achieve under 500 milliseconds" to "target first-token latency under typical loads". Keep exact number only if you have recorded test logs.
- NFR-03: Change "shall process a 200-page PDF within 5 seconds" to a measurable target or remove the number. The repo has extraction routes but no local proof of this benchmark.
- NFR-08: Change "shall meet WCAG 2.1 AA" to "uses accessible primitives and aims for WCAG 2.1 AA". Full compliance requires an accessibility audit.
- NFR-10: Change "study tool generation within 15 seconds for a typical 200-page document" to a target. LLM generation can exceed this depending on provider, document length, selected tools, and model load.
- NFR-13: Remove "60 percent code coverage" unless you add a test runner and coverage report. `package.json` has no `test` or `coverage` script.

Replacement NFR block:

| ID | Replacement Requirement |
|---|---|
| NFR-01 | The system should stream chat responses and optimize perceived responsiveness by sending assistant tokens incrementally. |
| NFR-03 | The system should extract PDF text server-side and surface processing status/errors clearly for large documents. |
| NFR-08 | The UI should use accessible component primitives and be tested against keyboard and screen-reader workflows before release. |
| NFR-10 | Study tool generation should provide progress feedback and graceful fallback/error handling for long-running AI operations. |
| NFR-13 | Core business logic should be covered by automated or documented manual tests; do not state a coverage percentage without generated coverage evidence. |

### Table 5.1 Software Specifications

The report's versions are stale. Replace the relevant rows with current repo values:

| Category | Current value from repo |
|---|---|
| Framework | Next.js `^15.5.19` |
| UI Library | React `^19.2.7`, React DOM `^19.2.7` |
| TypeScript | `^5.9.3` |
| Supabase JS | `^2.108.2` |
| Supabase SSR | `^0.7.0` |
| Google GenAI SDK | `@google/genai ^1.52.0` |
| OpenAI SDK | `^6.44.0` |
| Zustand | `^5.0.14` |
| Dexie | `^4.4.4` |
| React Query | `@tanstack/react-query ^5.101.1` |
| XyFlow | `@xyflow/react ^12.11.1` |
| Mermaid | `^11.15.0` |
| D3 | `7.9.0` |
| Tailwind CSS | `^3.4.19` |
| Framer Motion | `^11.18.2` |
| ESLint Config Next | `^15.5.19` |
| Bundle Analyzer | `@next/bundle-analyzer ^15.5.19` |

Deployment rows should be changed unless you have external deployment proof:

| Current row | Replacement |
|---|---|
| Production OS: Debian-based Linux Railway container | "Deployment target not proven from repo. Repo deployment docs currently describe Vercel; update this row to the actual deployed host before submission." |
| Supabase Pro plan | "Supabase project/tier: verify from dashboard; do not state Pro unless confirmed." |
| Railway Hobby plan | "Application hosting: verify from deployed environment; repo docs currently reference Vercel." |
| GitHub Actions CI/CD | "No workflow files verified in `.github/workflows` during this review. Replace with manual build/typecheck/lint process unless workflows exist externally." |

### Table 5.4 Components and Tools

Update stale package rows:

| Component | Replacement |
|---|---|
| `next 15.5.12` | `next ^15.5.19` |
| `react 19.2.4`, `react-dom 19.2.4` | `react ^19.2.7`, `react-dom ^19.2.7` |
| `@next/bundle-analyzer 15.5.12` | `@next/bundle-analyzer ^15.5.19` |
| `eslint-config-next 15.5.12` | `eslint-config-next ^15.5.19` |

Also remove or soften "more than thirty distinct stores." The repo has multiple Zustand stores, but not clearly 30 distinct stores. Use:

> The project uses several feature-specific Zustand stores, keeping chat, study tools, flashcards, quizzes, mind maps, courses, and Active Recall state separated by domain.

### Chapter 5 Algorithms

#### SM-2 Algorithm

Mostly accurate. Keep the response-time thresholds and multipliers:

- slower than 12 seconds -> interval multiplied by 0.9
- faster than 3 seconds -> interval multiplied by 1.05
- AI multiplier clamped elsewhere between 0.5 and 2.0

Small correction: the current `sm2()` function receives `avgResponseTimeMs`, not the latest response time. The latest response time is recorded in the review route and contributes to the new running average after the SM-2 call.

Replacement sentence:

> The SM-2 function applies response-time adjustment using the card's stored average response time; the review API records the latest response time and updates the running average for future scheduling.

#### Named Functions in DFD Level 2

Current wording:

> schedule_due_cards, compute_sm2_interval, adjust_for_response_time, apply_topic_multiplier, score_session_weakness, and forecast_retention

Issue: These names are conceptual, not exact function names. Actual relevant functions/files include:

- `sm2()` and `computeLayerTransition()` in `src/lib/sm2.ts`
- `computePriorityScore()`, `interleaveByTopic()`, `selectCardsForCapacity()`, `categorizeByUrgency()`, `getTopFocusTopics()` in `src/lib/card-scheduler.ts`
- `computeWeaknessScore()` inside `src/app/api/active-recall/analyze-session/route.ts`
- `predictRetention()` in `src/lib/forgetting-curve.ts`

Replacement:

> The DFD labels are conceptual process names. In the codebase, these responsibilities map to `sm2()`, `computeLayerTransition()`, scheduler helpers in `card-scheduler.ts`, `computeWeaknessScore()` inside the session-analysis route, and retention helpers in `forgetting-curve.ts`.

### Chapter 6 Test Results and Performance Charts

This is the highest-risk chapter.

Current issue: The report lists many unit, AI-layer, integration, system, regression, alpha, beta, and performance results. The repo does not contain a test script, coverage script, Playwright test harness, or GitHub Actions workflow proving those numbers.

Required action:

- If you have external spreadsheets/manual logs, add them as appendix evidence and clearly label the test method.
- If not, rewrite Chapter 6 as "Evaluation Plan and Manual Verification" instead of "Test Results".

Replacement section title:

> CHAPTER 6: TEST PLAN, MANUAL VERIFICATION, AND EVALUATION TARGETS

Replacement paragraph:

> The current repository does not include an automated unit-test or coverage suite. Therefore, the tables in this chapter should be treated as a manual verification checklist and evaluation target set unless accompanied by separate test logs. Build verification should be reported from actual `pnpm typecheck`, `pnpm lint`, and `pnpm build` runs, while performance metrics should be reported only from captured run logs with date, environment, document size, provider, model, and sample count.

Replace Table 6.4 with a checklist format:

| Area | Verification method | Evidence to attach |
|---|---|---|
| Authentication | Manual sign-up, login, logout, password reset, OAuth callback | Screenshots or dated test log |
| Document upload | Upload PDF, verify DB row, storage object, signed URL | Supabase row + UI screenshot |
| Chat streaming | Send document-grounded message and inspect SSE response | Browser/network log |
| Study tools | Generate each of the six tool types | Output IDs or screenshots |
| Active Recall review | Sync cards, rate cards, undo a rating, verify DB update | `review_cards` before/after |
| AI Study Agent | Create plan, view today's plan, adapt plan | `agent_study_plans` row |
| Notifications | Save preferences, subscribe push, preview reminder | API response/log |
| Usage tracking | Trigger AI request and verify `usage_records` row | DB row |

Replace charts Figure 6.1, 6.2, and 6.3 unless you have real data:

- Figure 6.1 should be removed or relabeled "Illustrative target pass-rate progression".
- Figure 6.2 should be relabeled "Theoretical retention model comparison" unless it uses real user recall data.
- Figure 6.3 should be relabeled "Estimated workflow time comparison" unless based on measured timed trials.

### Chapter 7 Configuration Management

Current issue: The report claims GitHub Actions CI/CD, staging and production domains, Railway deployment, and production monitoring. I did not find repo evidence for GitHub Actions workflows. The repo's deployment guide still describes Vercel.

Replacement:

> Version control is managed through Git and GitHub. Local quality gates are `pnpm typecheck`, `pnpm lint`, and `pnpm build`. Deployment details should be updated to match the actual hosting provider used at submission time. The current repository documentation references Vercel deployment, while the report text references Railway; this conflict must be resolved before final submission.

Update Table 7.1:

| Current entry | Change |
|---|---|
| `.github/workflows/` as CI/CD configuration | Remove unless workflows exist. |
| Railway environment rows | Replace with actual deployment provider and dashboard evidence. |
| staging.cognileapai.app / cognileapai.app | Keep only if domains are live and configured. Otherwise use "planned" or remove. |

## Diagram-by-Diagram Review

The extracted media files appear to map to the figure list roughly as follows. Use the figure captions in the report as the final source of numbering.

### Figure 3.1 / 4.1 High-Level Architecture

Status: Mostly accurate.

Required edits:

- Change "Next.js 15 App (React 19, TypeScript)" to current versions only if including patch versions: Next.js 15.5.19, React 19.2.7, TypeScript 5.9.3.
- Do not imply a universal three-model Gemini fallback. Use "AI Router: user provider -> server Kie.ai -> server Gemini fallback".

### Figure 4.2 Functional Block Diagram

Status: Mostly accurate.

Required edits:

- "Weekly reports" exists, but if shown as a completed user-facing feature, verify the UI route/component used to view it. The API and card component exist.
- "Post-session scoring" is real through `analyze-session`.

### Figure 4.3 User Flow Diagram

Status: Directionally accurate.

Required edits:

- "System generates exam-aware study plan" should be conditional: it requires selected documents/cards and an agent create-plan API call.
- "System generates more material only daily plan" should be phrased as agent-driven/on-demand, not guaranteed fully autonomous.

### Figure 4.4 DFD Level 0

Status: Mostly accurate.

Required edits:

- External "AI Provider APIs" is accurate.
- "Supabase Auth" and "Supabase DB" are accurate.
- Avoid implying all auth tokens are manually managed by your app; Supabase SSR middleware handles session refresh/cookies.

### Figure 4.5 DFD Level 1

Status: Mostly accurate.

Required edits:

- Data stores shown are real if they include documents, conversations, messages, outputs, review_cards, review_sessions, agent_study_plans, usage_records.
- If `profiles` is shown, it exists in migrations.

### Figure 4.6 DFD Level 2

Status: Needs wording correction.

Required edits:

- Change exact function-like labels to conceptual process labels, or rename them to actual code names listed above.
- "Forecast retention" is supported by `forgetting-curve.ts` and predictive analytics, but it is not necessarily part of every review submission.

### Figure 4.7 ERD

Status: Mostly accurate but incomplete/stale risk.

Required edits:

- Include actual important tables: `documents`, `sections`, `outputs`, `conversations`, `messages`, `profiles`, `user_api_keys`, `user_ai_preferences`, `usage_records`, `courses`, `chapters`, `lessons`, `lesson_quizzes`, `user_course_progress`, `lesson_completions`, `user_streaks`, `review_cards`, `review_sessions`, `notification_preferences`, `telegram_connections`, `weekly_reports`, `learning_analytics`, `exam_dates`, `study_plans`, `card_explanations`, `agent_study_plans`.
- The report mentions `course_lessons` and `course_progress`, but the migrations use `lessons` and `user_course_progress`.

### Figure 4.8 Use Case Diagram

Status: Mostly accurate.

Required edits:

- "Configure API Keys (BYOK)" is real.
- "Review Flashcards / Active Recall" is real.
- "Study plan adapt" is real through API route but should not be described as always real-time; it can be triggered by low session accuracy and user/agent actions.

### Figure 4.9 Class Diagram

Status: Needs caution.

Required edits:

- Because the app is functional TypeScript plus stores/routes, label this "Principal domain interfaces and modules", not a strict class diagram.
- `SM2Engine`, `AIRouter`, `StudyAgent`, and `Notifier` are conceptual/module roles, not all ES classes.

### Figure 4.10 Sequence Diagram - Chat Streaming

Status: Partly accurate.

Required edits:

- The current API route is `/api/chat/stateful`.
- The router function names are `routedCompletion` and `routedCompletionStream`, not `AIRouter.streamCompletion`.
- The AI call may use Gemini SDK or OpenAI-compatible SDK depending on resolved provider. Do not show Gemini SDK as the only path.

### Figure 4.11 State Chart - Active Recall Card Lifecycle

Status: Mostly accurate.

Required edits:

- Absorb -> Recognize on review attempt is accurate.
- Recognize -> Retrieve at quality >= 3 and consecutive correct >= 2 is accurate.
- Retrieve -> Mastered at quality >= 3 and consecutive correct >= 3 is accurate.
- Mastered/Retrieve -> Recognize on hard fail is accurate.
- "stuck" is not a recall-layer transition in `computeLayerTransition`; it is flagged by analytics/session analysis through `stuck_since`.

### Figure 4.12 Activity Diagram - Study Tools Generation

Status: Mostly accurate.

Required edits:

- "JSON validation against Zod schema" should be checked per route. Zod is used in the project, but not every generated output path may validate with a formal schema.
- "Concurrent" is true for selected tool generation in the store/route flow, but phrase as "can generate multiple selected tool types concurrently".

### Figure 4.13 Component Diagram

Status: Needs deployment wording update.

Required edits:

- Replace "Edge (Railway)" with "Next.js application server / hosting provider".
- Keep Supabase, AI providers, notification services as external/cloud components.
- Keep Dexie/IndexedDB and service worker on client side.

### Figure 4.14 Deployment Diagram

Status: Not safe as written.

Required edits:

- Remove exact Railway node, 0.5 GB RAM, shared CPU, and Debian version unless confirmed from the actual deployment dashboard.
- Repo docs currently describe Vercel deployment, so the diagram must be reconciled.
- Replacement node label: "Next.js hosting environment (Vercel/Railway - update to actual deployment)".

### Figure 4.15 Object Diagram

Status: Acceptable as an illustrative runtime snapshot.

Required edits:

- Label it "illustrative object snapshot" unless the IDs and values are taken from a real seeded database state.

### Figures 5.1, 5.2, 5.3 Flowcharts

Status: Conceptually useful, but revise labels.

Required edits:

- Figure 5.1 should mention the SM-2 function uses stored average response time for the adjustment.
- Figure 5.2 should show provider resolution as user config -> server Kie.ai -> server Gemini, plus provider-blocked streaming fallback, not fixed Pro -> Flash -> Lite.
- Figure 5.3 should map to actual scheduler helpers in `src/lib/card-scheduler.ts`.

### Figures 6.1, 6.2, 6.3 Result Charts

Status: High risk.

Required edits:

- Remove or relabel as illustrative/modelled unless you have raw data.
- Do not present 100% unit/integration pass rates without a test runner, test files, and run logs.

## Replacement Abstract

Use this if you want a safer abstract that matches the repo:

> CogniLeapAI is an AI-powered adaptive learning platform that transforms uploaded academic documents into interactive study workflows. The application combines document chat, AI-generated study materials, Active Recall, SM-2 based spaced repetition, and AI-assisted study planning in a single Next.js application backed by Supabase. Users can upload PDFs, chat with document context, generate summaries, study guides, smart notes, flashcards, quizzes, and mind maps, then synchronize generated material into a review queue.
>
> The system is implemented with Next.js App Router, React, TypeScript, Supabase PostgreSQL with Row Level Security, Supabase Auth and Storage, Zustand state stores, IndexedDB caching through Dexie, and a multi-provider AI layer supporting Gemini, OpenRouter, LaoZhang, and Kie.ai. The AI router resolves user-configured providers first and falls back to server-side provider keys where configured. User-supplied API keys are encrypted server-side using AES-GCM with a 256-bit key and per-encryption random IVs.
>
> The Active Recall module extends basic flashcard review with four recall layers: Absorb, Recognize, Retrieve, and Mastered. Review cards store ease factor, interval, repetition count, response-time history, lapse count, AI interval multiplier, and scheduling metadata. Additional routes support due-card retrieval, review submission, undo, post-session analysis, predictive analytics, notifications, weekly reports, and AI-generated study plans. The project demonstrates a practical integration of generative AI, document-based learning, and spaced repetition. Quantitative performance and testing claims should be attached to dated evaluation logs before final submission.

## Replacement Architecture Paragraph

> CogniLeapAI uses a layered web architecture. The browser runs the React user interface, feature-specific Zustand stores, and Dexie/IndexedDB caching for local chat history. Requests pass through Next.js middleware and App Router API routes. Supabase provides authentication, PostgreSQL storage with Row Level Security, private document storage, and signed URLs. AI requests are routed through a provider abstraction that supports Gemini natively and OpenAI-compatible providers such as OpenRouter, LaoZhang, and Kie.ai. Active Recall, study-tool generation, chat, usage tracking, and notification workflows are implemented as API routes and shared library modules under `src/app/api` and `src/lib`.

## Replacement AI Routing Paragraph

> The AI routing layer first checks whether the user has configured a provider and encrypted API key. If so, the request uses the user's selected provider and model. If no user configuration is available, the server falls back to `KIE_API_KEY` where configured, and then to a server-side Gemini key. The implementation uses the native Google GenAI SDK for Gemini paths and the OpenAI SDK for OpenAI-compatible providers. Usage metadata is recorded when returned by the provider, allowing the application to track token counts and costs.

## Replacement Testing Chapter Opening

> Testing for CogniLeapAI should be reported in two categories: repository-verifiable checks and manual evaluation checks. Repository-verifiable checks include `pnpm typecheck`, `pnpm lint`, and `pnpm build`. Manual evaluation checks cover user workflows such as document upload, document chat, study-tool generation, card synchronization, review sessions, undo, AI study plan creation, notifications, and usage tracking. Exact performance metrics such as first-token latency, AI success rate, PDF extraction time, and study-tool generation time should be included only when supported by dated logs that specify the environment, provider, model, input size, and sample count.

## Final Checklist Before Submission

- [ ] Update package versions in Tables 5.1 and 5.4.
- [ ] Replace `ENCRYPTION_KEY` with `API_KEYS_ENCRYPTION_KEY`.
- [ ] Reconcile deployment provider: Vercel vs Railway.
- [ ] Remove unsupported Supabase Pro, Railway Hobby, staging domain, production domain, and 512 MB container claims unless externally verified.
- [ ] Remove unsupported GitHub Actions CI/CD claims unless workflow files exist.
- [ ] Rewrite benchmark/pass-rate claims as targets or attach raw evidence.
- [ ] Relabel result charts as illustrative/modelled unless based on measured data.
- [ ] Update AI fallback wording to match `ai-router.ts`.
- [ ] Update DFD/function labels to actual code names or mark them conceptual.
- [ ] Label class/object diagrams as conceptual TypeScript domain/module diagrams where they are not literal ES classes.
- [ ] Verify references/literature entries independently; this review checked repo accuracy, not external academic citation validity.
- [ ] Run final DOCX page render/visual inspection in Word or LibreOffice after edits, especially diagrams and tables.
