# Chat Feature Documentation - CogniLeap AI

> **Simple guide for understanding how the chat system works**

---

## What is the Chat Feature?

The chat feature allows users to have conversations with an AI assistant. Think of it like ChatGPT, but integrated into our learning platform. Users can:
- Have educational conversations with AI
- select uploaded documents (PDFs) as a source and chat with them
- Switch between different AI models

---

## Tech Stack (What We Used & Why)

### Frontend (What Users See)

**Next.js 15 + React 19**
- **What**: A modern web framework
- **Why**: Makes websites fast and user-friendly. It handles both the design and the server work
- **How**: We built the chat interface where users type messages and see responses

**TypeScript**
- **What**: JavaScript with type checking
- **Why**: Prevents coding mistakes and makes the code easier to understand
- **How**: Ensures messages, documents, and data are handled correctly

**Tailwind CSS**
- **What**: A styling framework
- **Why**: Makes the chat interface look clean and professional
- **How**: Styles the message bubbles, input boxes, and buttons

**Zustand**
- **What**: State management library
- **Why**: Keeps track of all messages, settings, and chat status in memory
- **How**: Stores messages temporarily so the chat updates instantly

### Backend (Behind the Scenes)

**Next.js API Routes**
- **What**: Server endpoints that handle requests
- **Why**: Connects the frontend to the AI and database
- **How**: Receives user messages and sends them to Google's AI

**Supabase + PostgreSQL**
- **What**: Database service
- **Why**: Stores all chat history, user data, and uploaded documents permanently
- **How**: Saves every message so users can come back later and see their chats

**Google Gemini AI**
- **What**: Google's latest AI model
- **Why**: Generates smart, context-aware responses
- **How**: Processes user questions and provides answers

**IndexedDB (via Dexie)**
- **What**: Browser storage
- **Why**: Caches data locally for faster loading
- **How**: Stores recent chat history on the user's device

---

## How It Works (The Simple Flow)

```
┌─────────────┐
│   USER      │
│ Types       │
│ Message     │
└──────┬──────┘
       │
       ↓
┌─────────────────────┐
│  CHAT INTERFACE     │
│  (React Component)  │
│  - Shows message    │
│  - Adds to list     │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│   API ENDPOINT      │
│  /api/chat/stateful │
│  - Checks user auth │
│  - Gets chat history│
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│   GOOGLE GEMINI AI  │
│  - Reads context    │
│  - Generates reply  │
│  - Streams back     │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│   DATABASE          │
│  - Saves user msg   │
│  - Saves AI reply   │
│  - Updates history  │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│   USER SEES REPLY   │
│  Word by word       │
│  (streaming)        │
└─────────────────────┘
```

---

## Two Main Features

### 1. Normal Chat (General Conversation)

**What it does**: User asks questions, AI responds

**Example Flow**:
```
User: "What is photosynthesis?"
  ↓
Frontend sends to backend
  ↓
Backend asks Google Gemini AI
  ↓
AI generates answer
  ↓
Answer streams back word-by-word
  ↓
User sees the answer appear live
```

**Key Components**:
- `chat-container.tsx`: Main chat window
- `chat-input.tsx`: Where users type
- `chat-messages.tsx`: Shows all messages
- `/api/chat/stateful`: Handles AI requests

### 2. Document Chat (Chat with PDFs)

**What it does**: Users upload a PDF and ask questions about it

**Example Flow**:
```
User uploads PDF → System processes it → Extracts text → Counts tokens
  ↓
User asks: "Summarize page 5"
  ↓
System finds the PDF content
  ↓
Sends PDF content + question to AI
  ↓
AI reads the PDF and answers the question
  ↓
User gets answer with page references
```

**How Documents are Processed**:

```
┌──────────────────┐
│ User Uploads PDF │
└────────┬─────────┘
         │
         ↓
┌────────────────────────┐
│ Extract Text from PDF  │
│ (Using PDF.js library) │
└────────┬───────────────┘
         │
         ↓
┌────────────────────────┐
│ Break into Chunks      │
│ (Smaller sections)     │
└────────┬───────────────┘
         │
         ↓
┌────────────────────────┐
│ Count Tokens           │
│ (Words AI understands) │
└────────┬───────────────┘
         │
         ↓
┌────────────────────────┐
│ Save to Database       │
│ (Ready for chat)       │
└────────────────────────┘
```

**Key Components**:
- `/api/upload/route.ts`: Handles PDF uploads
- `/api/documents/route.ts`: Manages documents
- `/api/chat/document/route.ts`: Document-specific chat
- Document processing system breaks PDFs into chunks

**Why Chunking?**
- AI has a practical limit on how much text it can read (200,000 tokens for optimal quality)
- Big PDFs are split into smaller sections
- System sends only relevant sections to AI
- Makes responses faster and more accurate

---

## Important Concepts Explained

### 1. Streaming (Why Responses Appear Word-by-Word)

**Normal way**: AI generates complete answer → User waits → Shows full answer

**Our way**: AI generates partial answer → Show immediately → Keep updating

**Why it's better**: Users don't have to wait. They see progress in real-time.

**How we do it**:
```javascript
// Backend sends data in chunks
response.write("Hello")
response.write(" world")
response.write("!")

// Frontend receives and displays immediately
"Hello" appears
"Hello world" appears
"Hello world!" appears
```

### 2. Token Management (Staying Within Limits)

**What are tokens?**
- Tokens = pieces of words that AI understands
- Example: "Hello world" = 2 tokens
- Gemini 2.5 technical max: **1,048,576 tokens** (1M+ tokens)
- Practical optimal limit: **200,000 tokens** for best quality

**Why it matters**:
- Long conversations use many tokens
- Big PDFs use many tokens
- If we exceed practical limit, response quality declines
- System uses 200K limit for optimal AI performance

**How we handle it**:

```
Token Usage Levels (2025 Implementation):

 0-150K tokens  ✅ Safe Zone
   No warnings, optimal performance

150K-180K tokens ⚠️ Caution
   Yellow notification: "Consider starting new chat soon"

180K-200K tokens ⚠️⚠️ Warning
   Orange alert: "Response quality may decline, optimize recommended"

200K+ tokens ❌ Critical
   Red error: "Context limit reached, start new chat or optimize"
```

**Token Counting Method**:
- Uses Gemini API's `countTokens` method for accurate counts
- Falls back to character-based estimation if API unavailable
- Caches token counts for 1 hour to improve performance
- Tracks ~4 characters per token, ~0.75 words per token

**Solution**: System automatically removes old messages from middle of conversation, keeping first and last messages (most important context).

### 3. Stateful Sessions (Remembering Context)

**Problem**: If server restarts, AI forgets the conversation

**Solution**:
- Save conversation state to database every time
- When user returns, load from database
- AI remembers what you discussed

**How it works**:
```
User Message 1: "What is AI?"
  ↓ Saved to DB
AI Response 1: "AI stands for..."
  ↓ Saved to DB

[User closes browser]
[Server restarts]
[User comes back]

  ↓ Load from DB
Chat resumes with full context intact
```

### 4. Model Selection (3 AI Brains)

We use 3 different Google Gemini models:

| Model | Speed | Power | When to Use |
|-------|-------|-------|-------------|
| Flash Lite | ⚡⚡⚡ Fastest | 🧠 Basic | Quick questions, simple tasks |
| Flash | ⚡⚡ Fast | 🧠🧠 Smart | Default for most chats |
| Pro | ⚡ Slower | 🧠🧠🧠 Genius | Complex analysis, long documents |

**Smart Auto-Selection**:
- Short question (< 100 words) → Flash Lite
- Document analysis → Flash or Pro
- Complex reasoning → Pro

---

## Database Structure (Where Everything is Saved)

### Main Tables:

**1. conversations**
- Stores each chat thread
- Fields: `id`, `user_id`, `title`, `is_starred`, `created_at`

**2. messages**
- Stores every message
- Fields: `id`, `conversation_id`, `role` (user/assistant), `content`, `sequence_number`

**3. documents**
- Stores uploaded PDFs
- Fields: `id`, `title`, `content`, `page_count`, `token_count`, `processing_status`

**4. pdf_chunks**
- Stores PDF sections
- Fields: `id`, `document_id`, `chunk_index`, `content`, `page_start`, `page_end`

**5. chat_sessions**
- Stores AI conversation state
- Fields: `id`, `conversation_id`, `conversation_history`, `system_tokens`, `document_tokens`

### How They Connect:

```
User
  │
  ├─── Has many Conversations
  │         │
  │         ├─── Has many Messages
  │         │
  │         └─── Has Chat Session
  │
  └─── Has many Documents
            │
            └─── Has many PDF Chunks
```

---

## Key Features in Detail

### Chat History

**What**: Sidebar showing all past conversations

**Features**:
- See all chats organized by date
- Star important conversations
- Search by keywords
- Delete old chats
- Rename chat titles

**How it works**:
- Every message automatically saved
- Chat title auto-generated from first question
- Stored in both database (permanent) and localStorage (fast access)

### Error Handling

**Friendly Error Messages**:

Instead of technical errors, users see helpful messages:

| Technical Error | User Sees |
|----------------|-----------|
| 401 Unauthorized | "Please log in to continue" |
| 429 Rate Limit | "Too many requests. Try again in 30 seconds" |
| 500 Server Error | "Something went wrong. Retrying automatically..." |

**Auto-Retry**:
- If request fails, system tries 3 times automatically
- Uses exponential backoff (waits 1s, then 2s, then 4s)
- Shows user a countdown timer

### Real-Time Updates

**How messages appear instantly**:

```
User types "Hello"
  ↓
Frontend adds message immediately (Optimistic Update)
  ↓
Sends to backend in background
  ↓
Backend confirms and saves to database
  ↓
Frontend updates with final saved version
```

If backend fails, the frontend removes the optimistic message and shows error.

---

## Performance Optimizations

### 1. Message Virtualization
- Only renders visible messages on screen
- Handles 1000+ message chats smoothly
- Saves memory and keeps UI fast

### 2. Document Context Caching
- Frequently used documents stored in memory for 5 minutes
- Prevents re-reading from database every time
- Makes document chats much faster

### 3. Parallel Operations
- Saving user message and AI response happen simultaneously
- Multiple database queries run at same time
- Cuts response time by 40%

### 4. Smooth Streaming
- Receives text chunks from AI
- Batches them (8 characters at a time)
- Displays at 30fps for smooth animation
- Feels natural like someone typing

---

## Security Features

### 1. Authentication
- Every API request checks if user is logged in
- Users can only see their own chats and documents

### 2. Row-Level Security (RLS)
- Database automatically filters data by user
- Impossible to access someone else's data
- Enforced at database level (can't bypass)

### 3. Input Validation
- Checks message length (max 10,000 characters)
- Validates file types (only PDFs allowed)
- Prevents code injection attacks

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Chat History │  │ Chat Window  │  │ Upload PDFs  │         │
│  │   Sidebar    │  │   Messages   │  │    Button    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────┬───────────────────┬────────────────┬──────────────────┘
         │                   │                │
         │                   │                │
         ↓                   ↓                ↓
┌─────────────────────────────────────────────────────────────────┐
│                       ZUSTAND STATE STORE                       │
│  • Current Messages  • Loading States  • Selected Documents     │
│  • Error States      • Token Counts    • Current Model          │
└────────┬────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                               │
│                                                                  │
│  POST /api/chat/stateful          POST /api/upload              │
│  • Authenticate user              • Upload PDF                  │
│  • Validate input                 • Extract text                │
│  • Calculate tokens               • Chunk document              │
│  • Call AI                        • Count tokens                │
│  • Stream response                • Save to DB                  │
│                                                                  │
│  GET /api/documents                                             │
│  • Fetch user's documents                                       │
│  • Check processing status                                      │
└────────┬───────────────────────┬────────────────────────────────┘
         │                       │
         ↓                       ↓
┌──────────────────┐    ┌──────────────────┐
│  GOOGLE GEMINI   │    │  SUPABASE DB     │
│      AI API      │    │   (PostgreSQL)   │
│                  │    │                  │
│  • Flash Lite    │    │  • conversations │
│  • Flash         │    │  • messages      │
│  • Pro           │    │  • documents     │
│                  │    │  • pdf_chunks    │
│  1M+ context     │    │  • chat_sessions │
└──────────────────┘    └──────────────────┘
```

---

## Summary: Why This Architecture?

### Chosen Technologies & Reasons:

1. **Next.js**: Fast, SEO-friendly, handles both frontend and backend
2. **React**: Component-based, easy to manage complex UIs
3. **Supabase**: Managed database, built-in authentication, real-time features
4. **Google Gemini**: State-of-the-art AI, large context window, affordable
5. **Zustand**: Simple state management, less boilerplate than Redux
6. **TypeScript**: Catches bugs early, better code documentation

### Key Design Decisions:

1. **Streaming responses**: Better user experience (immediate feedback)
2. **Stateful sessions**: AI remembers context across sessions
3. **Token management**: Prevents errors, optimizes costs
4. **Document chunking**: Handles large PDFs efficiently
5. **Dual storage** (localStorage + DB): Fast initial load + persistence
6. **Three AI models**: Balance between speed and quality

---

## Common User Scenarios

### Scenario 1: Normal Chat
```
1. User clicks "New Chat"
2. Types "Explain quantum physics simply"
3. Message appears instantly in chat window
4. AI response streams in word-by-word
5. Conversation saved automatically
6. Shows in chat history sidebar
```

### Scenario 2: Document Chat
```
1. User uploads research paper PDF (50 pages)
2. System processes: "Processing document... 30%... 60%... 100%"
3. User asks "What are the key findings?"
4. System reads entire PDF content
5. AI analyzes and summarizes key findings
6. Response includes page references
7. User can click page numbers to view original text
```

### Scenario 3: Long Conversation
```
1. User has 100-message conversation
2. Token counter shows: 120K / 200K tokens
3. Continues chatting
4. At 150K tokens, caution appears: "Consider starting new chat soon"
5. User ignores, continues
6. At 180K tokens: "Warning: Response quality may decline"
7. User clicks "Optimize"
8. System removes middle messages, keeping first 3 and last 30
9. Token count drops to 80K tokens
10. Chat continues smoothly with optimal quality
```

---

## Technical Highlights (For Presentation)

### What Makes Our Chat Special:

1. **Persistent Memory**: AI remembers entire conversation history, even after server restarts

2. **Smart Document Handling**: Can chat with PDFs up to 500 pages using intelligent chunking

3. **Adaptive AI**: Automatically chooses the right model based on question complexity

4. **Real-Time Streaming**: See AI thinking in real-time, no waiting for complete responses

5. **Token Intelligence**: Monitors usage and optimizes automatically to prevent failures

6. **Offline-Ready**: Recent chats cached locally for instant loading

7. **Error Recovery**: Automatic retries with user-friendly error messages

---

## File Locations Reference

### Frontend Components:
- `src/app/chat/[id]/page.tsx` - Main chat page
- `src/components/chat/chat-container.tsx` - Core chat logic
- `src/components/chat/chat-input.tsx` - Message input
- `src/components/chat/chat-messages.tsx` - Message display

### Backend APIs:
- `src/app/api/chat/stateful/route.ts` - Chat endpoint
- `src/app/api/chat/document/route.ts` - Document chat
- `src/app/api/upload/route.ts` - File uploads
- `src/app/api/documents/route.ts` - Document management

### Core Logic:
- `src/lib/genai-client.ts` - AI integration
- `src/lib/chat-store.ts` - State management
- `src/lib/chat-history.ts` - History handling
- `src/lib/token-counter.ts` - Token tracking

---

## Quick Stats

- **Lines of Code**: ~5,000+ for chat feature
- **API Endpoints**: 6 main endpoints
- **Database Tables**: 5 tables
- **AI Models**: 3 variants (Flash Lite, Flash, Pro)
- **Max Context**: 1,048,576 tokens technical max (200,000 practical for optimal quality)
- **Max PDF Size**: 500 pages
- **Response Time**: 1-3 seconds for typical queries
- **Streaming Speed**: ~30 tokens/second
- **Token Counting**: Gemini API with 1-hour cache

---

**End of Documentation**

*This chat system combines modern web technologies, powerful AI, and smart architecture to create a seamless learning experience.*
