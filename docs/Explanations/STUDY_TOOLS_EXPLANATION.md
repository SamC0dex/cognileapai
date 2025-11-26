# Study Tools System - Complete Explanation Guide

> **Purpose**: This document explains the study tools features in simple terms for presentation purposes. Perfect for explaining the technical implementation to professors or evaluators in 15 minutes.

---

## Table of Contents
1. [Overview & Tech Stack](#overview--tech-stack)
2. [The Four Study Tools](#the-four-study-tools)
3. [Flashcard System Deep Dive](#flashcard-system-deep-dive)
4. [Canvas (Content Viewer)](#canvas-content-viewer)
5. [Study Tools Panel](#study-tools-panel)
6. [How AI Generation Works](#how-ai-generation-works)
7. [System Prompts](#system-prompts)
8. [Fallback & Error Handling](#fallback--error-handling)
9. [Export Features](#export-features)
10. [Database & Storage](#database--storage)
11. [Quick Q&A Reference](#quick-qa-reference)

---

## Overview & Tech Stack

### What is the Study Tools System?

The study tools system is an **AI-powered learning assistant** that automatically generates study materials from your documents or conversations. Think of it as having a smart tutor that reads your materials and creates custom study guides, flashcards, summaries, and notes.

### Complete Tech Stack

**Frontend (User Interface):**
- **React + Next.js 15**: Modern web framework for building the interface
- **TypeScript**: Adds type safety to prevent bugs
- **Tailwind CSS**: Utility-first styling for responsive design
- **Framer Motion**: Smooth animations for flashcard flips and transitions
- **Zustand**: Lightweight state management (like Redux but simpler)
- **ReactMarkdown**: Converts markdown text into beautiful formatted content
- **Radix UI**: Accessible component primitives for dialogs and dropdowns

**Backend (Server & Processing):**
- **Next.js API Routes**: Server-side endpoints for handling requests
- **Supabase**: PostgreSQL database + authentication + real-time subscriptions
- **Google Gemini AI**: Three AI models (2.5 Pro, Flash, Flash-Lite) for content generation
- **Node.js**: Server runtime environment

**Storage & Data:**
- **Supabase PostgreSQL**: Main database for storing study tools
- **LocalStorage**: Browser storage for flashcard sets (faster access)
- **JSONB Columns**: Flexible storage format for different study tool types

**Key Libraries:**
- **@google/generative-ai**: Official SDK for Google's Gemini AI
- **remarkGfm**: GitHub-flavored markdown support (tables, etc.)
- **lucide-react**: Beautiful icon library

---

## The Four Study Tools

### 1. Study Guide (Blue Card)
**What it is:** A comprehensive, structured learning document like a textbook chapter.

**What makes it special:**
- Organized in layers: Foundation → Connections → Applications → Mastery
- Includes memory techniques and learning tips
- Has self-assessment sections
- Perfect for deep learning

**Technical Details:**
- Uses "Pyramid of Understanding" methodology
- Generated with **32,768 tokens** (very long output)
- Stored as markdown in database
- Rendered with heading hierarchy, lists, and code blocks

---

### 2. Flashcards (Green Card)
**What it is:** Interactive question-and-answer cards for quick memorization.

**What makes it special:**
- Customizable: Choose how many cards, difficulty level, and add custom focus
- Tinder-style swipe interface
- Tracks your study progress
- Works offline once generated

**Technical Details:**
- JSON format: Array of objects with `question`, `answer`, `difficulty`, `topic`
- Stored in both database AND browser localStorage
- Uses Framer Motion for flip animations
- Keyboard navigation supported

---

### 3. Smart Notes (Purple Card)
**What it is:** Organized notes using active learning principles, like taking notes in class but better.

**What makes it special:**
- Not just copying—includes insights, observations, and questions
- Uses Cornell Note-Taking + Mind Mapping techniques
- Has action items and practical applications
- Organized hierarchically with cross-references

**Technical Details:**
- Generated with **32,768 tokens** (long-form)
- Markdown format with multiple sections
- Includes memory aids and review schedules

---

### 4. Smart Summary (Amber/Yellow Card)
**What it is:** A concise strategic overview that highlights what matters most.

**What makes it special:**
- Shorter than notes or study guide
- Focuses on "why it matters" not just "what it says"
- Includes mental models and analogies
- Multi-dimensional analysis (core insights, implications, critical thinking)

**Technical Details:**
- Generated with **16,384 tokens** (medium length)
- Markdown format
- Uses "Significance Hierarchy" approach

---

## Flashcard System Deep Dive

### How Flashcards Are Created

1. **User Request**: Click the flashcard card in study tools panel
2. **Customization Dialog Opens**: Choose options
   - **Number of cards**: Fewer (5-10), Standard (10-20), More (20-30)
   - **Difficulty**: Easy, Medium, Hard
   - **Custom instructions**: Optional text like "focus on formulas"
3. **Request Sent**: Frontend sends these options to backend API
4. **AI Generation**: Backend uses Google Gemini AI with special instructions
5. **JSON Creation**: AI returns structured data like this:
   ```json
   [
     {
       "id": "1",
       "question": "What is Newton's First Law?",
       "answer": "Objects in motion stay in motion unless acted upon",
       "difficulty": "medium",
       "topic": "Physics Laws"
     }
   ]
   ```
6. **Saved**: Stored in database AND browser localStorage

### How Flashcards Are Stored

**Two Storage Locations:**

1. **Database (Supabase)**:
   - Table: `outputs`
   - Stored as JSONB in `payload` column
   - Includes metadata: creation date, source document, user ID
   - Persists forever until deleted

2. **Browser (LocalStorage)**:
   - Key: `flashcard-store`
   - JSON string format
   - Automatically synced with database
   - Enables offline access
   - Auto-deduplication on load

**Data Structure:**
```typescript
{
  flashcardSets: [
    {
      id: "uuid",
      title: "Physics Chapter 1",
      flashcards: [ /* array of cards */ ],
      options: { difficulty: "medium", numberOfCards: "standard" },
      createdAt: Date,
      documentId: "uuid"
    }
  ]
}
```

### How Flashcards Are Displayed

**Flashcard Viewer Component:**

1. **Opening**:
   - Click on flashcard set from generated documents list
   - Opens fullscreen viewer
   - Initializes study session

2. **Card Display**:
   - Shows one card at a time
   - Front side shows question (blue background)
   - Click or press Space to flip
   - Back side shows answer (green background)

3. **Navigation**:
   - **Arrow keys** or **click buttons**: Previous/Next card
   - **Space/Enter**: Flip card
   - **R key**: Restart from beginning
   - **Escape**: Exit viewer

4. **Visual Features**:
   - **3D flip animation**: Uses `rotateY` transform
   - **Card depth effect**: See next card peeking behind current one
   - **Progress bar**: Shows "Card 3 of 15" with visual bar
   - **Smooth transitions**: Spring physics animations

5. **Session Tracking**:
   - Tracks which card you're on
   - Remembers if you've seen all cards
   - Can record answers (for future analytics)
   - Saves session progress

**Technical Animation Details:**
- Uses Framer Motion's `useMotionValue` for smooth drag interactions
- `rotateY` from 0° (front) to 180° (back) with spring physics
- Entry/exit animations with opacity and scale transitions
- Responsive sizing: Adapts from mobile to fullscreen

---

## Canvas (Content Viewer)

### What is the Canvas?

The **canvas** is the full-screen viewer that displays your generated study materials. Think of it as a reading pane that slides out from the right side of the screen.

### How It Works

**Opening Canvas:**
1. Click on any study guide, smart summary, or smart notes from the list
2. Canvas slides in from the right side (smooth animation)
3. Takes up 40% of screen width (expandable to fullscreen)
4. Shows the content in beautifully formatted markdown

**Canvas Features:**

1. **Header Section** (Sticky Top Bar):
   - **Tool icon**: Color-coded (blue/purple/amber)
   - **Title**: Name of the study tool
   - **Creation date**: When it was generated
   - **Action buttons**: Copy, Fullscreen, Export, Close

2. **Content Area**:
   - Rendered markdown with proper formatting
   - Headers, lists, code blocks, tables
   - Scrollable content
   - Professional typography

3. **Action Buttons**:
   - **Copy**: Copies full content to clipboard
   - **Fullscreen**: Expands canvas to 85% width for focused reading
   - **Export**: Dropdown with PDF and DOCX options
   - **Close (X)**: Closes canvas with slide-out animation

### Technical Implementation

**Component**: `study-tools-canvas.tsx`

**Animation States (Framer Motion):**
- **Hidden**: `width: 0`, `opacity: 0`, `x: 20px` (off-screen right)
- **Visible**: `width: 40%`, `opacity: 1`, `x: 0` (on-screen)
- **Fullscreen**: `width: 85%` (expanded)
- **Transition**: Spring physics for smooth motion

**Markdown Rendering:**
- Uses `ReactMarkdown` component
- Plugin: `remarkGfm` for tables and advanced features
- Custom styling with Tailwind CSS classes
- Syntax highlighting for code blocks

**Special Handling:**
- **Flashcards**: Renders `FlashcardViewer` instead of markdown
- **JSON parsing**: Handles AI-generated JSON in markdown code blocks
- **Error handling**: Shows friendly error if content is corrupted

**Mutual Exclusion Rule:**
- Only one thing open at a time
- Opening canvas closes flashcard viewer
- Opening flashcard viewer closes canvas
- Prevents UI conflicts

---

## Study Tools Panel

### What is the Panel?

The **study tools panel** is the control center on the right side of the chat page. It's where you:
- Generate new study tools
- See your generated materials
- Access and manage everything

### Panel States

1. **Collapsed** (Default):
   - Width: 48px (just an icon visible)
   - Click to expand

2. **Expanded**:
   - Width: 40% of screen
   - Shows all tools and content

3. **With Canvas Open**:
   - Width: 50% (gives more room for canvas)

4. **Canvas Fullscreen**:
   - Width: 85% (canvas dominates, panel shrinks)

### Panel Sections

**1. Generation Cards Section**

Four color-coded cards representing each study tool:

- **Study Guide** (Blue):
  - Icon: Book
  - Description: "Comprehensive overview with key concepts"

- **Flashcards** (Green):
  - Icon: Layers
  - Description: "Interactive Q&A cards for memorization"

- **Smart Notes** (Purple):
  - Icon: FileText
  - Description: "Organized notes with key insights"

- **Smart Summary** (Amber):
  - Icon: Sparkles
  - Description: "Concise overview of main points"

**Card Behaviors:**
- **Hover**: Scales up slightly with smooth animation
- **Click**: Opens customization dialog (flashcards) or starts generation
- **Disabled**: Grayed out when no document is available
- **Generating**: Shows loading spinner with progress bar
- **Highlighted**: Glows when navigated from dashboard

**2. Generated Documents Section**

List of all your created study tools:

- **Document Item**:
  - Tool icon (color-coded)
  - Title (click to rename)
  - Creation timestamp (e.g., "2 hours ago")
  - Actions menu (•••): Rename, Copy, Download, Delete

- **Click behavior**: Opens in canvas or flashcard viewer

**3. Active Generation Indicators**

While generating:
- Progress bar (0-100%)
- Status message: "Generating study guide..."
- Model info: "Using Gemini 2.5 Pro"
- Cancel option (future feature)

**4. Error Display**

When generation fails:
- Red error banner
- User-friendly error message
- **Retry button**: Attempts generation again
- **Dismiss button**: Clears error

### Technical Implementation

**Component**: `study-tools-panel.tsx`

**State Management** (Zustand Store):
- `isPanelExpanded`: Boolean for collapsed/expanded
- `generatedContent`: Array of all study tools
- `activeGenerations`: Map of ongoing generations
- `isCanvasOpen`: Boolean
- `canvasContent`: Currently displayed content
- `error`: Error message if any

**Responsive Layout:**
- Uses CSS Grid and Flexbox
- Smooth width transitions with Framer Motion
- Auto-scrolls to active generation
- Sticky headers for better UX

**Data Flow:**
1. User clicks tool card
2. Store triggers API call
3. Store updates `activeGenerations`
4. Progress updates every 2 seconds
5. On completion: Adds to `generatedContent`
6. Auto-opens in canvas/viewer
7. Removes from `activeGenerations`

---

## How AI Generation Works

### The Complete Flow

**Step-by-Step Process:**

1. **User Triggers Generation**:
   - Clicks a study tool card
   - (For flashcards) Selects customization options

2. **Frontend Validation**:
   - Checks if document exists and is processed
   - Verifies user is authenticated
   - Shows loading state

3. **API Request**:
   - **Endpoint**: `/api/study-tools/generate`
   - **Method**: POST
   - **Body**: `{ type, documentId OR conversationId, flashcardOptions (if applicable) }`

4. **Backend Processing**:

   **A. Authentication**:
   - Verifies user session with Supabase Auth
   - Returns 401 if not authenticated

   **B. Content Retrieval**:
   - **For documents**: Fetches `document_content` from database
   - **For conversations**: Builds text from all messages chronologically
   - Validates content exists and processing is complete

   **C. Prompt Construction**:
   - Gets the appropriate system prompt for the tool type
   - Replaces variables:
     - `{documentContent}` → actual content
     - `{documentTitle}` → title
     - `{numberOfCards}` → card count with range (flashcards only)
     - `{difficulty}` → difficulty level (flashcards only)
     - `{customInstructions}` → user's custom text (flashcards only)

   **D. AI Generation** (with fallback):
   - Tries **Gemini 2.5 Pro** first (best model)
   - If overloaded → immediately tries **Gemini 2.5 Flash**
   - If still fails → tries **Gemini 2.5 Flash-Lite**
   - Each model has 2-3 retry attempts for non-overload errors
   - Uses specific token limits per tool type

   **E. Content Validation**:
   - Checks if content is complete (doesn't end with "...")
   - Validates minimum length (50+ characters)
   - For flashcards: Validates JSON structure
   - Cleans markdown (removes AI intro text like "Here's your study guide:")

   **F. Database Storage**:
   - Saves to `outputs` table
   - Includes: content, metadata, source (document/conversation), user ID
   - Uses upsert logic (update if exists, insert if new)

5. **Response to Frontend**:
   - Returns generated content with metadata
   - Includes: content, title, type, ID, creation date
   - Frontend adds to store and auto-opens

### Model Configuration

**Gemini 2.5 Pro (Primary):**
- Context: 1 million tokens (huge!)
- Output: 65,536 tokens (very long)
- Temperature: 0.7 (balanced creativity)
- TopK: 40 (diverse vocabulary)
- Use case: Best quality for complex study tools

**Gemini 2.5 Flash (Secondary):**
- Context: 1 million tokens
- Output: 65,536 tokens
- Temperature: 0.75 (slightly more creative)
- TopK: 35
- Use case: Faster fallback when Pro is overloaded

**Gemini 2.5 Flash-Lite (Fallback):**
- Context: 1 million tokens
- Output: 65,536 tokens
- Temperature: 0.8 (more creative)
- TopK: 30
- Use case: Last resort when both models fail

### Why Google Gemini?

1. **Huge context window**: Can process entire textbooks
2. **Long output**: Can generate comprehensive study guides
3. **Cost-effective**: Flash models are cheaper for fallback
4. **Reliable**: Multiple models ensure high availability
5. **Quality**: Latest Gemini 2.5 models produce excellent educational content

---

## System Prompts

### What Are System Prompts?

**System prompts** are special instructions given to the AI that tell it exactly how to generate each type of study tool. Think of them as detailed recipes that the AI follows.

### Why They Matter

Each study tool has a **unique purpose** and needs different instructions:
- Study Guide needs structure and depth
- Flashcards need concise answers
- Smart Notes need active learning elements
- Smart Summary needs brevity and significance

### Prompt Engineering Principles

All prompts follow these rules:

1. **No Character Limits**: "Generate comprehensive content without worrying about length"
2. **Extremely Easy to Understand**: Clear, simple language for learners
3. **Unique Value Proposition**: Each tool offers something different
4. **Optimized for Gemini**: Takes advantage of model's strengths

---

### 1. Flashcards Prompt

**Key Instructions:**

```
You are an expert at creating flashcards for rapid learning and memorization.

CRITICAL ANSWER REQUIREMENTS:
- Answers MUST be maximum ONE LINE (60-80 characters)
- Answers MUST be concise (3-8 words ideal)
- NO detailed explanations in answers
- NO multi-sentence answers
- Optimize for memory and rapid review

DIFFICULTY LEVELS:
- Easy: Basic definitions, one-word answers, simple recall
- Medium: Conceptual relationships, formula applications, cause-effect
- Hard: Complex concepts summarized, application scenarios, synthesis

OUTPUT FORMAT: JSON array
[
  {
    "id": "1",
    "question": "What is the Pythagorean theorem?",
    "answer": "a² + b² = c²",
    "difficulty": "medium",
    "topic": "Geometry"
  }
]
```

**Why This Works:**
- Clear constraints prevent long-winded answers
- Difficulty definitions ensure appropriate complexity
- JSON format enables easy parsing and storage
- Focus on memorization not comprehension

**Variable Replacements:**
- `{numberOfCards}`: "Generate 10-20 flashcards (standard)"
- `{difficulty}`: "medium"
- `{customInstructions}`: "Focus on Newton's laws of motion"
- `{documentContent}`: The actual text to create flashcards from

---

### 2. Study Guide Prompt

**Methodology**: "Pyramid of Understanding"

**Structure:**

```
1. EXECUTIVE LEARNING MAP
   - Concept hierarchy visualization
   - Time investment estimates
   - Prerequisites needed

2. FOUNDATION LAYER
   - Core concepts (building blocks)
   - Historical context
   - Essential terminology

3. CONCEPTUAL CONNECTIONS
   - How ideas relate to each other
   - Analogies and mental models
   - System thinking perspectives

4. PRACTICAL APPLICATIONS
   - Real-world examples
   - Problem-solving frameworks
   - Common misconceptions to avoid

5. MASTERY INDICATORS
   - Self-assessment questions
   - Practice problems
   - "You've mastered this when..."

6. RETENTION STRATEGIES
   - Memory techniques
   - Spaced repetition schedule
   - Cognitive shortcuts
```

**Why This Works:**
- Builds knowledge layer by layer (pyramid)
- Combines theory with practice
- Includes metacognitive elements (how to learn)
- Self-assessment enables independent learning

---

### 3. Smart Summary Prompt

**Methodology**: "Significance Hierarchy" (What matters most and why)

**Structure:**

```
1. STRATEGIC OVERVIEW
   - The ultimate takeaway (one sentence)
   - Why this matters (significance)
   - Context and scope

2. CORE INSIGHTS MATRIX
   - Key arguments or findings
   - Patterns and themes
   - Breakthrough concepts

3. KNOWLEDGE ARCHITECTURE
   - How ideas are structured
   - Dependencies and relationships
   - Information hierarchy

4. PRACTICAL IMPLICATIONS
   - Actionable insights
   - Real-world consequences
   - Decision-making impact

5. CRITICAL ANALYSIS
   - Strengths and limitations
   - Assumptions made
   - Alternative perspectives

6. COGNITIVE SHORTCUTS
   - Mental models
   - Memorable analogies
   - Quick reference frameworks

7. FUTURE CONNECTIONS
   - Related domains
   - Emerging trends
   - Questions for further exploration
```

**Why This Works:**
- Focuses on significance not just facts
- Multi-dimensional analysis (what, why, how, so what)
- Critical thinking integrated
- Concise yet comprehensive

---

### 4. Smart Notes Prompt

**Methodology**: "Active Learning Notes" (Understanding over recording)

**Integrated Techniques:**
- Cornell Note-Taking System
- Mind mapping for relationships
- Outline format for hierarchy
- Annotation and commentary

**Structure:**

```
1. INFORMATION ARCHITECTURE
   - Main topics and subtopics (hierarchy)
   - Cross-references between sections
   - Priority markers (core vs supplementary)

2. ACTIVE PROCESSING LAYER
   - Personal insights ("This connects to...")
   - Observations and patterns noticed
   - Questions that arise ("Why does...?")

3. KNOWLEDGE CONSOLIDATION
   - Recurring themes
   - Patterns across topics
   - Contradictions or tensions

4. PRACTICAL INTEGRATION
   - Action items and to-dos
   - Real-world applications
   - Resources for deeper learning

5. CRITICAL THINKING ELEMENTS
   - Assumptions being made
   - Alternative explanations
   - Evidence quality assessment

6. LEARNING OPTIMIZATION
   - Memory aids and mnemonics
   - Review schedule suggestions
   - Difficulty ratings per section

7. FUTURE REFERENCE SYSTEM
   - Quick-access summary points
   - Detailed explanations for review
   - Index of key terms
```

**Why This Works:**
- Not just transcription—includes thinking process
- Multi-layered (facts + insights + questions)
- Optimized for later review
- Combines multiple note-taking methods

---

### Prompt Variable System

**How Variables Work:**

1. **Frontend** collects data:
   - Document/conversation content
   - User's customization options
   - Tool type selected

2. **Backend** loads appropriate prompt template

3. **Variable replacement** happens:
   ```javascript
   prompt = prompt
     .replace('{documentContent}', actualContent)
     .replace('{documentTitle}', 'Physics Chapter 1')
     .replace('{numberOfCards}', '10-20 (standard)')
     .replace('{difficulty}', 'medium')
     .replace('{customInstructions}', 'Focus on formulas')
   ```

4. **Final prompt** sent to AI model

5. **AI generates** content following the instructions

---

## Fallback & Error Handling

### Why We Need Fallback Logic

**The Problem:**
- AI models can be overloaded (too many requests)
- Network can fail
- Rate limits can be hit
- Unexpected errors can occur

**The Solution:**
Multi-layered fallback system ensures high reliability.

---

### The Three-Model Strategy

**Model Hierarchy:**

```
PRIMARY: Gemini 2.5 Pro
    ↓ (if overloaded)
SECONDARY: Gemini 2.5 Flash
    ↓ (if overloaded)
FALLBACK: Gemini 2.5 Flash-Lite
    ↓ (if still fails)
ERROR TO USER
```

**Why This Order:**
1. **Pro**: Best quality but more popular (higher overload risk)
2. **Flash**: Faster and cheaper, nearly same quality
3. **Flash-Lite**: Lightweight, always available

**Special Rule for Overload:**
- When overloaded, **immediately switch** to next model
- Don't retry (overload can last hours)
- Retries waste time and delay user

---

### Retry Strategies by Error Type

**Different errors need different handling:**

| Error Type | Retries | Delays | Strategy |
|------------|---------|--------|----------|
| **Overloaded** | 3 | 15s, 30s, 60s | Switch to next model immediately |
| **Rate Limit** | 2 | 60s, 120s | Wait and retry (temporary) |
| **Internal Error** | 2 | 30s, 45s | Retry with exponential backoff |
| **Timeout** | 2 | 15s, 30s | Retry (may succeed next time) |
| **Network Error** | 2 | 15s, 30s | Retry (connectivity issue) |
| **Default** | 1 | 30s | Single retry |

**Exponential Backoff**: Each retry waits longer than the last.

---

### Content Validation

**After AI generates content, we validate it:**

1. **Length Check**:
   - Minimum: 50 characters (ensures real content)
   - If too short → mark as failed

2. **Completion Check**:
   - Flashcards: JSON must parse successfully
   - Others: Doesn't end with "..." (indicates truncation)
   - Last paragraph > 50 characters

3. **JSON Validation** (Flashcards Only):
   - Must be valid JSON array
   - Each object must have: id, question, answer, difficulty, topic
   - If wrapped in markdown code block → extract JSON

4. **Markdown Cleaning**:
   - Remove AI meta-commentary ("Here's your study guide:")
   - Strip leading "```markdown" and trailing "```"
   - Trim whitespace

---

### Error Display to User

**User-Friendly Error Messages:**

Instead of technical errors like:
```
Error: RESOURCE_EXHAUSTED: Quota exceeded
```

We show:
```
All AI models are currently busy. Please try again in a few minutes.
```

**Error UI Components:**

1. **Error Banner** (Top of Panel):
   - Red background
   - Icon: AlertCircle
   - Clear message
   - **Retry Button**: Attempts generation again
   - **Dismiss Button**: Clears error

2. **Popup Dialog** (For Overload):
   - "All Models Busy" title
   - Friendly explanation
   - Suggestion: "Try again in 2-3 minutes"
   - No scary technical jargon

**Error State Management:**
- Stores last failed generation
- Retry button uses same parameters
- Clears active generation spinner
- Removes placeholder cards

---

### Special Error Handling

**AllModelsOverloadedError:**
- Custom error class
- Thrown when all 3 models fail due to overload
- Special UI treatment (popup not banner)
- Suggests specific wait time
- Preserves user's customization options for retry

**Rollback on Failure:**
- If database save fails after generation
- Removes item from UI immediately
- Prevents ghost entries
- Logs error for debugging

---

## Export Features

### Overview

Users can export any study tool (except flashcards) in two formats:
1. **PDF**: Professional print-ready document
2. **DOCX**: Text file (placeholder for future Word doc support)

### Export Button Location

**In Canvas Header:**
- Dropdown menu with "Download" icon
- Two options: "Export as PDF", "Export as DOCX"
- Appears for all study tools in canvas

---

### PDF Export

**How It Works:**

1. **User Clicks "Export as PDF"**
2. **Frontend** calls `exportAsPDF()` function
3. **Function**:
   - Creates a new browser window
   - Writes HTML with styled content
   - Triggers browser's print dialog
4. **User** prints to PDF (Save as PDF in print dialog)

**HTML Structure:**

```html
<!DOCTYPE html>
<html>
<head>
    <title>Study Guide - Physics Chapter 1</title>
    <style>
        /* Professional CSS styling */
        body { font-family: Inter, sans-serif; }
        h1 { color: #0d9488; } /* Teal accent */
        /* ...more styles */
    </style>
</head>
<body>
    <div class="header">
        <h1>Study Guide</h1>
        <div class="metadata">
            Generated on: January 15, 2025
            Source: Physics Chapter 1
        </div>
    </div>

    <div class="content">
        <!-- Markdown converted to HTML -->
    </div>

    <div class="footer">
        Generated by CognileapAI Study Tools
    </div>
</body>
</html>
```

**Styling Features:**
- **Typography**: Inter font, readable sizes
- **Colors**: Teal accent color (#0d9488) for headings
- **Layout**: Proper margins, justified text, page breaks
- **Print-optimized**: No backgrounds, clean black text
- **Code blocks**: Syntax-highlighted with light background
- **Lists**: Proper indentation and bullets

**Technical Implementation:**
```javascript
const printWindow = window.open('', '_blank')
printWindow.document.write(htmlContent)
printWindow.document.close()
printWindow.focus()
printWindow.print()
```

---

### DOCX Export (Text Format)

**How It Works:**

1. **User Clicks "Export as DOCX"**
2. **Frontend** calls `exportAsDOCX()` function
3. **Function**:
   - Creates text file with .txt extension (for now)
   - Formats content with separators
   - Triggers browser download
4. **User** receives text file

**File Structure:**

```
============================================
Study Guide
============================================

Generated on: January 15, 2025
Source: Physics Chapter 1
Type: Study Guide

--------------------------------------------

[Full markdown content here]

--------------------------------------------
Generated by CognileapAI Study Tools
```

**Technical Implementation:**
```javascript
const blob = new Blob([textContent], { type: 'text/plain' })
const url = URL.createObjectURL(blob)
const link = document.createElement('a')
link.href = url
link.download = 'Study_Guide_Physics_Chapter_1.txt'
link.click()
```

**Future Enhancement:**
- Replace with docx.js library for true .docx files
- Maintain formatting (bold, italic, headers)
- Include images and tables

---

### Copy to Clipboard

**How It Works:**

1. **User Clicks Copy Button** (in canvas header)
2. **Frontend** calls `navigator.clipboard.writeText(content)`
3. **Success Feedback**:
   - Button icon changes from Copy to Check
   - Shows "Copied!" tooltip briefly
   - Reverts after 2 seconds
4. **User** can paste anywhere (Google Docs, email, notes)

**Technical Implementation:**
```javascript
await navigator.clipboard.writeText(content)
setIsCopied(true)
setTimeout(() => setIsCopied(false), 2000)
```

---

### Export Utilities File

**Location**: `src/lib/export-utils.ts`

**Functions:**
- `exportAsPDF(content, title, type)`: PDF export
- `exportAsDOCX(content, title, type)`: Text export
- `createPrintableHTML(content, metadata)`: HTML generation for PDF
- `formatTextContent(content, metadata)`: Text formatting for DOCX

**Reusable**: Can be called from anywhere in the app.

---

## Database & Storage

### Database Schema

**Table**: `outputs`

**Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Unique identifier (primary key) |
| `document_id` | UUID (nullable) | Reference to source document |
| `conversation_id` | UUID (nullable) | Reference to source conversation |
| `section_id` | UUID (nullable) | For future section-specific tools |
| `user_id` | UUID | Owner of this study tool |
| `type` | TEXT | 'study_guide', 'flashcards', 'notes', 'summary' |
| `overall` | BOOLEAN | True for whole-document tools |
| `payload` | JSONB | Flexible storage for content + metadata |
| `created_at` | TIMESTAMP | When it was generated |

**Payload Structure (JSONB):**

```json
{
  "title": "Physics Chapter 1 - Study Guide",
  "content": "# Foundation Layer\n\n...",
  "metadata": {
    "model": "gemini-2.5-pro",
    "generationDuration": 8500,
    "contentLength": 15000,
    "sourceContentLength": 5000,
    "flashcardOptions": {
      "difficulty": "medium",
      "numberOfCards": "standard",
      "customInstructions": "Focus on formulas"
    }
  }
}
```

**Why JSONB:**
- Flexible schema (each tool type can have different fields)
- Can query nested fields
- Efficient storage
- Easy to evolve without migrations

---

### Constraints & Indexes

**Constraints:**

1. **outputs_source_check**:
   - Ensures EITHER `document_id` OR `conversation_id` is present
   - Prevents orphan study tools
   - SQL: `(document_id IS NOT NULL) OR (conversation_id IS NOT NULL)`

2. **outputs_unique_source_type_idx**:
   - Prevents duplicate study tools for same source + type
   - Example: Can't have two study guides for same document
   - Can regenerate (overwrites old one)

**Indexes (for fast queries):**

1. `outputs_conversation_id_idx`: Fast lookup by conversation
2. `outputs_document_type_idx`: Fast lookup by document + type
3. `outputs_conversation_type_idx`: Fast lookup by conversation + type

---

### Row-Level Security (RLS)

**What is RLS:**
Database-level security that ensures users can only access their own data.

**Policies on `outputs` table:**

1. **Users can view their outputs**:
   ```sql
   -- Can read if you own the document OR conversation
   (document_id IN (SELECT id FROM documents WHERE user_id = auth.uid()))
   OR
   (conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid()))
   ```

2. **Users can insert their outputs**:
   ```sql
   -- Can insert if you own the source
   (Same check as above)
   ```

3. **Users can update their outputs**:
   ```sql
   -- Can update if you own it
   (Same check as above)
   ```

4. **Users can delete their outputs**:
   ```sql
   -- Can delete if you own it
   (Same check as above)
   ```

**Why RLS Matters:**
- Prevents users from seeing others' study tools
- No manual permission checks needed in code
- Database enforces security automatically

---

### LocalStorage (Browser Storage)

**Used For**: Flashcard sets (fast access, offline support)

**Key**: `flashcard-store`

**Structure:**
```json
{
  "state": {
    "flashcardSets": [...],
    "isViewerOpen": false,
    "currentFlashcardSet": null,
    "currentSession": null
  },
  "version": 1
}
```

**Features:**
- **Persists** across browser sessions
- **Auto-syncs** with database on changes
- **Deduplication**: Removes duplicates on load
- **Hydration**: Converts JSON strings back to objects
- **Zustand Persist middleware**: Automatic sync

**Why LocalStorage for Flashcards:**
- Instant access (no API call)
- Works offline
- Smooth animations (no loading delay)
- Database is still source of truth

---

### Data Flow Diagram

```
User Action
    ↓
Frontend (Zustand Store)
    ↓
API Request → Backend API Route
    ↓
Authentication (Supabase Auth)
    ↓
Database Query (Supabase PostgreSQL)
    ↓
AI Generation (Google Gemini)
    ↓
Database Save (outputs table)
    ↓
LocalStorage Update (flashcards only)
    ↓
Frontend State Update
    ↓
UI Re-render (Canvas/Viewer)
```

---

## Quick Q&A Reference

### Common Questions You'll Be Asked

**Q: How exactly do flashcards work?**
**A:**
1. User selects flashcard options (card count, difficulty, custom focus)
2. Backend sends document content + options to Google Gemini AI
3. AI generates structured JSON with questions and short answers
4. Saved to database and browser storage
5. Displayed in interactive viewer with flip animations
6. User navigates with keyboard or buttons

---

**Q: How are flashcards stored?**
**A:**
In two places:
1. **Database** (Supabase PostgreSQL) - permanent storage, synced across devices
2. **Browser localStorage** - fast access, works offline, automatically synced

---

**Q: What happens if the AI fails to generate?**
**A:**
Three-level fallback:
1. Tries Gemini 2.5 Pro (best model)
2. If overloaded → tries Gemini 2.5 Flash (faster)
3. If still fails → tries Gemini 2.5 Flash-Lite (always available)
4. Shows friendly error message with retry button

---

**Q: How does the canvas work?**
**A:**
1. Slides in from right side (smooth animation)
2. Displays study tool content in formatted markdown
3. Provides actions: copy, fullscreen, export, close
4. Only one thing open at a time (canvas OR flashcard viewer)
5. Responsive: Adapts width based on panel state

---

**Q: What's special about each study tool?**
**A:**
- **Study Guide**: Deep learning with structured layers (foundation → mastery)
- **Flashcards**: Quick memorization with customizable difficulty
- **Smart Notes**: Active learning with insights and observations
- **Smart Summary**: Concise strategic overview focusing on significance

---

**Q: How do system prompts work?**
**A:**
1. Each tool has a detailed template with instructions for AI
2. Variables get replaced with actual data (content, title, options)
3. AI follows the instructions exactly
4. Produces consistent, high-quality output
5. Optimized for educational content generation

---

**Q: Can you generate study tools from conversations without documents?**
**A:**
Yes! The system supports both:
1. **Document-based**: Generate from uploaded PDFs/documents
2. **Conversation-based**: Generate from chat history alone
3. **Hybrid**: Generate from conversation + linked document

---

**Q: How does export work?**
**A:**
**PDF**: Creates HTML with styling, opens print dialog, user saves as PDF
**DOCX**: Currently exports as formatted text file (future: true Word doc)
**Copy**: Copies markdown to clipboard for pasting anywhere

---

**Q: What prevents users from seeing others' study tools?**
**A:**
Row-Level Security (RLS) in database:
- Every query automatically filtered by user ownership
- Database blocks unauthorized access
- No way to access others' data even with direct API calls

---

**Q: Why use three AI models?**
**A:**
- **Reliability**: If one is busy, others are available
- **Quality**: Pro model is best, Flash is nearly as good
- **Cost**: Flash models cheaper for fallback
- **Speed**: Immediate switching on overload (don't wait)

---

**Q: How is progress tracked during generation?**
**A:**
1. Frontend starts progress at 0%
2. Increments by 5-10% every 2 seconds (estimated)
3. Caps at 90% until actual completion
4. Backend returns when done
5. Frontend jumps to 100% and shows success

---

**Q: What's the difference between canvas and flashcard viewer?**
**A:**
- **Canvas**: For text-based study tools (guides, notes, summaries)
- **Flashcard Viewer**: For interactive Q&A cards with flip animations
- **Mutual exclusion**: Only one open at a time

---

**Q: How do you prevent duplicate study tools?**
**A:**
Database constraint: `outputs_unique_source_type_idx`
- Allows only one study guide per document
- Allows only one set of flashcards per document
- Can regenerate (overwrites old one)

---

**Q: What tech stack does this use?**
**A:**
- **Frontend**: React, Next.js, TypeScript, Tailwind CSS, Framer Motion, Zustand
- **Backend**: Next.js API routes, Node.js
- **Database**: Supabase PostgreSQL with Row-Level Security
- **AI**: Google Gemini 2.5 (Pro, Flash, Flash-Lite)
- **Storage**: Database + Browser LocalStorage

---

## Conclusion

This study tools system combines modern web technologies with advanced AI to create a comprehensive learning platform. Key strengths:

✅ **Reliable**: Multi-model fallback ensures high availability
✅ **User-Friendly**: Smooth animations, clear feedback, intuitive interface
✅ **Secure**: Database-level security with Row-Level Security
✅ **Flexible**: Works with documents or conversations
✅ **Educational**: AI prompts optimized for learning outcomes
✅ **Performant**: LocalStorage caching, lazy loading, efficient state management

The system is production-ready and designed to scale with the user base while maintaining quality and reliability.

---

**Total Explanation Time**: ~12-15 minutes (perfect for your presentation!)

**Quick Tip for Presentation**: Focus on the visual flow (panel → canvas → viewer) and demonstrate one complete generation cycle live. Show the fallback working and emphasize the educational value of each tool type.

Good luck with your presentation! 🚀
