# Dashboard & Documents System - Simple Guide

## What This System Does

Think of CogniLeap like a smart study assistant. You upload PDF files, and the system helps you study them through chat, flashcards, and other tools. The **Dashboard** is your home base, the **Sidebar** is your navigation menu, and the **Files Panel** is where you manage all your uploaded files.

---

## 🏗️ Tech Stack (The Building Blocks)

### Frontend (What You See)
- **Next.js 15 + React 19** - The main framework (like the building's structure)
- **TypeScript** - Adds safety by checking code for mistakes before running
- **Tailwind CSS** - Makes everything look good with pre-made styling
- **Framer Motion** - Smooth animations (sliding panels, fading effects)

### Backend (Behind the Scenes)
- **Supabase** - All-in-one solution that handles:
  - **Database** (PostgreSQL) - Stores document info, chat history, user data
  - **Storage** - Keeps the actual PDF files safe
  - **Authentication** - Login/signup system
- **Google Gemini AI** - The AI brain that chats with you and generates study materials

### Document Processing
- **pdf2json + pdf-parse** - Reads PDF files and extracts text
- **SHA-256 Checksum** - Creates unique fingerprints for files to detect duplicates

---

## 📊 System Architecture

```
                            ┌──────────────────┐
                            │      USER        │
                            └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │    DASHBOARD     │
                            └────────┬─────────┘
                                     │
                     ┌───────────────┼───────────────┐
                     │                               │
                     ▼                               ▼
            ┌────────────────┐            ┌──────────────────┐
            │    SIDEBAR     │            │ DOCUMENTS PANEL  │
            │   Navigation   │            │   File Manager   │
            └────────────────┘            └─────────┬────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │   UPLOAD PDFs    │
                                          └─────────┬────────┘
                                                    │
                                  ┌─────────────────┼─────────────────┐
                                  │                                   │
                                  ▼                                   ▼
                        ┌───────────────────┐              ┌───────────────────┐
                        │ SUPABASE STORAGE  │              │     DATABASE      │
                        │  (Store Files)    │              │  (Store Metadata) │
                        └───────────────────┘              └─────────┬─────────┘
                                                                     │
                                                                     ▼
                                                          ┌────────────────────┐
                                                          │    BACKGROUND      │
                                                          │    PROCESSING      │
                                                          └─────────┬──────────┘
                                                                    │
                                                                    ▼
                                                          ┌────────────────────┐
                                                          │  Extract Text &    │
                                                          │   Count Tokens     │
                                                          └─────────┬──────────┘
                                                                    │
                                                                    ▼
                                                          ┌────────────────────┐
                                                          │  READY FOR CHAT    │
                                                          │  & STUDY TOOLS     │
                                                          └────────────────────┘
```

---

## 🎯 The Three Main Parts

### 1️⃣ Dashboard (Your Home Screen)

**What it does:**
- Shows quick action cards (Start Chat, Generate Flashcards, etc.)
- Drag & drop area to upload PDFs anywhere
- Organized tabs to view different content

**How it works:**
- Built with React components that snap together like LEGO blocks
- Uses **state management** (Zustand) - think of it like a shared memory that all components can read/write
- Prefetches (pre-loads) pages in the background so clicking feels instant

**Location:** `src/app/dashboard/page.tsx`

---

### 2️⃣ Sidebar (The Navigation Menu)

**What it does:**
- Quick links to Dashboard, Chat, Documents, Settings
- Theme toggle (dark/light mode)
- User profile with logout option
- Collapses to save screen space

**How it works:**
- Always visible on the left side
- Tracks which page you're on and highlights it
- Stores your preferences (collapsed/expanded) in **localStorage** (browser storage)
- Smooth animations using Framer Motion

**Technical Detail:**
```javascript
// Checks which page you're on
const currentPath = usePathname()
// Saves collapse state
localStorage.setItem('sidebar-collapsed', isCollapsed)
```

**Location:** `src/components/sidebar.tsx`

---

### 3️⃣ Files Panel (File Manager)

**What it does:**
- Upload PDFs (click or drag & drop)
- See all your documents with details (pages, size)
- Select, rename, or delete files
- Shows processing status (uploading → processing → ready)

**How it works:**
- Slides out from the right side when you click "Documents"
- Connects to the **Documents Context** (shared state) so all parts of the app know which documents are selected
- Updates in real-time as files are uploaded or processed

**Location:** `src/components/files-panel.tsx`

---

## 📤 Document Upload Flow (Step by Step)

```
         ┌────────────────────┐
         │  User Selects PDF  │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Browser Validates │
         │  (PDF? < 100MB?)   │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Send to API       │
         │  Server            │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Create SHA-256    │
         │  Checksum          │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Check Database    │
         │  for Duplicate     │
         └──────────┬─────────┘
                    │
            ┌───────┴────────┐
            │                │
       Duplicate          New File
         Found               │
            │                ▼
            │     ┌────────────────────┐
            │     │  Upload PDF to     │
            │     │  Supabase Storage  │
            │     └──────────┬─────────┘
            │                │
            │                ▼
            │     ┌────────────────────┐
            │     │  Create Database   │
            │     │  Record            │
            │     └──────────┬─────────┘
            │                │
            └────────────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Show Success      │
         │  to User           │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  BACKGROUND JOB:   │
         │  Download PDF      │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Extract All Text  │
         │  using pdf2json    │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Count Tokens      │
         │  using Gemini AI   │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Update Status to  │
         │  "Completed"       │
         └────────────────────┘
```

**What happens at each step:**

1. **User Selects PDF** - Click upload button or drag & drop file
2. **Browser Validates** - Check it's a PDF and under 100MB
3. **Send to API Server** - Upload file to backend
4. **Create SHA-256 Checksum** - Generate unique fingerprint of the file
5. **Check for Duplicate** - See if this exact file was uploaded before
   - If duplicate: Return existing document (saves space!)
   - If new: Continue to next steps
6. **Upload to Supabase Storage** - Store PDF file securely at `{user_id}/{timestamp}-{filename}`
7. **Create Database Record** - Save metadata (title, pages, size, checksum)
8. **Show Success to User** - Display document in panel immediately
9. **Background Processing** (happens behind the scenes):
   - Download PDF from storage
   - Extract all text using pdf2json
   - Count tokens using Gemini AI
   - Update status to "completed"

---

## 🗄️ How Documents Are Stored

### Storage Structure
```
Supabase Storage (documents bucket)
└── user_id_12345/
    ├── 2025-01-15-biology-notes.pdf
    ├── 2025-01-16-math-textbook.pdf
    └── 2025-01-17-history-chapter.pdf
```

### Database Table (documents)
```
┌────────────┬─────────────────┬────────────┬─────────┬─────────────────┐
│ id         │ title           │ page_count │ bytes   │ processing_status│
├────────────┼─────────────────┼────────────┼─────────┼─────────────────┤
│ abc-123    │ Biology Notes   │ 25         │ 2048000 │ completed       │
│ def-456    │ Math Textbook   │ 300        │ 15360000│ processing      │
└────────────┴─────────────────┴────────────┴─────────┴─────────────────┘
```

**Why this approach?**
- **Security:** Each user has their own folder, can only access their files
- **Efficiency:** Checksums prevent duplicate uploads
- **Scalability:** Supabase handles storage, backups, and serving files

---

## 🔄 State Management (How Data Flows)

**The Problem:** When you upload a document in the panel, the dashboard needs to know about it instantly.

**The Solution:** **React Context + Zustand**

```
                     ┌─────────────────────────────────────┐
                     │      DOCUMENTS CONTEXT              │
                     │       (Shared State)                │
                     │                                     │
                     │  ┌─────────────────────────────┐   │
                     │  │  • Selected Documents       │   │
                     │  │  • Upload Progress          │   │
                     │  │  • Document List            │   │
                     │  │  • Refresh Functions        │   │
                     │  └─────────────────────────────┘   │
                     └───────────┬─────────────────────────┘
                                 │
                                 │ (All components can read/write)
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
  ┌───────────────┐    ┌─────────────────┐    ┌───────────────┐
  │  DOCUMENTS    │    │   DASHBOARD     │    │   CHAT PAGE   │
  │    PANEL      │    │                 │    │               │
  └───────────────┘    └─────────────────┘    └───────────────┘
          │                      │                      │
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Updates instantly     │
                    │   available everywhere  │
                    └─────────────────────────┘
```

### Documents Context (`src/contexts/documents-context.tsx`)
- Stores list of all documents
- Tracks which documents are selected
- Caches data for 2 minutes to reduce server requests
- Broadcasts events when documents are added/removed

**Example:**
```typescript
// Any component can use this
const { documents, selectedDocuments, refreshDocuments } = useDocuments()

// Upload a document
addUploadingDocument(newDocument)

// Select for chat
addSelectedDocument(documentId)
```

---

## 🔐 Security Features

```
┌─────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                      │
└─────────────────────────────────────────────────────────┘

    LAYER 1: AUTHENTICATION
    ┌──────────────────────────────────────┐
    │  User Login → JWT Token → Session   │
    │  Token auto-refreshes every hour     │
    └──────────────────────────────────────┘
                    │
                    ▼
    LAYER 2: ROW LEVEL SECURITY (DATABASE)
    ┌──────────────────────────────────────┐
    │  Database checks: user_id matches?   │
    │  Can only see YOUR documents         │
    │  Can only modify YOUR data           │
    └──────────────────────────────────────┘
                    │
                    ▼
    LAYER 3: PRIVATE STORAGE
    ┌──────────────────────────────────────┐
    │  Files in private bucket             │
    │  Access via signed URLs only         │
    │  URLs expire after 1 hour            │
    └──────────────────────────────────────┘
                    │
                    ▼
           ✅ SECURE ACCESS
```

### 1. Authentication
- **What:** Login/signup system using Supabase Auth
- **How:** Checks if you're logged in before showing dashboard
- **Tech:** JWT tokens (secure, temporary passes) that refresh automatically

### 2. Row Level Security (RLS)
- **What:** Database rules that ensure users only see their own data
- **How:** Supabase checks `user_id` on every query automatically
- **Example:** `SELECT * FROM documents WHERE user_id = current_user()`

### 3. Private Storage
- **What:** PDF files are private by default
- **How:** Access requires **signed URLs** (temporary download links that expire)
- **Benefit:** Even if someone guesses a filename, they can't download it

---

## ⚡ Performance Optimizations

```
         USER REQUEST
              │
              ▼
    ┌──────────────────┐
    │  Check Cache     │────> CACHE HIT ──> Return Instantly ⚡
    │  First           │
    └────────┬─────────┘
             │
        CACHE MISS
             │
             ▼
    ┌──────────────────┐
    │  Fetch from      │
    │  Server          │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │  Store in Cache  │
    │  for Next Time   │
    └────────┬─────────┘
             │
             ▼
      Return to User
```

### 1. Caching Strategy
```
Documents List ───> Cached for 2 minutes  ───> Fewer server requests
Document Text  ───> Cached for 5 minutes  ───> Instant chat responses
User Session   ───> Cached for 1 hour     ───> Stay logged in
```

**Why?** Reduces server requests, makes everything feel faster

### 2. Optimistic UI Updates
```
User Uploads File
       │
       ├──> Show in UI Immediately (Optimistic) ⚡
       │
       └──> Send to Server (Background)
                  │
                  └──> Replace with Real Data when Ready ✅
```

**Benefit:** Feels instant to the user, no waiting for server

### 3. Lazy Loading
```
Initial Load:           User Clicks "Flashcards":
┌──────────┐            ┌──────────┐
│ Dashboard│            │ Dashboard│
│ Sidebar  │            │ Sidebar  │
│ Documents│            │ Documents│
└──────────┘            │ [Loading]│ ──> Download Study Tools Code
   (Fast!)              └──────────┘
                           (Only when needed)
```

**Benefit:** Faster initial page load, smaller download

### 4. Code Splitting
```
App Bundle
    │
    ├──> dashboard.js (20KB)
    ├──> chat.js (35KB)
    ├──> study-tools.js (50KB)
    └──> settings.js (15KB)

Only download what you need for current page!
```

**Benefit:** Don't download entire app at once

---

## 🎨 UI/UX Features

### Responsive Sidebar
```
Desktop:                    Mobile:
┌─────────┬─────────┐      ┌──────────────┐
│ Sidebar │ Content │      │   Content    │
│         │         │      │  (Sidebar    │
│  [Nav]  │  [Main] │      │   hidden)    │
│         │         │      │              │
└─────────┴─────────┘      └──────────────┘
                              ☰ Menu button
```

### Animated Panels
- **Slide in/out:** Documents panel, Study tools panel
- **Fade effects:** Loading states, notifications
- **Smooth transitions:** Theme switching, route changes

### Loading States
- **Skeleton screens:** Show placeholder while loading documents
- **Progress indicators:** Upload progress bars
- **Streaming text:** Chat responses appear character by character

---

## 🧩 How Components Connect

```
                        ┌─────────────────────────┐
                        │      APP LAYOUT         │
                        │   (Root Component)      │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │    AUTH PROVIDER        │
                        │  (Login/User State)     │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   THEME PROVIDER        │
                        │  (Dark/Light Mode)      │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  DOCUMENTS PROVIDER     │
                        │   (Shared Doc State)    │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   DASHBOARD LAYOUT      │
                        │   (Main Structure)      │
                        └────────────┬────────────┘
                                     │
                  ┌──────────────────┼──────────────────┐
                  │                  │                  │
                  ▼                  ▼                  ▼
        ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
        │   SIDEBAR    │   │ MAIN CONTENT │   │  DOCUMENTS   │
        │              │   │              │   │    PANEL     │
        └──────────────┘   └──────┬───────┘   └──────────────┘
                                  │
                     ┌────────────┼────────────┐
                     │            │            │
                     ▼            ▼            ▼
            ┌─────────────┐ ┌──────────┐ ┌──────────┐
            │  DASHBOARD  │ │   CHAT   │ │ SETTINGS │
            │    PAGE     │ │   PAGE   │ │   PAGE   │
            └─────────────┘ └──────────┘ └──────────┘
```

### Provider Pattern
- **What:** Wraps the app with "providers" that share data
- **Why:** Avoids passing data through every component (called "prop drilling")
- **Example:** `<DocumentsProvider>` makes document data available everywhere

---

## 📝 Key Takeaways

### Why This Tech Stack?
- **Next.js:** Fast, SEO-friendly, easy deployment
- **Supabase:** Complete backend without managing servers
- **TypeScript:** Catches bugs before they happen
- **Tailwind CSS:** Fast styling without writing custom CSS
- **Gemini AI:** Powerful, cost-effective AI for chat and generation

### The Big Picture
1. **User uploads PDF** → Stored securely in Supabase
2. **System extracts text** → Ready for AI processing
3. **User interacts** → Chat, flashcards, summaries
4. **Everything syncs** → Real-time updates across the app

### Design Philosophy
- **Simplicity:** Clean interface, easy to understand
- **Performance:** Fast loading, smooth interactions
- **Security:** User data is private and protected
- **Scalability:** Can handle many users and files

---

## 🚀 Future Improvements

- **Offline mode:** Work without internet using IndexedDB
- **Collaborative study:** Share documents with classmates
- **Mobile app:** Native iOS/Android versions
- **More AI models:** OpenAI, Claude integration

---

*This system transforms static PDFs into interactive study experiences using modern web technologies and AI.*
