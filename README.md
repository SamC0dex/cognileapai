# CogniLeapAI

**AI-powered learning platform that transforms documents into interactive study materials with spaced repetition**

CogniLeapAI is a web application built for students, researchers, and professionals. Upload PDFs and generate comprehensive study materials including summaries, notes, study guides, flashcards, quizzes, and mind maps. Features an intelligent chat system for document Q&A, an Active Recall system with SM-2 spaced repetition, AI study coaching, multi-provider AI support, and a professional interface designed for focused learning.

## Features

### Authentication & Security
- **Email/Password Authentication** - Secure user registration and login
- **Google OAuth Integration** - Quick sign-in with Google accounts
- **Password Recovery** - Self-service password reset flow
- **Row Level Security** - Database-level user data isolation
- **Protected Routes** - Middleware-based access control for authenticated pages
- **Session Persistence** - Automatic session refresh and state management

### Document Processing
- **PDF Upload & Parsing** - Extract complete text content from PDF documents
- **Full Text Extraction** - Stores entire document content for comprehensive AI analysis
- **Document Management** - Upload, organize, and delete documents with isolated user storage
- **Mass Deletion** - Bulk document deletion with automatic storage cleanup
- **Content Extraction Pipeline** - Asynchronous processing with status tracking
- **Secure File Storage** - Private Supabase storage with time-limited signed URLs

### Intelligent Chat System
- **Contextual Conversations** - Chat with documents using full document content as context
- **Streaming Responses** - Real-time AI responses with smooth character-by-character display via Server-Sent Events
- **Stateful Sessions** - Persistent chat sessions with database storage that survive server restarts
- **Conversation History** - Dual persistence (Supabase database + IndexedDB) with automatic sync
- **Token Management** - Real-time tracking with progressive warnings (150K caution, 180K warning, 200K critical)
- **Context Optimization** - Automatic conversation summarization to maintain quality in long chats
- **Multi-Document Support** - Select and chat with multiple documents simultaneously
- **Model Selection** - Choose between Gemini Flash, Flash Lite, or Pro based on speed vs quality needs
- **Keyboard Shortcuts** - Efficient navigation (Enter to send, Shift+Enter for newline, Cmd/Ctrl+K to focus)

### Study Tools Generation
- **Study Guides** - Structured learning paths with foundation, connections, applications, and mastery sections
- **Smart Summaries** - Hierarchical overviews with key insights and strategic implications
- **Smart Notes** - Active learning notes with interconnected concepts and knowledge networks
- **Interactive Flashcards** - Q&A cards with swipe animations, study sessions, and progress tracking
- **Quizzes** - Multiple choice questions with explanations and scoring
- **Mind Maps** - Visual knowledge organization with interactive node-based visualization (XyFlow)
- **Conversation-Based Generation** - Create study materials from chat conversations, not just documents
- **Concurrent Generation** - Generate multiple study tools simultaneously without blocking
- **Export Options** - Download as PDF, DOCX, or copy to clipboard
- **Canvas Mode** - Full-screen viewing for study tools

### Active Recall System (SM-2 Spaced Repetition)
- **Multi-Layer Learning Model** - Cards progress through 4 recall layers:
  - **Absorb** - First exposure, never reviewed
  - **Recognize** - Flashcard mode: see question, flip to answer
  - **Retrieve** - Quiz mode: answer without seeing the answer
  - **Mastered** - SM-2 spaced repetition with optimized intervals
- **SM-2 Algorithm** - Industry-standard spaced repetition with ease factor, interval, and repetition tracking
- **Multi-Source Cards** - Sync cards from flashcards, quizzes, and mind maps
- **Mind Map Card Generation** - Auto-generates branch recall, node completion, and detail recall cards from mind maps
- **AI Study Coach** - Chat with an AI coach for personalized study guidance
- **AI Nudges** - Motivational messages based on study patterns
- **Card Explanations** - AI-powered detailed explanations for any card
- **Session Feedback** - AI coaching after review sessions
- **Weekly Reports** - AI-generated weekly learning summaries
- **Interval Adjustment** - AI-driven topic-specific spaced repetition tuning
- **Review Sessions** - Tracked sessions with undo support and progress indicators
- **Daily Goals** - Configurable daily review targets with progress ring
- **Exam Tracking** - Set exam dates with AI-optimized study plans
- **AI Study Plans** (V3) - AI-generated study schedules with multi-tool activity recommendations
- **Learning Analytics** - Retention curves, difficulty assessment, and mastery tracking per document
- **Notifications** - Web push and Telegram integration with quiet hours and daily summaries

### Course System
- **Course Generation** - AI-generated structured courses from documents
- **Lesson Management** - Organized lessons with progress tracking
- **Smart Generation** - Existing course detection and improved prompts

### Settings & AI Configuration
- **Multi-Provider AI Support** - Choose between Gemini (Google), OpenRouter, LaoZhang, or Kie.ai
- **Custom API Keys** - Bring your own API key for any supported provider
- **Model Selection** - Pick specific models per provider
- **Reasoning Effort** - Configure AI reasoning effort (low/high) for supported models
- **Usage Analytics** - Track token usage and costs across all AI operations
- **Files Panel** - Expandable sidebar panel for document management

### Token & Context Management
- **Real-Time Token Tracking** - Monitor conversation token usage with visual indicators
- **Context Window Warnings** - Progressive alerts (caution -> warning -> critical) as conversation grows
- **Smart Optimization** - Automatic conversation summarization retaining recent context
- **Document Context Sizing** - Dynamic adjustment of document context based on conversation length
- **Quality Preservation** - Maintain AI response quality through intelligent context management

### User Interface
- **Modern Design** - Clean, professional interface with teal/amber color scheme
- **Dark/Light Themes** - System-aware theme switching with persistent preferences
- **Responsive Layout** - Desktop-first design that adapts to different screen sizes
- **Accessibility** - WCAG AA compliance with keyboard navigation and screen reader support
- **Loading States** - Smooth transitions and skeleton loaders for async operations
- **Toast Notifications** - Non-intrusive feedback for user actions
- **Framer Motion Animations** - Smooth transitions and interactive elements throughout

## Technology Stack

### Frontend
- **Next.js 15.5** - React framework with App Router for server-side rendering and API routes
- **React 19** - UI library with latest concurrent features
- **TypeScript 5.6** - Static type checking for reliability and developer experience
- **Tailwind CSS 3.4** - Utility-first CSS framework with custom design system
- **Framer Motion 11** - Animation library for smooth transitions and interactive elements
- **@xyflow/react 12** - Interactive node-based mind map visualization
- **D3 7** - Data visualization library
- **Mermaid 11** - Diagram and chart rendering

### Backend & Database
- **Supabase PostgreSQL** - Database with Row Level Security for user data isolation
- **Supabase Auth** - Authentication service supporting email/password and OAuth providers
- **Supabase Storage** - Secure file storage with private buckets and signed URLs
- **@supabase/ssr** - Server-side Supabase client for Next.js integration
- **Next.js API Routes** - RESTful endpoints with Server-Sent Events for response streaming

### AI Processing
- **Google Gemini** - Primary AI models (2.5 Flash, 3 Flash, 3 Pro) via @google/genai SDK
- **OpenAI SDK** - OpenAI-compatible provider integration (OpenRouter, LaoZhang, Kie.ai)
- **Multi-Provider AI Router** - Intelligent routing with user preference -> server fallback chain
- **1M Token Context** - Gemini's massive context window handles large documents natively
- **Smart Model Selection** - Automatic model choice based on query complexity
- **Usage Tracking** - Per-request token counting and cost computation

### State Management
- **Zustand 5.0** - Lightweight state management with middleware support
- **Dexie 4** - IndexedDB wrapper for client-side chat history and offline support
- **React Query (TanStack) 5** - Server state management and data fetching
- **Zustand Persist** - Automatic state persistence to localStorage

### UI Components
- **Radix UI** - Headless, accessible component primitives (Dialog, Dropdown, Tabs, etc.)
- **Lucide React** - Icon library with 1000+ consistent icons
- **React Markdown** - Markdown rendering with GitHub-flavored markdown support
- **Sonner** - Toast notification system
- **next-themes** - Dark/light theme management with system detection

### PDF Processing
- **pdfjs-dist** - PDF.js for browser-based PDF parsing and text extraction
- **pdf-parse** - Server-side PDF content extraction
- **html2pdf.js** - Client-side PDF generation from HTML
- **@mohtasham/md-to-docx** - Markdown to DOCX conversion for exports

### Notifications
- **web-push** - Web push notification support
- **Telegram Bot** - Telegram integration for study reminders

### Development Tools
- **pnpm** - Fast, disk-efficient package manager
- **ESLint** - Code linting with Next.js configuration
- **TypeScript Compiler** - Type checking (pnpm typecheck)
- **@next/bundle-analyzer** - Bundle size analysis and optimization
- **Zod** - Runtime schema validation

## Getting Started

### Prerequisites
- Node.js 18 or higher
- pnpm (package manager)
- Google Gemini API key ([get one here](https://makersuite.google.com/app/apikey)) or a Kie.ai/OpenRouter API key
- Supabase account ([create free account](https://supabase.com))

### Installation

1. Clone the repository and install dependencies:
   ```bash
   git clone <repository-url>
   cd cognileapai
   pnpm install
   ```

2. Create `.env.local` in the project root:
   ```env
   # Google Gemini API (primary)
   GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here

   # Kie.ai API (fallback, OpenAI-compatible)
   KIE_API_KEY=your_kie_key_here

   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # Encryption key for user API keys
   ENCRYPTION_KEY=your_encryption_key

   # Web Push (optional, for notifications)
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
   VAPID_PRIVATE_KEY=your_vapid_private_key

   # Telegram Bot (optional, for notifications)
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   ```

3. Set up Supabase:
   - Create a new project in Supabase dashboard
   - Run migrations from `supabase/migrations/` directory in order
   - Configure Row Level Security policies (automatic with migrations)
   - Create a private storage bucket named `documents`
   - Enable email authentication in Authentication > Providers
   - (Optional) Configure Google OAuth with your credentials

4. Start the development server:
   ```bash
   pnpm dev
   # or for faster builds with Turbopack
   pnpm dev:turbo
   ```

5. Open [http://localhost:3000](http://localhost:3000) and create an account

## Development Commands

```bash
# Development
pnpm dev              # Start development server (http://localhost:3000)
pnpm dev:turbo        # Start with Turbopack (faster HMR)
pnpm build            # Production build
pnpm build:analyze    # Build with bundle size analysis
pnpm start            # Start production server

# Code Quality
pnpm lint             # Run ESLint
pnpm typecheck        # TypeScript type checking (no emit)
```

## Architecture

### Project Structure
```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API endpoints
│   │   ├── active-recall/        # Active Recall endpoints (due-cards, review, sync, AI coaching, agent plans)
│   │   ├── chat/                 # Chat system endpoints
│   │   ├── courses/              # Course management
│   │   ├── documents/            # Document management
│   │   ├── extract-content/      # PDF processing
│   │   ├── settings/             # User settings & AI preferences
│   │   ├── study-tools/          # Study tools generation
│   │   ├── telegram/             # Telegram bot webhook
│   │   ├── upload/               # File upload handler
│   │   └── usage/                # Usage tracking & analytics
│   ├── active-recall/            # Active Recall pages (dashboard, review, insights, exams, settings, plan)
│   ├── auth/                     # Authentication pages
│   ├── chat/                     # Chat conversation pages
│   ├── courses/                  # Course management pages
│   ├── dashboard/                # Main app interface
│   ├── settings/                 # User settings page
│   └── page.tsx                  # Landing page
│
├── components/                   # React components
│   ├── active-recall/            # Active Recall components (dashboard, review cards, AI chat sidebar)
│   │   └── v2/                   # V2 components (onboarding, plan cards, mindmap review)
│   ├── chat/                     # Chat system components
│   ├── course/                   # Course components
│   ├── study-tools/              # Study tools components (flashcards, quiz, mind map viewers)
│   ├── settings/                 # Settings UI components
│   ├── landing/                  # Landing page sections
│   ├── error-management/         # Error handling UI
│   ├── files-panel.tsx           # Sidebar files panel
│   ├── study-tools-sidebar-panel.tsx # Study tools sidebar panel
│   ├── sidebar.tsx               # Main sidebar navigation
│   └── ui.tsx                    # Shared UI components
│
├── lib/                          # Core utilities
│   ├── supabase/                 # Supabase clients (client, server, middleware)
│   ├── errors/                   # Error handling system (translator, logger, types)
│   ├── active-recall-store.ts    # Active Recall state management (Zustand)
│   ├── active-recall-review-store.ts # Review session management with undo stack
│   ├── active-recall-sync.ts     # Sync cards from flashcards/quizzes
│   ├── active-recall-mindmap-sync.ts # Generate cards from mind maps
│   ├── active-recall-prompts.ts  # AI prompts for nudges, reports, interval adjustments
│   ├── sm2.ts                    # SM-2 spaced repetition algorithm
│   ├── forgetting-curve.ts       # Forgetting curve calculations
│   ├── ai-router.ts             # Multi-provider AI routing (user prefs -> server fallback)
│   ├── ai-config.ts             # AI model configuration and safety settings
│   ├── ai-providers.ts          # Provider definitions (Gemini, OpenRouter, LaoZhang, Kie.ai)
│   ├── model-registry.ts        # Model catalog with pricing data
│   ├── usage-tracker.ts         # Token usage recording and cost computation
│   ├── chat-store.ts            # Chat state management (Zustand)
│   ├── use-chat.ts              # Custom hook for chat operations
│   ├── genai-client.ts          # Google GenAI SDK integration with stateful sessions
│   ├── session-store.ts         # Database persistence for chat sessions
│   ├── chat-history.ts          # IndexedDB storage for offline chat access
│   ├── study-tools-store.ts     # Study tools generation state
│   ├── study-tools-prompts.ts   # AI prompts for study materials
│   ├── flashcard-store.ts       # Flashcard state (Zustand)
│   ├── quiz-store.ts            # Quiz state (Zustand)
│   ├── mindmap-store.ts         # Mind map state (Zustand)
│   ├── course-store.ts          # Course state management
│   ├── course-prompts.ts        # AI prompts for course generation
│   ├── course-generation-manager.ts # Course generation orchestration
│   ├── token-manager.ts         # Token tracking & conversation optimization
│   ├── token-counter.ts         # Accurate token counting
│   ├── encryption.ts            # API key encryption/decryption
│   ├── push-notifications.ts    # Client-side push notification setup
│   ├── push-notifications-server.ts # Server-side push notification sending
│   ├── telegram-bot.ts          # Telegram bot integration
│   ├── export-utils.ts          # PDF/DOCX export functionality
│   ├── retry-manager.ts         # Retry logic with exponential backoff
│   └── use-user-preferences.ts  # User AI preference hooks
│
├── contexts/                     # React contexts
├── hooks/                        # Custom hooks
├── types/                        # TypeScript definitions
│   ├── active-recall.ts         # Active Recall types (ReviewCard, RecallLayer, StudyPlan, etc.)
│   ├── flashcards.ts            # Flashcard types
│   ├── quiz.ts                  # Quiz types
│   └── mindmap.ts               # Mind map types
└── middleware.ts                 # Authentication middleware
```

### Key Systems

#### Active Recall System
**Files**: `src/lib/active-recall-store.ts`, `src/lib/active-recall-review-store.ts`, `src/lib/sm2.ts`

Multi-layer spaced repetition system:
- **4 Recall Layers**: Absorb -> Recognize -> Retrieve -> Mastered (progressive difficulty)
- **SM-2 Algorithm**: Ease factor, interval, and repetition tracking for optimal spacing
- **Multi-Source Sync**: Cards generated from flashcards, quizzes, and mind maps
- **AI Coaching**: Nudges, session feedback, card explanations, weekly reports
- **Agent Study Plans**: AI generates and adapts study schedules based on exam dates and performance
- **Review Sessions**: Tracked sessions with undo stack, mindmap group reviews

#### AI Router & Multi-Provider System
**Files**: `src/lib/ai-router.ts`, `src/lib/ai-providers.ts`, `src/lib/model-registry.ts`

Intelligent AI routing:
- **Resolution Chain**: User's configured provider/key -> Server KIE_API_KEY -> Server GOOGLE_API_KEY
- **4 Providers**: Gemini (Google), OpenRouter, LaoZhang, Kie.ai
- **Cost Tracking**: Per-request token counting with model-specific pricing
- **Encrypted Keys**: User API keys encrypted at rest with server-side decryption

#### Token Management System
**File**: `src/lib/token-manager.ts`

Intelligent conversation length tracking with progressive warnings:
- Real-time token estimation (character + word-based algorithms)
- Context window monitoring (200K practical limit, 1M+ technical limit)
- Progressive warning levels: Caution (150K) -> Warning (180K) -> Critical (200K)
- Automatic conversation optimization with summarization
- Dynamic document context sizing based on conversation length

#### Chat System
**Files**: `src/lib/chat-store.ts`, `src/lib/use-chat.ts`, `src/lib/genai-client.ts`

Comprehensive state management with Zustand and Google GenAI SDK:
- **Stateful Sessions**: Database-persistent chat sessions via `genai-client.ts`
- **Server-Sent Events**: Real-time streaming with timeout protection
- **Dual Persistence**: Supabase database + IndexedDB for offline access
- **Optimistic UI Updates**: Immediate feedback with automatic rollback on errors
- **Multi-Document Context**: Support for chatting with multiple documents simultaneously

#### Study Tools System
**File**: `src/lib/study-tools-store.ts`

Advanced generation system supporting 6 tool types:
- **Study Guides** - Structured learning paths
- **Flashcards** - Interactive Q&A with swipe animations
- **Smart Notes** - Interconnected concept notes
- **Smart Summaries** - Hierarchical overviews
- **Quizzes** - Multiple choice with scoring
- **Mind Maps** - Interactive node-based visualization (XyFlow)
- Concurrent generation, progress tracking, export (PDF/DOCX/clipboard)

### Security

- **Row Level Security** - Database policies enforce user data isolation
- **Protected Routes** - Middleware checks authentication before page access
- **Secure File Storage** - Private buckets with time-limited signed URLs
- **Server-Side API Keys** - AI API keys never exposed to client
- **Encrypted User Keys** - User-provided API keys encrypted at rest
- **Input Validation** - Zod schema validation at API boundaries
- **OAuth Security** - PKCE flow for Google authentication

### Performance

- **Code Splitting** - Dynamic imports for study tools, flashcards, and mind maps
- **Component Memoization** - React.memo for expensive renders (chat messages, markdown)
- **Lazy Store Loading** - Tool-specific Zustand stores loaded on demand
- **State Persistence** - localStorage and IndexedDB for offline access
- **Efficient Streaming** - Smooth SSE with batched character rendering
- **Bundle Optimization** - Tree shaking and optimized imports
- **Document Caching** - In-memory document context cache (5 minute TTL)
- **Session Caching** - Active chat sessions cached in memory with automatic cleanup

## Database Schema

Core tables in Supabase PostgreSQL:

### Authentication & Users
- **users** - User accounts and authentication (via Supabase Auth)
- **user_ai_preferences** - Default AI provider and model settings
- **user_api_keys** - Encrypted user API keys for AI providers

### Documents & Content
- **documents** - PDF metadata, storage paths, and full extracted text content
- **sections** - Hierarchical document sections with parent-child relationships

### Chat System
- **conversations** - Chat session metadata with token breakdown tracking
- **messages** - Chat messages with role, content, sequence numbers, and metadata
- **chat_sessions** - Persistent session data for stateful conversations

### Study Tools
- **outputs** - Generated study materials (guides, summaries, notes, flashcards, quizzes, mind maps) stored as JSONB

### Active Recall
- **review_cards** - Individual study cards with SM-2 state (ease_factor, interval_days, recall_layer, source_type)
- **review_sessions** - Study session tracking with feedback
- **notification_preferences** - Push/Telegram notification settings with quiet hours
- **exam_dates** - Exam tracking with reminder schedules
- **weekly_reports** - AI-generated weekly learning reports
- **agent_study_plans** - AI-generated study schedules with activities and completion tracking

### Analytics
- **usage_records** - Per-request token usage and cost tracking

### Courses
- **courses** - AI-generated course metadata
- **course_lessons** - Individual lessons within courses
- **course_progress** - User progress tracking per course

All tables protected by Row Level Security policies ensuring complete user data isolation.

## Contributing

This is a personal project and not currently accepting external contributions. Feel free to fork for your own use.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

Built with Next.js, TypeScript, Supabase, Google Gemini, and Zustand
