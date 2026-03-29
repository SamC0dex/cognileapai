# CLAUDE.md - CogniLeapAI

## Project Overview

CogniLeapAI is an AI-powered learning platform built with Next.js 15.5 (App Router), TypeScript, Supabase, and multi-provider AI (Gemini, OpenRouter, LaoZhang, Kie.ai). Users upload PDFs, chat with documents, generate study tools (flashcards, quizzes, mind maps, guides, notes, summaries), and review with an SM-2 spaced repetition system.

## Commands

```bash
pnpm dev              # Start dev server on localhost:3000
pnpm dev:turbo        # Start with Turbopack (faster HMR)
pnpm build            # Production build
pnpm build:analyze    # Build with bundle analyzer
pnpm lint             # ESLint
pnpm typecheck        # TypeScript type checking (no emit)
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15.5 with App Router, React 19, TypeScript 5.6
- **Styling**: Tailwind CSS 3.4, Framer Motion 11
- **Database**: Supabase PostgreSQL with Row Level Security
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **AI**: Google Gemini (@google/genai), OpenAI SDK for compatible providers
- **State**: Zustand 5 (client), React Query 5 (server), Dexie 4 (IndexedDB)
- **UI**: Radix UI primitives, Lucide icons, Sonner toasts
- **Visualization**: @xyflow/react (mind maps), D3, Mermaid
- **Validation**: Zod

### Key Directories
- `src/app/` - Pages and API routes (Next.js App Router)
- `src/components/` - React components organized by feature
- `src/lib/` - Business logic, stores, AI integration, utilities
- `src/types/` - TypeScript type definitions
- `supabase/migrations/` - Database migrations (run in order)

### AI System
- **Router** (`src/lib/ai-router.ts`): Routes requests through user's configured provider, falls back to server KIE_API_KEY, then GOOGLE_API_KEY
- **Providers** (`src/lib/ai-providers.ts`): Gemini (native), OpenRouter, LaoZhang, Kie.ai (OpenAI-compatible)
- **Models** (`src/lib/ai-config.ts`): Gemini 2.5 Flash (fast), Gemini 3 Flash (default), Gemini 3 Pro (complex)
- **Usage** (`src/lib/usage-tracker.ts`): Records token counts and costs per request to `usage_records` table
- **Model Registry** (`src/lib/model-registry.ts`): Full model catalog with pricing data

### Active Recall System
- **Store** (`src/lib/active-recall-store.ts`): Zustand store for due cards, sessions, stats
- **Review Store** (`src/lib/active-recall-review-store.ts`): Session management with undo stack
- **SM-2** (`src/lib/sm2.ts`): Spaced repetition algorithm implementation
- **Sync** (`src/lib/active-recall-sync.ts`): Converts flashcards/quizzes to review cards
- **Mindmap Sync** (`src/lib/active-recall-mindmap-sync.ts`): Generates cards from mind map nodes
- **4 Recall Layers**: Absorb (1) -> Recognize (2) -> Retrieve (3) -> Mastered (4)
- **API routes** under `src/app/api/active-recall/` (due-cards, review, sync, AI coaching, agent plans)

### Study Tools
6 types: study-guide, flashcards, smart-notes, smart-summary, quiz, mind-map
- Generation via `src/lib/study-tools-store.ts`
- Each tool type has its own Zustand store (flashcard-store, quiz-store, mindmap-store)
- Prompts in `src/lib/study-tools-prompts.ts`

### Chat System
- `src/lib/chat-store.ts` - Zustand state management
- `src/lib/use-chat.ts` - Custom hook for chat operations
- `src/lib/genai-client.ts` - Google GenAI SDK with stateful sessions
- `src/lib/token-manager.ts` - Progressive token warnings and optimization
- Dual persistence: Supabase DB + IndexedDB (Dexie)

## Coding Conventions

- State management: Zustand stores with persist middleware in `src/lib/`
- API routes: Next.js Route Handlers in `src/app/api/`
- Components: Feature-organized under `src/components/`
- All database tables use Row Level Security - always use authenticated Supabase clients
- AI requests go through the AI router (`ai-router.ts`), not directly to provider SDKs
- Usage tracking: Call `recordUsage()` after AI API calls
- User API keys are encrypted at rest (`src/lib/encryption.ts`)

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `GOOGLE_GENERATIVE_AI_API_KEY` or `KIE_API_KEY` - At least one AI provider key
- `ENCRYPTION_KEY` - For encrypting user API keys

Optional:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` - Web push notifications
- `TELEGRAM_BOT_TOKEN` - Telegram notification bot
