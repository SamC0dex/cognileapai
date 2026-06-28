# CogniLeapAI

CogniLeapAI is an AI-powered learning platform for turning study documents into chat, study tools, courses, and Active Recall review plans. It is built with Next.js App Router, TypeScript, Supabase, and a multi-provider AI layer centered on Kie.ai/Gemini-compatible models.

The app is designed for students who want to upload material once, ask questions from it, generate revision resources, and keep reviewing with spaced repetition.

## Core Features

### Document Learning

- Upload and manage PDF study material.
- Extract and store document text for AI workflows.
- Chat with one or more documents using document context.
- Persist chat state with Supabase and local IndexedDB support.
- Track document processing status and signed storage access.

### AI Study Tools

CogniLeapAI can generate multiple study formats from documents or conversations:

- Study guides
- Smart summaries
- Smart notes
- Flashcards
- Quizzes
- Mind maps

Study tools can be fetched, updated, deleted, copied, exported, and used as inputs for Active Recall.

### Active Recall

Active Recall is the main learning engine. It combines AI-generated study planning with SM-2 spaced repetition.

- Four learning layers: Absorb, Recognize, Retrieve, and Mastered.
- SM-2 scheduling with ease factor, intervals, repetitions, and due dates.
- Review sessions with tracked answers, progress, and undo support.
- Sync from flashcards, quizzes, and mind maps into review cards.
- Mind map recall generation for branch, node, and detail review.
- Daily goals, due cards, stats, performance analysis, and readiness checks.
- Exam dates and adaptive plan support.
- AI nudge, card explanation, session feedback, weekly report, and interval adjustment routes.
- Agent-based plans with create, adapt, today, tool discovery, learning context, and plan-detail APIs.
- Persisted plan activity sessions for tracked study work.

### Study Agent

The Study Agent supports guided study workflows around the user's material.

- Uses document and learning context to help the student decide what to study.
- Creates and adapts study plans.
- Connects Active Recall explain and follow-up actions back into the agent experience.
- Supports plan pages and today's activity flow.

### Courses

- Generate structured courses from study documents.
- Manage courses, lessons, progress, and lesson quizzes.
- Detect existing courses before generating duplicates.
- Support both standard and fast course generation paths.

### Account, Settings, and Usage

- Supabase email/password auth and Google OAuth support.
- Protected app routes with Supabase session handling.
- User preferences, model settings, and encrypted API-key storage.
- Provider key validation and reveal support.
- Token and cost usage recording.
- Optional web push and Telegram reminder integrations.

## Tech Stack

### Application

- Next.js 15.5 App Router
- React 19
- TypeScript 5.9
- Tailwind CSS 3.4
- Framer Motion
- Radix UI primitives
- Lucide icons

### Data and Auth

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security migrations
- Dexie for IndexedDB-backed local persistence
- Zustand for client stores
- TanStack Query for server state

### AI

- Kie.ai through an OpenAI-compatible client
- Google Gemini via `@google/genai`
- OpenRouter and LaoZhang provider support
- Central AI router in `src/lib/ai-router.ts`
- Model registry and usage tracking
- Zod schemas for structured generation

### Study and Visualization

- SM-2 scheduler in `src/lib/sm2.ts`
- Active Recall stores in `src/lib/active-recall-store.ts` and `src/lib/active-recall-review-store.ts`
- XyFlow, D3, and Mermaid for visual learning tools
- Markdown, PDF, DOCX, and image export utilities

## Project Structure

```text
src/
  app/
    api/                         Next.js route handlers
      active-recall/             Due cards, review, AI coaching, plans, reminders
      chat/                      Document chat APIs
      courses/                   Course generation and progress APIs
      documents/                 Document CRUD and signed URLs
      settings/                  API keys, profile, preferences, models
      study-tools/               Generate, fetch, update, delete study tools
    active-recall/               Active Recall dashboard, review, settings, insights
    auth/                        Login, sign-up, reset, callback routes
    chat/                        Chat pages
    courses/                     Course and lesson pages
    dashboard/                   Main app dashboard
    settings/                    User settings
  components/                    Feature and UI components
  lib/                           Stores, AI routing, Supabase, study logic, utilities
  types/                         Shared TypeScript types
supabase/
  migrations/                    Database schema and RLS migrations
docs/                            Project notes, deployment, security, explanations
```

## Important Files

- `src/lib/ai-router.ts` - central AI request routing and fallback behavior.
- `src/lib/ai-providers.ts` - provider adapters for Gemini/OpenAI-compatible APIs.
- `src/lib/model-registry.ts` - model metadata and pricing.
- `src/lib/usage-tracker.ts` - token and cost usage recording.
- `src/lib/study-tools-store.ts` - study tool generation and persistence flow.
- `src/lib/active-recall-store.ts` - Active Recall data store.
- `src/lib/active-recall-review-store.ts` - review session state and undo stack.
- `src/lib/active-recall-sync.ts` - flashcard/quiz sync into review cards.
- `src/lib/active-recall-mindmap-sync.ts` - mind map to review-card conversion.
- `src/types/active-recall.ts` - shared Active Recall type spine.
- `supabase/migrations/` - database migrations that must be applied in order.

## Getting Started

### Prerequisites

- Node.js 18 or newer
- pnpm 9.10.0
- Supabase project
- At least one AI provider key, preferably `KIE_API_KEY` or a Gemini API key

This repo pins the package manager in `package.json`:

```bash
corepack enable
corepack prepare pnpm@9.10.0 --activate
```

### Install

```bash
pnpm install
```

### Environment

Copy `.env.example` to `.env.local` and fill in the required values.

Required for normal app usage:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

KIE_API_KEY=your_kie_api_key
# or
GOOGLE_GENERATIVE_AI_API_KEY=your_google_gemini_key

API_KEYS_ENCRYPTION_KEY=your_64_char_hex_key
SUPABASE_BUCKET_DOCUMENTS=documents
```

Optional:

```env
KIE_DEFAULT_MODEL=gemini-3-flash
GOOGLE_AI_API_KEY=your_google_key_alias
GOOGLE_CLOUD_VISION_API_KEY=your_vision_key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
NEXT_PUBLIC_FEATURE_FLAG_LIVE_CHAT=false
```

### Supabase Setup

1. Create a Supabase project.
2. Run all SQL migrations in `supabase/migrations/` in order.
3. Create a private storage bucket named `documents` or set `SUPABASE_BUCKET_DOCUMENTS` to your bucket name.
4. Enable email auth.
5. Optionally configure Google OAuth.
6. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.

## Development

```bash
pnpm dev              # Start development server on localhost:3000
pnpm dev:turbo        # Start development server with Turbopack
pnpm build            # Production build
pnpm build:analyze    # Production build with bundle analyzer
pnpm start            # Start production server
pnpm lint             # ESLint
pnpm typecheck        # TypeScript type checking
```

## AI Routing

All AI calls should go through the shared AI layer instead of directly calling provider SDKs from features.

The expected flow is:

1. Use the user's configured provider and model when available.
2. Fall back to server-side Kie/Gemini configuration where appropriate.
3. Record usage after AI calls.
4. Keep user API keys encrypted at rest.

Relevant files:

- `src/lib/ai-router.ts`
- `src/lib/ai-providers.ts`
- `src/lib/ai-config.ts`
- `src/lib/model-registry.ts`
- `src/lib/usage-tracker.ts`
- `src/lib/encryption.ts`

## Active Recall Flow

The current Active Recall path is:

1. User selects study material.
2. Study Agent creates or adapts a plan.
3. Today's plan recommends activities and tools.
4. Generated flashcards, quizzes, and mind maps sync into review cards.
5. Review sessions apply SM-2 scheduling.
6. Performance, readiness, insights, and plan activity data guide future study.

Main routes:

- `/active-recall`
- `/active-recall/review`
- `/active-recall/plan/[id]`
- `/active-recall/insights`
- `/active-recall/exams`
- `/active-recall/settings`

## Database Notes

The Supabase migrations include:

- User auth and document tables
- Conversation metadata
- Study tool and course support
- API keys and preferences
- Active Recall V1/V2/V3 tables
- Adaptive learning tables
- Plan activity sessions
- Storage cleanup and RLS policies

Always use authenticated Supabase clients for user-owned data and preserve RLS boundaries.

## Deployment Notes

See `docs/DEPLOYMENT.md` for deployment guidance.

For Railway or other frozen-install environments, use the pinned pnpm version:

```bash
corepack pnpm@9.10.0 install --frozen-lockfile
pnpm build
```

## Presentation Summary

CogniLeapAI can be explained as four connected systems:

1. Document upload and AI chat.
2. Study tool generation.
3. Active Recall and Study Agent planning.
4. Auth, dashboard, settings, usage, and notifications.

The main technical contribution is the connection between document understanding, AI-generated study resources, and spaced repetition review.

## License

Private project.
