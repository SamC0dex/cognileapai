const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, PageBreak
} = require('docx');
const fs = require('fs');

// ── Palette ─────────────────────────────────────────────────
const C = {
  navy:"0D2F6E",navyLight:"E8EEF8",
  blue:"1558B0",blueLight:"D6E4F7",blueMid:"3B6FCE",
  purple:"5A2FA0",purpleLight:"EDE0FA",
  green:"1A6B3A",greenLight:"D4EDDA",
  orange:"C85A00",orangeLight:"FFF3E0",
  teal:"006D6D",tealLight:"D0EFEF",
  red:"B00020",redLight:"FDEBEE",
  gray:"F2F2F2",grayMid:"E0E0E0",grayDark:"444444",
  white:"FFFFFF",black:"111111",
  gold:"8B6914",goldLight:"FFF8DC",
};

// ── Border / shading helpers ─────────────────────────────────
const bs=(c="BBBBBB",sz=4)=>({style:BorderStyle.SINGLE,size:sz,color:c});
const bn=()=>({style:BorderStyle.NONE,size:0,color:"FFFFFF"});
const ab=(c,sz=4)=>({top:bs(c,sz),bottom:bs(c,sz),left:bs(c,sz),right:bs(c,sz)});
const nb=()=>({top:bn(),bottom:bn(),left:bn(),right:bn()});
const sp=(b=0,a=0)=>({before:b,after:a});

// ── Text helpers ─────────────────────────────────────────────
const run=(t,o={})=>new TextRun({text:t,font:"Calibri",size:22,...o});
const runB=(t,o={})=>run(t,{bold:true,...o});
const runI=(t,o={})=>run(t,{italics:true,...o});
const runC=(t,c,o={})=>run(t,{color:c,...o});
const runM=(t,o={})=>new TextRun({text:t,font:"Courier New",size:20,color:C.purple,...o}); // monospace

// ── Block helpers ────────────────────────────────────────────
const pb=()=>new Paragraph({children:[new PageBreak()]});
const gap=(n=180)=>new Paragraph({children:[run("")],spacing:sp(0,n)});
const body=(t,o={})=>new Paragraph({children:[typeof t==="string"?run(t,o):t],spacing:sp(60,60)});
const bodyM=(parts)=>new Paragraph({children:parts,spacing:sp(60,60)}); // mixed runs

function h1(t,c=C.navy){return new Paragraph({children:[runB(t,{size:44,color:c})],spacing:sp(500,200),border:{bottom:bs(c,8)}});}
function h2(t,c=C.blue){return new Paragraph({children:[runB(t,{size:32,color:c})],spacing:sp(340,140)});}
function h3(t,c=C.black){return new Paragraph({children:[runB(t,{size:26,color:c})],spacing:sp(220,80)});}
function h4(t,c=C.grayDark){return new Paragraph({children:[runB(t,{size:22,color:c})],spacing:sp(160,60)});}

function bul(items,lvl=0){
  const ref=["bullets","bullets2","bullets3"][lvl]||"bullets";
  return items.map(item=>new Paragraph({numbering:{reference:ref,level:0},children:Array.isArray(item)?item:[run(item)],spacing:sp(36,36)}));
}
function num(items){return items.map(item=>new Paragraph({numbering:{reference:"nums",level:0},children:Array.isArray(item)?item:[run(item)],spacing:sp(40,40)}));}

// ── Box helper (single-cell bordered box) ────────────────────
function box(title,lines,fill,tc=C.black,bc="BBBBBB",bold_title=true){
  const ch=[];
  if(title)ch.push(new Paragraph({children:[bold_title?runB(title,{color:tc,size:22}):runI(title,{color:tc,size:22})],spacing:sp(0,80)}));
  for(const l of lines){
    if(typeof l==="string")ch.push(new Paragraph({children:[run(l)],spacing:sp(0,40)}));
    else ch.push(l);
  }
  return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[9360],rows:[new TableRow({children:[new TableCell({borders:ab(bc),width:{size:9360,type:WidthType.DXA},shading:{fill,type:ShadingType.CLEAR},margins:{top:140,bottom:140,left:200,right:200},children:ch})]})]});
}

// ── Flow step helper ─────────────────────────────────────────
function flow(n,title,desc,fill,tc){
  return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[1080,8280],rows:[new TableRow({children:[
    new TableCell({borders:ab("AAAAAA"),width:{size:1080,type:WidthType.DXA},shading:{fill,type:ShadingType.CLEAR},verticalAlign:VerticalAlign.CENTER,margins:{top:100,bottom:100,left:60,right:60},children:[new Paragraph({children:[runB(n,{size:28,color:tc})],alignment:AlignmentType.CENTER})]}),
    new TableCell({borders:ab("AAAAAA"),width:{size:8280,type:WidthType.DXA},shading:{fill:C.white,type:ShadingType.CLEAR},margins:{top:100,bottom:100,left:160,right:160},children:[new Paragraph({children:[runB(title,{color:C.black,size:22})],spacing:sp(0,40)}),new Paragraph({children:[run(desc)],spacing:sp(0,0)})]}),
  ]})],});
}
const arr=()=>new Paragraph({children:[run("          ↓",{size:26,color:C.grayDark,bold:true})],spacing:sp(36,36)});

// ── Q&A helper ───────────────────────────────────────────────
function qa(q,a){
  return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[9360],rows:[
    new TableRow({children:[new TableCell({borders:ab(C.navy),width:{size:9360,type:WidthType.DXA},shading:{fill:C.navyLight,type:ShadingType.CLEAR},margins:{top:100,bottom:0,left:180,right:180},children:[new Paragraph({children:[runB("Q: "+q,{color:C.navy})],spacing:sp(0,60)})]})]}),
    new TableRow({children:[new TableCell({borders:ab(C.navy),width:{size:9360,type:WidthType.DXA},shading:{fill:C.white,type:ShadingType.CLEAR},margins:{top:100,bottom:100,left:180,right:180},children:[new Paragraph({children:[run("A: "+a)],spacing:sp(0,0)})]})]}),
  ]});
}

// ── Column table helper ──────────────────────────────────────
function colTable(cols,rows,colWidths,headerFill=C.navy){
  const totalW=colWidths.reduce((a,b)=>a+b,0);
  const hRow=new TableRow({children:cols.map((c,i)=>new TableCell({borders:ab(headerFill),width:{size:colWidths[i],type:WidthType.DXA},shading:{fill:headerFill,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[new Paragraph({children:[runB(c,{color:C.white})],alignment:AlignmentType.CENTER})]}))});
  const dRows=rows.map((row,ri)=>new TableRow({children:row.map((cell,ci)=>{const isHighlight=ci===row.length-1&&String(cell).startsWith("✓");return new TableCell({borders:ab("BBBBBB"),width:{size:colWidths[ci],type:WidthType.DXA},shading:{fill:isHighlight?C.greenLight:(ri%2===0?C.gray:C.white),type:ShadingType.CLEAR},margins:{top:70,bottom:70,left:120,right:120},children:[new Paragraph({children:[run(cell,{bold:isHighlight})]})]});})}));
  return new Table({width:{size:totalW,type:WidthType.DXA},columnWidths:colWidths,rows:[hRow,...dRows]});
}

// ── Two-col definition table ─────────────────────────────────
function defTable(rows,w1=3200,w2=6160,hf=C.navy){
  const totalW=w1+w2;
  const hRow=new TableRow({children:[
    new TableCell({borders:ab(hf),width:{size:w1,type:WidthType.DXA},shading:{fill:hf,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:140,right:140},children:[new Paragraph({children:[runB("Item",{color:C.white})],alignment:AlignmentType.CENTER})]}),
    new TableCell({borders:ab(hf),width:{size:w2,type:WidthType.DXA},shading:{fill:hf,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:140,right:140},children:[new Paragraph({children:[runB("Detail",{color:C.white})],alignment:AlignmentType.CENTER})]}),
  ]});
  const dRows=rows.map(([l,r],i)=>new TableRow({children:[
    new TableCell({borders:ab("BBBBBB"),width:{size:w1,type:WidthType.DXA},shading:{fill:i%2===0?C.gray:C.white,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:140,right:140},children:[new Paragraph({children:[runB(l,{color:C.black})],spacing:sp(0,0)})]}),
    new TableCell({borders:ab("BBBBBB"),width:{size:w2,type:WidthType.DXA},shading:{fill:C.white,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:140,right:140},children:[new Paragraph({children:[run(r)],spacing:sp(0,0)})]}),
  ]}));
  return new Table({width:{size:totalW,type:WidthType.DXA},columnWidths:[w1,w2],rows:[hRow,...dRows]});
}

// ── Formula box ──────────────────────────────────────────────
function formulaBox(label,formula,explanation){
  return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[9360],rows:[
    new TableRow({children:[new TableCell({borders:ab(C.purple,6),width:{size:9360,type:WidthType.DXA},shading:{fill:C.purpleLight,type:ShadingType.CLEAR},margins:{top:60,bottom:0,left:200,right:200},children:[new Paragraph({children:[runB(label,{color:C.purple,size:20})],spacing:sp(0,40)})]})]}) ,
    new TableRow({children:[new TableCell({borders:ab(C.purple,6),width:{size:9360,type:WidthType.DXA},shading:{fill:"F0E8FC",type:ShadingType.CLEAR},margins:{top:100,bottom:100,left:200,right:200},children:[new Paragraph({children:[new TextRun({text:formula,font:"Courier New",size:24,bold:true,color:C.purple})],alignment:AlignmentType.CENTER,spacing:sp(0,0)})]})]}) ,
    new TableRow({children:[new TableCell({borders:ab(C.purple,6),width:{size:9360,type:WidthType.DXA},shading:{fill:C.white,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:200,right:200},children:[new Paragraph({children:[run(explanation)],spacing:sp(0,0)})]})]}) ,
  ]});
}

// ═══════════════════════════════════════════════════════════════════
// CONTENT
// ═══════════════════════════════════════════════════════════════════

const content=[

  // ── COVER ──────────────────────────────────────────────────────
  new Paragraph({children:[runB("CogniLeapAI",{size:56,color:C.navy})],spacing:sp(1600,200),alignment:AlignmentType.CENTER}),
  new Paragraph({children:[runB("The Mega Presentation Guide",{size:36,color:C.grayDark})],spacing:sp(0,120),alignment:AlignmentType.CENTER}),
  new Paragraph({children:[runB("Architecture · AI · Active Recall · SM-2 · Study Plans · Everything",{size:24,color:C.blue})],spacing:sp(0,400),alignment:AlignmentType.CENTER}),
  new Paragraph({children:[run("Your section: 50–60% of the presentation. This guide covers every system you built — with real implementation detail, the algorithms behind them, the design decisions that matter, and every question a teacher could throw at you.",{size:22,color:C.grayDark})],spacing:sp(0,200),alignment:AlignmentType.CENTER}),
  new Paragraph({children:[runB("Read this fully. Understand the why, not just the what.",{size:24,color:C.navy})],spacing:sp(0,0),alignment:AlignmentType.CENTER}),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 1: Overall Project Architecture"),
  // ════════════════════════════════════════════════════════════════

  h2("What CogniLeapAI Actually Is"),
  body("CogniLeapAI is a full-stack AI-powered learning platform. A student uploads their study material, the system reads it, they generate AI-created study tools from it, and then a spaced-repetition review engine tracks their mastery over time — adapting to how well they are learning."),
  gap(80),
  body("The architecture is a monorepo: the frontend UI, backend API, database schema, and AI integrations all live in one codebase. There is no separate backend server."),

  gap(120),
  h2("The Technology Stack — The Full Picture"),
  gap(60),
  defTable([
    ["Next.js 15.5 (App Router)","The primary framework. Handles routing, rendering (SSR/CSR), and API endpoints — all in one process. No separate Express server needed."],
    ["React 19","UI component library. Builds the interface as a tree of reusable components, each managing its own state."],
    ["TypeScript 5.6","Static type checking across the entire codebase. Prevents type-related bugs at compile time before code runs."],
    ["Supabase","The backend platform: PostgreSQL database, authentication, file storage, and real-time subscriptions."],
    ["Google Gemini (via Kie.ai)","Primary AI model. Used for document chat, study tool generation, and all coaching features. Accessed via OpenAI-compatible API."],
    ["OpenAI SDK","Used as a universal client to call any provider (Gemini, OpenRouter, LaoZhang, Kie.ai) — they all expose an OpenAI-compatible interface."],
    ["Zustand 5","Client-side global state management. Replaces Redux with a much simpler API."],
    ["React Query (TanStack)","Server state management — caching, refetching, and synchronizing data fetched from the backend."],
    ["Tailwind CSS 3.4","Utility-first CSS framework for styling components."],
    ["Framer Motion 11","Animation library for page transitions, card flips, and UI micro-interactions."],
    ["Radix UI","Accessible, unstyled UI primitives (dropdowns, dialogs, tabs)."],
    ["Dexie 4 (IndexedDB)","Local browser database for offline caching of documents and flashcards."],
    ["@xyflow/react","Mind map canvas — nodes, edges, zoom, pan, and interactive layout."],
    ["Zod","Schema validation library for API input validation and TypeScript type inference."],
  ],3400,5960,C.navy),

  gap(200),
  h2("How Next.js App Router Works — This Is Critical to Understand"),
  body("This is not traditional React. Next.js App Router (introduced in v13, we use v15) changed how the entire framework works. Here is what you must know:"),
  gap(80),

  box("File-Based Routing",["The src/app/ directory IS the routing table. Every folder with a page.tsx file becomes a URL:","","  src/app/page.tsx            →  / (homepage)","  src/app/dashboard/page.tsx  →  /dashboard","  src/app/chat/[id]/page.tsx  →  /chat/anything (dynamic route)","  src/app/api/upload/route.ts →  POST /api/upload (API endpoint)","","There is no router configuration file. The file system IS the router."],C.navyLight,C.navy,C.navy),
  gap(80),
  box("Server Components vs Client Components",["In the App Router, components are Server Components by default — they run on the server, never ship JavaScript to the browser, and can directly access the database. Any component that uses useState, useEffect, onClick, or browser APIs must declare 'use client' at the top.","","Our architecture: layouts and page shells are server components (fast initial load). Interactive parts — the review session, chat interface, file upload — are client components wrapped inside."],C.gray,C.black),
  gap(80),
  box("API Routes Live in the Same Codebase",["Files named route.ts inside src/app/api/ are backend API handlers. They run on the server only. The same codebase serves both the frontend HTML/JS and the backend REST API — no separate Express server, no CORS configuration needed for same-origin requests.","","Route handlers export async functions named GET, POST, PUT, DELETE that receive NextRequest and return NextResponse."],C.blueLight,C.blue,C.blue),

  gap(200),
  h2("The Complete Request Lifecycle — How a User Action Becomes a Database Read"),
  body("Understanding this flow is essential for architectural questions:"),
  gap(80),

  flow("1","Browser Action",
    "User clicks a button (e.g., 'Start Review'). React event handler fires. If the action needs server data, a fetch() call goes to one of our API routes.",
    C.blueLight,C.blue),
  arr(),
  flow("2","Next.js Middleware",
    "Before any route handler runs, src/middleware.ts intercepts the request. It checks for a valid Supabase session (reads the auth cookie). If the route is protected and there is no valid session, the user is redirected to /auth/login.",
    C.orangeLight,C.orange),
  arr(),
  flow("3","Route Handler Authenticates",
    "Inside the API route, createClient() creates a Supabase client bound to the current user's session. The handler calls supabase.auth.getUser() to extract the user's ID from the JWT. Every protected route does this — it is the second authentication check.",
    C.gray,C.grayDark),
  arr(),
  flow("4","Database Query (RLS Enforced)",
    "The Supabase client runs a PostgreSQL query. Row Level Security policies — defined at the database level — automatically filter every query to only return rows where user_id matches the authenticated user. No code-level filtering needed.",
    C.greenLight,C.green),
  arr(),
  flow("5","Response Returns",
    "The route handler returns a NextResponse.json() with the data. React Query on the client receives it, caches it, and triggers a component re-render with the new data.",
    C.purpleLight,C.purple),

  gap(200),
  h2("Two Supabase Clients — Why This Is Important"),
  body("This is a subtle but critical design point. We use two different Supabase clients in the codebase:"),
  gap(80),
  colTable(
    ["Client","Created By","Permission Level","When Used"],
    [
      ["createClient() (server)","src/lib/supabase/server.ts","User-scoped — respects RLS","All regular API routes. Queries are automatically filtered to the logged-in user's data."],
      ["createClient(url, SERVICE_ROLE_KEY)","Direct initialization","Service role — bypasses RLS entirely","Background processing tasks (text extraction, usage recording, push notifications). These run without a user session."],
    ],
    [1800,2400,2400,2760],C.navy
  ),
  gap(80),
  body("The SERVICE_ROLE_KEY has admin-level database access. It is never exposed to the browser — only used in server-side code. Using it carelessly could expose all users' data, which is why it is only used in tightly controlled background functions."),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 2: Supabase — The Database, Auth & Storage Layer"),
  // ════════════════════════════════════════════════════════════════

  h2("Why Supabase Instead of a Custom Backend?"),
  body("Supabase is an open-source Backend-as-a-Service built on PostgreSQL. Choosing it gave us:"),
  ...bul([
    "A full PostgreSQL database with REST and real-time APIs — no ORM setup needed",
    "Authentication (email/password, Google OAuth, session management, JWT issuance) — all production-grade, no custom auth code",
    "S3-compatible object storage for uploaded files",
    "Row Level Security — database-level data isolation",
    "Real-time subscriptions — for live updates without WebSocket setup",
    "Admin dashboard for direct database inspection during development",
  ]),

  gap(100),
  h2("The Core Database Tables — ERD Overview"),
  body("These are the key tables and their relationships. Every table with user data has a user_id column and RLS policies protecting it."),
  gap(60),

  colTable(
    ["Table","Purpose","Key Columns"],
    [
      ["auth.users","Supabase-managed user accounts","id (UUID), email, created_at"],
      ["documents","Uploaded study files","id, user_id, title, processing_status, document_content, checksum, actual_tokens, file_type"],
      ["sections","Document subdivisions for chat retrieval","id, document_id, title, content, ord, page_start, page_end"],
      ["study_tools","Generated AI content (flashcards, quizzes, etc.)","id, user_id, document_id, type, content (JSON or markdown), model_used, tokens_used"],
      ["review_cards","Individual spaced repetition cards","id, user_id, document_id, plan_id, source_type, question, answer, ease_factor, interval_days, next_review_at, recall_layer, consecutive_correct, lapse_count"],
      ["review_sessions","Record of each study session","id, user_id, started_at, ended_at, cards_reviewed, cards_correct, cards_incorrect, results (JSON array)"],
      ["agent_study_plans","AI-generated study schedules","id, user_id, title, goal, schedule (JSON), total_days, status, current_day"],
      ["user_streaks","Daily review streak tracking","id, user_id, current_streak, longest_streak, last_review_date, total_cards_reviewed"],
      ["user_ai_preferences","User's chosen AI provider and model","id, user_id, default_provider, default_model"],
      ["user_api_keys","Encrypted user API keys","id, user_id, provider, encrypted_key, is_valid, key_hint"],
      ["usage_records","Token usage and cost per AI call","id, user_id, provider, model, input_tokens, output_tokens, total_cost, source"],
      ["push_subscriptions","Web Push VAPID subscriptions","id, user_id, endpoint, p256dh_key, auth_key"],
      ["notification_preferences","Per-user notification settings and timezone","id, user_id, review_reminders_enabled, timezone, reminder_times"],
      ["conversations","Chat session containers","id, user_id, document_id, title, created_at"],
      ["messages","Individual chat messages","id, conversation_id, role ('user'/'assistant'), content, sequence_number, metadata"],
    ],
    [2400,3200,3760],C.navy
  ),

  gap(200),
  h2("Row Level Security — How It Actually Works"),
  body("RLS is a PostgreSQL feature that attaches access policies to tables. The auth.uid() function returns the authenticated user's ID from the JWT in the current request."),
  gap(60),
  box("Example RLS Policy — documents table",["CREATE POLICY 'Users own their documents'","ON documents","FOR ALL  -- applies to SELECT, INSERT, UPDATE, DELETE","USING (auth.uid() = user_id)","WITH CHECK (auth.uid() = user_id);","","What this means: ANY query to the documents table automatically has an invisible WHERE clause added: WHERE user_id = auth.uid(). The application code never needs to add this filter — the database enforces it. If a developer forgets, the database prevents the mistake."],C.gray,C.black),
  gap(80),
  body("We have RLS policies on: documents, sections, study_tools, review_cards, review_sessions, agent_study_plans, user_streaks, user_ai_preferences, user_api_keys, usage_records, conversations, messages, push_subscriptions, notification_preferences."),
  gap(60),
  body("The service role client bypasses RLS. This is why it is only used in background tasks and admin functions — never in user-facing API routes."),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 3: The AI Provider System"),
  // ════════════════════════════════════════════════════════════════

  h2("The Problem: Multiple Providers, One Interface"),
  body("Different users want different AI providers — some have their own Google API key, others have OpenRouter access, some want to use a specific model. But the application code should not care which provider is being used. This is the problem ai-router.ts and ai-providers.ts solve."),
  gap(80),

  h2("Provider Resolution — ai-router.ts"),
  body("Every AI call goes through resolveAIConfig(userId). This function returns a resolved config describing exactly which provider, model, and API key to use:"),
  gap(60),

  flow("1","Check User's Own Config",
    "Query user_ai_preferences for default_provider and default_model. If the user has configured their own provider, query user_api_keys for the matching encrypted key. Decrypt the key using AES-256-GCM. Return this as the active config.",
    C.greenLight,C.green),
  arr(),
  flow("2","Fallback: Server Kie.ai Key",
    "If the user has no configured provider, or their key is invalid, check the KIE_API_KEY environment variable. Kie.ai is a third-party API gateway to Google Gemini. Return a server-side Kie.ai config with the default model gemini-3-flash.",
    C.blueLight,C.blue),
  arr(),
  flow("3","Fallback: Direct Google Key",
    "If Kie.ai is also unavailable, fall back to GOOGLE_GENERATIVE_AI_API_KEY and use the Gemini provider directly.",
    C.orangeLight,C.orange),
  arr(),
  flow("4","Fail Gracefully",
    "If all keys are unavailable, the route returns a 500 error with a clear message: 'No AI provider configured. Add an API key in Settings.' This prevents cryptic errors.",
    C.gray,C.grayDark),

  gap(120),
  h2("How All Providers Use One OpenAI-Compatible Interface"),
  body("This is an elegant design decision. Rather than writing separate code for Google, OpenRouter, and LaoZhang, we use the OpenAI SDK for everything because:"),
  gap(60),
  box("Why One SDK for All Providers",["OpenAI published their API specification as an open standard. Most AI providers — including Google (via Kie.ai), OpenRouter, and LaoZhang — implemented the same REST API format. They expose the same /chat/completions endpoint with the same request/response shape.","","The OpenAI Node.js SDK lets you change the baseURL to point at any OpenAI-compatible endpoint. So we create one client, change the URL, and the same generateCompletion() function works for all providers:","","  Kie.ai: baseURL = https://api.kie.ai/{model}/v1","  OpenRouter: baseURL = https://openrouter.ai/api/v1","  LaoZhang: baseURL = https://api.laozhang.ai/v1","","Kie.ai has a unique pattern — the model name is part of the base URL itself, not just the request body."],C.blueLight,C.blue,C.blue),

  gap(120),
  h2("API Key Encryption — AES-256-GCM"),
  body("When users save their own API key in Settings, we cannot store it as plain text in the database. If the database were ever compromised, all user API keys would be exposed. We use AES-256-GCM symmetric encryption."),
  gap(80),

  h3("How AES-256-GCM Works"),
  ...bul([
    "AES (Advanced Encryption Standard) is the global standard for symmetric encryption — the same algorithm used by governments and banks.",
    "256 means the key is 256 bits (32 bytes) long. Brute-forcing a 256-bit key is computationally impossible with current technology.",
    "GCM (Galois/Counter Mode) is the operation mode. It provides both encryption (confidentiality) AND authentication (integrity) — if anyone tampers with the ciphertext, decryption fails.",
    "IV (Initialization Vector): A random 96-bit (12 bytes) value generated fresh for each encryption. Even if you encrypt the same key twice, the ciphertext is different. This prevents pattern analysis.",
  ]),
  gap(80),
  box("The Encryption Process",["1. Generate a random 12-byte IV using crypto.getRandomValues()","2. Convert the plaintext API key to bytes using TextEncoder","3. Call crypto.subtle.encrypt() with AES-GCM, the IV, and the encryption key from environment variable API_KEYS_ENCRYPTION_KEY","4. Concatenate IV + ciphertext as hex: '24a3f8...12cd:5f8a3c...' (IV:ciphertext)","5. Store this hex string in the user_api_keys table","","To decrypt:","1. Split on ':' to get IV and ciphertext","2. Call crypto.subtle.decrypt() with the same key and IV","3. Decode the result bytes back to a string","","The encryption key (API_KEYS_ENCRYPTION_KEY) is a 64-character hex string stored in the server environment — never in the database."],C.purpleLight,C.purple,C.purple),

  gap(120),
  h2("Usage Tracking — Token Counting and Cost"),
  body("Every single AI call is recorded to the usage_records table. The recordUsage() function runs fire-and-forget after every AI response:"),
  gap(60),
  ...num([
    "Retrieve the model's pricing from the model registry (input cost per million tokens, output cost per million tokens)",
    "Calculate input cost: (input_tokens / 1,000,000) × input_cost_per_million",
    "Calculate output cost: (output_tokens / 1,000,000) × output_cost_per_million",
    "Insert a row in usage_records with all fields: user_id, provider, model, input_tokens, output_tokens, total_cost, source ('chat' / 'study-tool' / 'active-recall'), source_id",
    "If the insert fails, log the error but do not throw — usage tracking should never break the main feature",
  ]),
  gap(80),
  body("This allows us to see total cost per user, cost per feature, which models are being used most, and whether any user is consuming disproportionate resources."),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 4: The Active Recall System — Architecture"),
  // ════════════════════════════════════════════════════════════════

  h2("What Active Recall Actually Is (The Science)"),
  body("Active recall is a learning technique backed by decades of cognitive science research. Instead of re-reading material (passive), the learner actively tries to retrieve information from memory (active). The struggle of retrieval — even when it is difficult — strengthens the memory trace."),
  gap(80),
  box("The Testing Effect",["Research consistently shows that taking a test on material leads to better long-term retention than re-studying the same material for the same amount of time. This is called 'The Testing Effect' or 'Retrieval Practice Effect'.","","Our platform operationalizes this: instead of reading flashcards, the student actively attempts to recall the answer before revealing it.","","Combined with Spaced Repetition — strategically timing reviews to happen just before memory would fade — this produces dramatically better long-term retention than conventional studying."],C.greenLight,C.green,C.green),

  gap(120),
  h2("The Two Zustand Stores"),
  body("The active recall system has two separate Zustand stores with distinct responsibilities:"),
  gap(60),
  colTable(
    ["Store","File","Responsibility","Persisted?"],
    [
      ["useActiveRecallStore","active-recall-store.ts","Dashboard data: due card counts, stats, mastery by document, nudge messages. Long-lived state.","Yes — localStorage via persist middleware"],
      ["useReviewStore","active-recall-review-store.ts","In-session state: current card, show/hide answer toggle, ratings array, undo stack, timing data. Session-scoped.","No — resets on every session"],
    ],
    [2400,2400,3360,1200],C.navy
  ),

  gap(120),
  h2("The Review Cards Database Schema — Every Column Explained"),
  gap(60),
  defTable([
    ["id","UUID primary key"],
    ["user_id","Owner — RLS enforced"],
    ["document_id","Source document this card's content came from"],
    ["plan_id","If this card belongs to a study plan, the plan's ID (nullable)"],
    ["source_type","'flashcard', 'quiz', or 'mindmap' — which tool created it"],
    ["source_set_id","ID of the originating flashcard set, quiz set, or mind map"],
    ["question","Front of the card — what the student tries to recall"],
    ["answer","Back of the card — the correct answer"],
    ["topic","Subject category for grouping and analytics"],
    ["difficulty","'easy', 'medium', 'hard' — from generation time"],
    ["recall_layer","Integer 1-4: Absorb, Recognize, Retrieve, Mastered"],
    ["ease_factor","SM-2 ease factor. Starts at 2.5. Min 1.3. Adjusts after each rating."],
    ["interval_days","Current interval in days. How long until next review."],
    ["repetitions","Count of consecutive successful reviews (resets to 0 on failure)"],
    ["next_review_at","Timestamp when this card is next due. Queried to find today's due cards."],
    ["last_reviewed_at","When was this card last reviewed"],
    ["total_reviews","Lifetime total review count"],
    ["correct_reviews","Lifetime count of correct (quality >= 3) reviews"],
    ["consecutive_correct","Current streak of consecutive correct answers. Used for layer transitions."],
    ["average_response_time_ms","Running average of how long the student takes to answer. Used in SM-2 adjustment."],
    ["ai_interval_multiplier","AI-computed multiplier applied to intervals. Defaults to 1.0. Adjusted by AI coaching."],
    ["lapse_count","How many times this card has been forgotten after being at Layer 3 or 4"],
  ],3200,6160,C.navy),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 5: The SM-2 Algorithm — Deep Dive"),
  // ════════════════════════════════════════════════════════════════

  h2("History and Context"),
  body("SM-2 (SuperMemo 2) was developed by Polish researcher Piotr Woźniak in 1987. It is one of the most studied and validated learning algorithms in cognitive science. Anki — the most popular flashcard app with millions of users — is built on SM-2. We implement SM-2 in src/lib/sm2.ts as pure functions that work identically on the client and server."),
  gap(80),
  body("The core insight behind SM-2: every person has a natural 'forgetting curve' (Ebbinghaus, 1885) — memory decays exponentially over time. By reviewing a concept just before it would be forgotten, we interrupt the decay and the memory consolidates more strongly. Over multiple repetitions, the interval between reviews grows exponentially."),

  gap(120),
  h2("The Rating Scale — What Each Button Means"),
  gap(60),
  colTable(
    ["Button","Our Label","Quality (0-5)","What It Means"],
    [
      ["Again","Complete blackout","0","No memory of the answer. Card failed."],
      ["Hard","Incorrect but easy in hindsight","2","Could not recall, but answer seemed obvious once seen. Still a failure."],
      ["Good","Correct with hesitation","3","Remembered correctly, but required effort. Success threshold."],
      ["Easy","Perfect recall","5","Immediately and effortlessly recalled. Strong memory."],
    ],
    [1400,2400,1560,3600],C.navy
  ),
  gap(80),
  body("Quality < 3 = failed. Quality >= 3 = passed. This threshold is the core distinction in the algorithm."),

  gap(120),
  h2("The Core SM-2 Formula"),
  gap(60),
  formulaBox(
    "Ease Factor Update (applied after every successful review):",
    "EF' = EF + (0.1 - (5 - q) × (0.08 + (5 - q) × 0.02))",
    "Where: EF = current ease factor, q = quality rating (0-5), EF' = new ease factor. Minimum EF is always 1.3. This formula makes Easy ratings increase EF (longer future intervals), while Good ratings keep it roughly stable, and Hard ratings decrease it."
  ),
  gap(100),
  formulaBox(
    "Interval Progression (after successful reviews):",
    "Rep 1: I₁ = 1 day\nRep 2: I₂ = 6 days\nRep n: Iₙ = Iₙ₋₁ × EF",
    "After the first two fixed intervals, each subsequent interval multiplies the previous interval by the ease factor. An EF of 2.5 means each interval is 2.5× the previous. A card reviewed 5 times: 1d → 6d → 15d → 37d → 93d → ..."
  ),
  gap(100),
  formulaBox(
    "On Failure (quality < 3):",
    "reps = 0   EF = max(1.3, EF - 0.2)   I = 1min (q=0) or 10min (q=2)",
    "A failure resets repetitions to 0 and decreases the ease factor. The card returns within minutes for immediate re-learning."
  ),

  gap(120),
  h2("Our Enhancements to Stock SM-2"),
  body("We did not just implement textbook SM-2. We added two significant enhancements:"),
  gap(80),

  h3("Enhancement 1: Response Time Adjustment"),
  body("Stock SM-2 only looks at the quality rating. Our implementation also considers how long the student took to answer (avgResponseTimeMs):"),
  gap(40),
  colTable(
    ["Response Time","What It Signals","Interval Adjustment"],
    [
      ["< 3000ms (under 3 seconds)","Fast confident recall — the memory is strong","Interval × 1.05 (space out 5% longer)"],
      ["3000ms - 12000ms","Normal deliberate recall — no adjustment","Interval × 1.0 (no change)"],
      ["> 12000ms (over 12 seconds)","Slow, uncertain recall — student was unsure","Interval × 0.9 (schedule 10% sooner)"],
    ],
    [2800,3360,3200],C.navy
  ),
  gap(60),
  body("This matters because a student can press 'Good' on a card they barely remembered, which would normally give the full interval. But if they took 15 seconds to recall it, the response time penalty brings the review back sooner — more accurately reflecting their actual memory strength."),

  gap(100),
  h3("Enhancement 2: AI Multiplier"),
  body("Each review_cards record has an ai_interval_multiplier field (default 1.0). The AI coaching system (via /api/active-recall/adjust-intervals) analyzes per-topic performance and computes a multiplier per topic:"),
  gap(40),
  colTable(
    ["Multiplier Range","When Applied","Effect"],
    [
      ["0.5 – 0.7","Accuracy below 60% on this topic","Review this topic twice as often — student is struggling"],
      ["0.8 – 0.9","Slightly below average","Minor increase in review frequency"],
      ["1.0","Standard performance","Normal SM-2 intervals"],
      ["1.1 – 1.3","Accuracy above 90%","Space out reviews — student has this well"],
      ["1.5 – 2.0","Consistent excellence, improving trend","Dramatically extend intervals — student excels"],
    ],
    [2200,3360,3800],C.navy
  ),
  gap(60),
  body("The final interval after a review is: base_SM2_interval × ai_multiplier × response_time_factor. This makes the system adaptive in a way that stock SM-2 is not."),

  gap(120),
  h2("The previewIntervals Function"),
  body("Before the student presses any button, the UI shows them what interval each button will produce. This is done by calling the SM-2 algorithm four times — once for each possible rating — before any button is pressed:"),
  gap(40),
  box("How the Button Labels Are Generated",["function previewIntervals(card) {","  const again = sm2({ ...card, quality: 0 })   // → { intervalDays: 0.00069 }","  const hard  = sm2({ ...card, quality: 2 })   // → { intervalDays: 0.00694 }","  const good  = sm2({ ...card, quality: 3 })   // → { intervalDays: 1 } (first rep)","  const easy  = sm2({ ...card, quality: 5 })   // → { intervalDays: 1 } (first rep)","  return { again: '<1m', hard: '10m', good: '1d', easy: '1d' }","","The formatInterval() function converts decimal days to human-readable strings:","  < 5 minutes   →  '<1m'","  < 1 hour      →  'Xm' (minutes)","  < 1 day       →  'Xh' (hours)","  < 30 days     →  'Xd' (days)","  < 365 days    →  'Xmo' (months)","  >= 365 days   →  'Xy' (years)"],C.gray,C.black),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 6: The 4-Layer Recall State Machine"),
  // ════════════════════════════════════════════════════════════════

  h2("Why Layers on Top of SM-2?"),
  body("Vanilla SM-2 treats all cards identically from the first review. But there is a meaningful difference between a card you have NEVER seen, a card you can RECOGNIZE when prompted, and a card you can RETRIEVE from memory without any help. These are different stages of memory consolidation."),
  gap(80),
  body("We built a 4-layer system on top of SM-2 that models these stages explicitly. The layer affects the TYPE of question asked in the review UI (recognition vs. retrieval), provides progress visualization, and drives layer-specific coaching messages."),

  gap(80),
  colTable(
    ["Layer","Name","What the Student Can Do","Review Type"],
    [
      ["1","ABSORB","First exposure — never reviewed this card before","Show card, flip, rate. Familiarization."],
      ["2","RECOGNIZE","Can recognize the correct answer when options are shown. Short-term memory.","Quiz mode or hint-assisted. Answer is harder to recall cold."],
      ["3","RETRIEVE","Can recall the answer from scratch, without seeing it first. Active retrieval.","Pure recall. Answer hidden, student types/thinks, then reveals."],
      ["4","MASTERED","Consistent, effortless long-term recall. Deep learning.","Long-interval maintenance reviews. Rare."],
    ],
    [600,1800,3400,3560],C.navy
  ),

  gap(120),
  h2("The Layer Transition State Machine"),
  body("computeLayerTransition() in sm2.ts defines exactly when a card moves between layers. Here is the complete logic:"),
  gap(80),

  new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[1800,2400,2400,2760],rows:[
    new TableRow({children:[
      new TableCell({borders:ab(C.navy),width:{size:1800,type:WidthType.DXA},shading:{fill:C.navy,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[new Paragraph({children:[runB("Current Layer",{color:C.white})],alignment:AlignmentType.CENTER})]}),
      new TableCell({borders:ab(C.navy),width:{size:2400,type:WidthType.DXA},shading:{fill:C.navy,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[new Paragraph({children:[runB("Condition",{color:C.white})],alignment:AlignmentType.CENTER})]}),
      new TableCell({borders:ab(C.navy),width:{size:2400,type:WidthType.DXA},shading:{fill:C.navy,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[new Paragraph({children:[runB("New Layer",{color:C.white})],alignment:AlignmentType.CENTER})]}),
      new TableCell({borders:ab(C.navy),width:{size:2760,type:WidthType.DXA},shading:{fill:C.navy,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[new Paragraph({children:[runB("Reason",{color:C.white})],alignment:AlignmentType.CENTER})]}),
    ]}),
    ...([
      ["ABSORB (1)","Any rating","RECOGNIZE (2)","First exposure always advances. No quality threshold.","F2F2F2"],
      ["RECOGNIZE (2)","quality >= 3 AND consecutive_correct >= 2","RETRIEVE (3)","2+ correct in a row proves recognition is stable.","FFFFFF"],
      ["RECOGNIZE (2)","quality <= 1 (hard fail)","RECOGNIZE (2)","Stay — need more recognition practice.","FFF3E0"],
      ["RECOGNIZE (2)","quality = 2 or 3 but < 2 consecutive","RECOGNIZE (2)","Continue recognition practice.","FFFFFF"],
      ["RETRIEVE (3)","quality >= 3 AND consecutive_correct >= 3","MASTERED (4)","3+ correct in a row proves active retrieval is reliable.","D4EDDA"],
      ["RETRIEVE (3)","quality <= 1 (hard fail)","RECOGNIZE (2)","Retrieval failed — demote back to recognition phase.","FDEBEE"],
      ["RETRIEVE (3)","quality = 2 but not 3 consecutive","RETRIEVE (3)","Continue retrieval practice.","FFFFFF"],
      ["MASTERED (4)","quality <= 1 (hard fail = lapse)","RECOGNIZE (2)","Significant lapse — must re-learn. lapse_count incremented.","FDEBEE"],
      ["MASTERED (4)","quality >= 2","MASTERED (4)","Maintain. SM-2 handles interval scheduling.","D4EDDA"],
    ]).map(([cl,cond,nl,reason,fill])=>new TableRow({children:[
      new TableCell({borders:ab("BBBBBB"),width:{size:1800,type:WidthType.DXA},shading:{fill:C.gray,type:ShadingType.CLEAR},margins:{top:70,bottom:70,left:120,right:120},children:[new Paragraph({children:[runB(cl,{color:C.black})]})] }),
      new TableCell({borders:ab("BBBBBB"),width:{size:2400,type:WidthType.DXA},shading:{fill,type:ShadingType.CLEAR},margins:{top:70,bottom:70,left:120,right:120},children:[new Paragraph({children:[run(cond)]})] }),
      new TableCell({borders:ab("BBBBBB"),width:{size:2400,type:WidthType.DXA},shading:{fill,type:ShadingType.CLEAR},margins:{top:70,bottom:70,left:120,right:120},children:[new Paragraph({children:[runB(nl,{color:C.navy})]})] }),
      new TableCell({borders:ab("BBBBBB"),width:{size:2760,type:WidthType.DXA},shading:{fill,type:ShadingType.CLEAR},margins:{top:70,bottom:70,left:120,right:120},children:[new Paragraph({children:[run(reason)]})] }),
    ]})),
  ]}),

  gap(120),
  h2("The Lapse Count — Tracking Long-Term Memory Failures"),
  body("Every time a card drops from Layer 3 or 4 back to Layer 2 (a lapse), the lapse_count field is incremented. This is used by:"),
  ...bul([
    "The AI coaching system — cards with high lapse counts are flagged as weak areas and get recommended for additional review",
    "The interval adjustment system — topics with many lapses get a lower ai_interval_multiplier, scheduling more frequent reviews",
    "The predictive analytics — high lapse counts reduce the exam readiness score",
  ]),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 7: The AI Coaching System"),
  // ════════════════════════════════════════════════════════════════

  h2("Overview — What AI Coaching Actually Means"),
  body("Beyond generating study tools and scheduling reviews, we have a layer of AI-powered intelligence that personalizes the learning experience. There are 5 distinct AI coaching features:"),
  gap(60),
  colTable(
    ["Feature","API Route","Triggered When","AI Input","Output"],
    [
      ["AI Nudge","POST /api/active-recall/ai-nudge","Dashboard loads (cached 1 hour)","Due count, streak, accuracy, weak/strong topics, exam dates","2-3 sentence personalized motivational message"],
      ["Weekly Report","POST /api/active-recall/weekly-report","End of week / manual trigger","Cards reviewed, accuracy, topics studied, layer promotions/demotions","Structured markdown report: highlights, improvements, next week's focus"],
      ["AI Interval Adjustment","POST /api/active-recall/adjust-intervals","After sessions / scheduled","Per-topic accuracy, response times, review counts, trend direction","JSON array of {topic, multiplier, reasoning} — stored as ai_interval_multiplier"],
      ["AI Chat Sidebar","POST /api/active-recall/ai-chat","Real-time user message","Full learning context: all stats + conversation history","Conversational coaching response — 'What should I study?', exam readiness, weak topic analysis"],
      ["Plan Adaptation","POST /api/active-recall/agent/adapt-plan","User requests plan change or performance triggers it","Current plan, performance data, user's request","Updated schedule JSON replacing the existing plan"],
    ],
    [1800,2400,1800,2800,2560],C.navy
  ),

  gap(120),
  h2("The AI Nudge — Personalized Motivation"),
  body("When the dashboard loads, if no nudge has been generated in the last hour (cached in Zustand), the system calls the nudge API. Here is what the AI receives:"),
  gap(60),
  box("Nudge Context Data Sent to AI",["- Cards due for review: 12 (3 overdue)","- Current streak: 7 days (longest: 15)","- Last study session: 2025-06-27 (85% accuracy)","- Weak topics needing work: Newton's Laws, Thermodynamics","- Strong topics: Electrostatics, Optics","- Progress: 47/120 cards mastered","- Upcoming exam: Physics Final in 8 days","","The AI system prompt instructs it: 'Be specific — reference actual topics and stats. Be warm like a friend. If they have an exam, add urgency. No emojis. Vary your openings.'","","Result: 'Seven days straight — that's real consistency. With your Physics Final eight days out and Newton's Laws still below 70%, those three overdue cards are worth clearing today before you lose the streak.' "],C.navyLight,C.navy,C.navy),

  gap(120),
  h2("AI Interval Adjustment — Adaptive Scheduling"),
  body("This is the most technically sophisticated coaching feature. After reviewing sessions, the system analyzes per-topic performance and calls the AI to compute topic-level multipliers:"),
  gap(60),
  box("Input Sent to AI (per topic)",["- Electrostatics: accuracy=92%, avgResponseTime=2100ms, reviews=24, trend=stable","- Newton's Laws: accuracy=54%, avgResponseTime=11200ms, reviews=18, trend=declining","- Thermodynamics: accuracy=71%, avgResponseTime=6800ms, reviews=12, trend=improving","","AI system prompt instructs the algorithm:","  accuracy < 60% → multiplier 0.5-0.7 (review more often)","  accuracy > 90% → multiplier 1.1-1.5 (space out further)","  slow response AND declining → decrease even if accuracy seems ok","","AI returns: [{topic:'Newton Laws',multiplier:0.6,reasoning:'54% accuracy with 11s avg response suggests guessing'},{topic:'Electrostatics',multiplier:1.3,reasoning:'92% accurate in under 3s — strong long-term retention'},{topic:'Thermodynamics',multiplier:1.0,reasoning:'Improving trend warrants standard intervals'}]","","These multipliers are written to review_cards.ai_interval_multiplier for all cards in each topic."],C.greenLight,C.green,C.green),

  gap(120),
  h2("The AI Chat Sidebar — Real-Time Study Coach"),
  body("Students can have a real conversation with an AI coach that knows their exact learning data. The buildAIChatSystemPrompt() function injects their entire learning profile into the system prompt:"),
  gap(60),
  ...bul([
    "Total cards, due now, overdue count",
    "Overall mastery percentage",
    "Current streak and longest streak",
    "Recent session accuracy",
    "Weak topics (below 70% accuracy) and strong topics",
    "Upcoming exam dates and estimated readiness percentages",
    "Summary of the last session",
  ]),
  gap(60),
  body("The AI is then able to answer questions like 'Am I ready for my physics exam?', 'What should I study today?', 'Why do I keep forgetting Newton's Laws?', 'Can you make me a study plan for this weekend?' — all with specific, data-driven answers rather than generic advice."),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 8: The Study Plan Agent"),
  // ════════════════════════════════════════════════════════════════

  h2("What a Study Plan Is"),
  body("Students can ask the AI to generate a personalized multi-day study plan based on their uploaded documents, their goals, how much time they have per day, and their current knowledge level. The plan consists of a JSON schedule with daily activities."),
  gap(80),

  h2("Plan Creation — What the AI Receives"),
  body("The create-plan route builds a rich context object and sends it to the AI. Here is what goes into the prompt:"),
  gap(60),
  defTable([
    ["Goal","What the student is trying to achieve: exam_prep, deep_understanding, review, or custom"],
    ["Prior knowledge","How familiar they are with the material: new, some_exposure, or refreshing"],
    ["Daily time budget","How many minutes they can study per day (e.g., 45 minutes)"],
    ["Total days","How many days until their exam or goal"],
    ["Intensity preference","light, standard, or intensive — affects how many activities per day"],
    ["Document context","For each document: title, page count, file size, estimated difficulty (easy/medium/hard based on actual_tokens), section titles extracted from the database"],
  ],3000,6360,C.navy),

  gap(80),
  h3("Activity Types in a Plan"),
  colTable(
    ["Activity Type","Default Duration","Scheduler Bucket","Purpose"],
    [
      ["study_guide","25 min","learn","Structured walkthrough of new material"],
      ["summary","15 min","learn","Quick overview before practice"],
      ["smart_notes","20 min","learn","Organized note-taking from material"],
      ["mindmap","20 min","practice","Visual concept relationship mapping"],
      ["flashcards","15 min","practice","Active recall practice"],
      ["quiz","20 min","practice","Self-testing with scored questions"],
      ["review_due_cards","15 min","remember","SM-2 scheduled cards due today"],
    ],
    [1800,1800,2000,3760],C.navy
  ),
  gap(80),
  body("The 'remember' bucket (review_due_cards) has the highest scheduler weight (0.95) because failing to review due cards disrupts the SM-2 schedule and damages retention. The AI is instructed to always include review_due_cards activities if there are overdue cards."),

  gap(120),
  h2("Plan Adaptation — How Plans Update Based on Performance"),
  body("A plan is not static. The adapt-plan route can update the remaining schedule based on performance evidence:"),
  gap(60),
  ...num([
    "The student's current performance data is fetched: session accuracy, layer transition rates, overdue cards",
    "The current plan's remaining days are extracted",
    "The AI receives: current schedule, performance data, and (optionally) the student's adaptation request ('I need more quiz practice', 'I only have 20 minutes today')",
    "The AI outputs a new schedule JSON for the remaining days",
    "The enrichAdaptedSchedule() function post-processes the AI output: assigns scheduler buckets, sets scheduler weights, adds expectedOutcome descriptions",
    "The agent_study_plans record is updated with the new schedule",
  ]),
  gap(80),
  body("The schedulerBucket function categorizes each activity: review_due_cards → 'remember', flashcards/quiz → 'practice', everything else → 'learn'. This categorization drives the daily plan UI which groups activities by learning mode."),

  gap(120),
  h2("Calendar Day Calculation"),
  body("Plans are date-based, not just numbered. The getCalendarPlanDay() function computes which day of the plan today is, using the plan's created_at timestamp. This handles weekends, gaps in study, and plans that started days ago. The today route tries three matching strategies in order:"),
  ...num([
    "Exact date match — find a schedule entry where date = today's ISO date",
    "Day number match — find an entry where day = computed current day number",
    "Index fallback — use schedule[currentDay - 1] if both fail",
  ]),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 9: The Review Session — Complete Backend Flow"),
  // ════════════════════════════════════════════════════════════════

  h2("What POST /api/active-recall/review Does"),
  body("This is the most called route in the entire application — it fires every single time a student rates a card. Here is the complete sequence:"),
  gap(80),

  flow("1","Authenticate and Parse",
    "Verify session. Extract: cardId, rating (0-5), responseTimeMs, sessionId. Also accepts an 'undo' flag with previousState for undo operations.",
    C.blueLight,C.blue),
  arr(),
  flow("2","Fetch Current Card State",
    "Query review_cards for the card's current ease_factor, interval_days, repetitions, recall_layer, consecutive_correct, total_reviews, average_response_time_ms, ai_interval_multiplier, difficulty.",
    C.gray,C.grayDark),
  arr(),
  flow("3","Run SM-2 Algorithm",
    "Call sm2({quality:rating, repetitions, easeFactor, intervalDays, aiMultiplier, avgResponseTimeMs, difficulty}). Receive new ease_factor, interval_days, repetitions, nextReviewAt.",
    C.purpleLight,C.purple),
  arr(),
  flow("4","Compute Layer Transition",
    "new consecutive_correct = (rating >= 3) ? current + 1 : 0. Call computeLayerTransition(current_layer, rating, new_consecutive_correct). Detect if this is a lapse (new_layer < current_layer).",
    C.orangeLight,C.orange),
  arr(),
  flow("5","Update Running Average Response Time",
    "newAvgResponseTime = (prevAvg × total_reviews + responseTimeMs) / (total_reviews + 1). This incremental average is stored and used as avgResponseTimeMs in future SM-2 calls.",
    C.greenLight,C.green),
  arr(),
  flow("6","Write Updated Card to Database",
    "UPDATE review_cards: ease_factor, interval_days, repetitions, next_review_at, recall_layer, total_reviews, correct_reviews, consecutive_correct, average_response_time_ms, lapse_count (if lapse).",
    C.blueLight,C.blue),
  arr(),
  flow("7","Update Session Record",
    "Append result to review_sessions.results JSON array. Increment cards_reviewed, cards_correct or cards_incorrect.",
    C.gray,C.grayDark),
  arr(),
  flow("8","Update Daily Streak",
    "Fetch user's timezone from notification_preferences. Compute today's date in their local timezone. If last_review_date != today, increment streak. If the gap is > 1 day, reset streak to 1.",
    C.greenLight,C.green),
  arr(),
  flow("9","Return Response",
    "Return: updatedCard (full card state), newInterval (human-readable string like '6d'), layerChange ({from, to} if layer changed, null if not).",
    C.purpleLight,C.purple),

  gap(100),
  h2("The Undo System"),
  body("If undo=true is in the request, the entire flow reverses:"),
  ...bul([
    "previousState contains all the card's values BEFORE the rating was applied",
    "UPDATE review_cards with previousState values — restoring ease_factor, interval_days, repetitions, recall_layer, etc.",
    "REMOVE the last matching result from review_sessions.results",
    "Decrement cards_reviewed and the appropriate correct/incorrect counter",
    "Decrement total_cards_reviewed in user_streaks",
    "Return the restored card state",
  ]),
  gap(60),
  body("The Zustand review store maintains an undoStack array (capped at 10 entries). Each entry contains the card and its state before the rating. The UI shows 'Undo' as active if undoStack.length > 0."),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 10: Technical Decisions — The Why Behind Each Choice"),
  // ════════════════════════════════════════════════════════════════

  h2("Why Next.js Instead of Separate Frontend + Backend?"),
  body("We could have built a React SPA frontend + separate Express.js API server. Instead, we chose Next.js full-stack because:"),
  ...bul([
    "No CORS configuration — frontend and API are same origin",
    "Shared TypeScript types — the same type definitions work in both API routes and UI components",
    "Simpler deployment — one Vercel project instead of two separate services",
    "API routes can import utility functions directly — no HTTP round-trips between services for internal operations",
    "Server Components in the App Router can fetch data without client-side API calls at all",
  ]),

  gap(100),
  h2("Why Zustand Over Redux?"),
  body("Redux is the traditional state management library for React, but it comes with significant boilerplate: action types, action creators, reducers, store configuration, mapStateToProps. Zustand achieves the same result with a fraction of the code:"),
  gap(60),
  colTable(
    ["Aspect","Redux","Zustand"],
    [
      ["Lines of code for a simple store","50-100 lines","5-10 lines"],
      ["Learning curve","Steep — many concepts","Minimal — just JavaScript"],
      ["DevTools support","Excellent","Good (via middleware)"],
      ["Performance","Good","Excellent (fine-grained subscriptions)"],
      ["Persist to localStorage","Separate library","Built-in middleware"],
      ["Use outside React","Complicated","Works anywhere"],
    ],
    [2800,3280,3280],C.navy
  ),

  gap(100),
  h2("Why Fire-and-Forget for Background Processing?"),
  body("The document upload route returns immediately after queuing background text extraction. This is called the fire-and-forget pattern. The alternative — making the user wait for text extraction — would create a poor experience:"),
  ...bul([
    "Text extraction for a 100-page PDF can take 5-15 seconds",
    "Users would see a loading spinner for 15 seconds before seeing their document",
    "If extraction failed, the upload would appear to fail even though the file is safely stored",
    "On Vercel (serverless), long-running synchronous responses risk hitting timeout limits",
  ]),
  gap(60),
  body("Instead: store the file, return success immediately, update the database asynchronously. The UI polls /api/documents/[id]/status every 3 seconds until status = 'completed'. The user sees the document appear instantly and a processing indicator until it is ready."),

  gap(100),
  h2("Why Two Separate Supabase Clients?"),
  body("The user-scoped client (createClient from server.ts) reads the session from cookies/headers and enforces RLS — all queries are automatically filtered to the logged-in user. The service role client has admin privileges and bypasses RLS."),
  gap(60),
  body("Service role is ONLY used where a specific user session does not make sense: background text extraction (runs without a request context), writing usage records (which must succeed even if the user session expired), sending push notifications (proactive, not user-triggered). Using service role in a regular API route would be a security vulnerability — it would return data for all users if the WHERE clause were accidentally omitted."),

  gap(100),
  h2("Why AES-256-GCM Specifically?"),
  ...bul([
    "AES is FIPS 140-2 certified — the US government standard for encryption. If it is good enough for classified data, it is appropriate for API keys.",
    "256-bit key length: 2^256 possible keys. Even with all computing power on Earth, brute-forcing this would take longer than the age of the universe.",
    "GCM mode provides authenticated encryption — it not only hides the data but also detects tampering. If anyone modifies the ciphertext in the database, decryption fails with an error rather than returning corrupted data.",
    "We use the Web Crypto API (crypto.subtle) which is built into Node.js and the browser — no third-party crypto library needed, reducing supply chain attack surface.",
  ]),

  gap(100),
  h2("Why the AI Multiplier Is Per-Topic, Not Per-Card?"),
  body("Individual card performance is already handled by the core SM-2 ease_factor. But SM-2 does not understand that 'Newton's Laws' as a subject might be consistently harder for this student than 'Optics'. Topic-level analysis lets us identify subject-level weaknesses that span multiple cards."),
  gap(60),
  body("The AI analyzes all cards in a topic together (avg accuracy, avg response time, trend direction) and applies a uniform multiplier to all of them. This complements SM-2's per-card adaptation with subject-level adaptation."),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 11: The Full API Surface — Every Route You Own"),
  // ════════════════════════════════════════════════════════════════

  h2("Active Recall API Routes"),
  colTable(
    ["Route","Method","Purpose"],
    [
      ["/api/active-recall/due-cards","GET","Returns all cards where next_review_at <= now(). Sorted by due date. Optional document_id filter."],
      ["/api/active-recall/review","POST","Process a card rating: runs SM-2, updates layer, updates session, updates streak. Also handles undo."],
      ["/api/active-recall/sync","POST","Receives flashcard/quiz/mindmap payloads and creates review_cards records from them."],
      ["/api/active-recall/sessions","GET/POST","List past sessions or create a new session record."],
      ["/api/active-recall/stats","GET","Returns aggregated stats: cards per layer, accuracy, streak, mastery by document."],
      ["/api/active-recall/ai-nudge","POST","Generates personalized motivational message using AI coaching context."],
      ["/api/active-recall/ai-chat","POST","Real-time AI coach chat with full learning context injected."],
      ["/api/active-recall/adjust-intervals","POST","AI analyzes per-topic performance and writes multipliers to cards."],
      ["/api/active-recall/weekly-report","POST","AI generates structured markdown weekly learning report."],
      ["/api/active-recall/analyze-session","POST","Post-session AI analysis: what went well, what to focus on next."],
      ["/api/active-recall/session-feedback","POST","Generates end-of-session feedback based on session results."],
      ["/api/active-recall/readiness","GET","Computes exam readiness percentage from layer distribution and performance trend."],
      ["/api/active-recall/predictive-analytics","GET","Forecasts performance trends and optimal review dates."],
      ["/api/active-recall/performance","GET","Per-topic performance breakdown: accuracy, response times, layer distribution."],
      ["/api/active-recall/exam-dates","GET/POST","CRUD for upcoming exam dates — used to add urgency to coaching messages."],
      ["/api/active-recall/agent/create-plan","POST","AI generates a multi-day study plan from document context + user preferences."],
      ["/api/active-recall/agent/plans","GET/POST","List all study plans or create new plan."],
      ["/api/active-recall/agent/plans/[id]","GET/PUT/DELETE","Get, update, or delete a specific plan."],
      ["/api/active-recall/agent/adapt-plan","POST","AI adapts the remaining schedule based on performance or user request."],
      ["/api/active-recall/agent/today","GET","Returns today's plan activities and due card counts."],
      ["/api/active-recall/agent/discover-tools","POST","Suggests which study tools to generate next based on what exists."],
      ["/api/active-recall/agent/sync-mindmap","POST","Syncs a mind map's nodes into review cards."],
    ],
    [3600,1000,4760],C.navy
  ),

  pb(),

  // ════════════════════════════════════════════════════════════════
  h1("PART 12: Questions Your Teacher Will Ask (You)"),
  // ════════════════════════════════════════════════════════════════

  gap(80),

  qa("Explain the overall architecture of your system.",
    "CogniLeapAI is built as a Next.js 15 monorepo using the App Router. This means the same codebase handles both the React frontend and the backend API — there is no separate server. The file system defines routing: page.tsx files become UI pages, route.ts files become API endpoints. The database is PostgreSQL via Supabase, which also handles authentication and file storage. All AI calls go through a routing layer that checks user-configured API keys first, falls back to server-side Kie.ai keys, then direct Google Gemini keys. Client-side state uses Zustand, server state uses React Query. Every user-facing data table has Row Level Security enforced at the database level."),
  gap(120),

  qa("Explain the SM-2 algorithm and what makes your implementation different from standard Anki.",
    "SM-2, developed by Piotr Woźniak in 1987, is a spaced repetition algorithm that schedules reviews to occur just before a memory would fade. After each review, we compute a new ease factor using the formula EF' = EF + (0.1 - (5-q)(0.08 + (5-q)×0.02)), where q is the quality rating from 0-5. Successful reviews schedule the next review at interval × ease_factor days. Failures reset the interval to minutes and decrease the ease factor. Our implementation extends this in two ways: first, response time adjustment — if the student takes over 12 seconds, the interval is shortened by 10% even if they got it right, because slowness indicates uncertainty. Second, an AI multiplier per topic — the system analyzes per-topic accuracy trends and applies a 0.5-2.0 multiplier to all intervals for that topic. A struggling topic gets multiplier 0.5 (reviewed twice as often). An excellent topic gets 1.5 (significantly spaced out)."),
  gap(120),

  qa("What is Row Level Security and why is it better than filtering in application code?",
    "Row Level Security is a PostgreSQL feature that defines access policies at the database row level, independent of application code. We define a policy like: CREATE POLICY 'own data only' ON documents USING (auth.uid() = user_id). With this policy, every query to the documents table automatically has WHERE user_id = [current user ID] added by the database engine itself — before the query runs, regardless of what the application code says. This is better than filtering in application code because: (1) it is impossible to bypass by accident — a developer who forgets to add a WHERE clause still gets only their own data, (2) it works even if multiple different API routes query the same table — you do not need to remember to filter in every single place, (3) it provides defense in depth — even if a security bug existed in application code, the database layer prevents cross-user data exposure."),
  gap(120),

  qa("How do you handle AI provider failures and what is your fallback strategy?",
    "For study tool generation specifically, we have a multi-model fallback with error-specific retry strategies. We try models in priority order: gemini-3-flash → gemini-2.5-flash → gemini-2.5-pro. Each model gets multiple retry attempts. Overloaded errors get 3 retries with 15s/30s/60s delays (progressive backoff — give the server time to recover). Rate limit errors wait 60-120 seconds. Timeout errors retry faster at 15-30 seconds. For AI chat and coaching features, we use the ai-router.ts resolution chain: user's own configured API key → server Kie.ai key → direct Google key. This ensures the platform works for all users regardless of whether they have their own API key, and the fallback chain means the app continues working even if one provider has an outage."),
  gap(120),

  qa("Walk me through exactly what happens when a student rates a flashcard 'Hard'.",
    "The student has been shown a card, flipped it to see the answer, and presses Hard. In the Zustand review store: the rating is recorded, cardRevealedAt is captured for response time measurement, the undo stack entry is created with the current card state. A POST request fires to /api/active-recall/review with cardId, rating=2, responseTimeMs, sessionId. The route: authenticates the user, fetches the current card state from review_cards, runs sm2({quality:2, repetitions:current, easeFactor:current, intervalDays:current, aiMultiplier:stored, avgResponseTimeMs:stored}). With quality=2, reps resets to 0, EF decreases by 0.2, interval is set to ~10 minutes. Then computeLayerTransition runs: if quality=2 (a failure) and the card was in RECOGNIZE layer, it stays in RECOGNIZE. If it was in RETRIEVE layer, it drops to RECOGNIZE. newConsecutiveCorrect = 0. The card is updated in the database with all new values. The session results array is appended. The user's streak is updated. The response includes the new interval ('10m') and whether the layer changed."),
  gap(120),

  qa("How does the 4-layer system relate to the SM-2 algorithm? Are they separate systems?",
    "They are complementary. SM-2 handles the temporal scheduling — WHEN to review a card next. The 4-layer system handles the qualitative progression — HOW the student is expected to engage with the card. They run simultaneously on every review. SM-2 computes the next_review_at timestamp. computeLayerTransition reads the same rating and consecutive_correct count to decide the recall_layer. These are stored as separate fields on review_cards and updated in the same database write. The layer affects what type of question is presented in the UI: Layer 2 cards might show multiple choice options to test recognition, while Layer 3 cards require pure unaided recall. Layer 4 cards enter long-interval SM-2 scheduling — they might not appear for months, relying on the ease_factor which is now high due to many correct reviews."),
  gap(120),

  qa("Why did you encrypt user API keys and how does the encryption work?",
    "User API keys are credentials with significant value — an exposed Gemini API key could incur costs on the user's account. Storing them as plain text in a database is a serious security risk. We use AES-256-GCM symmetric encryption from the Web Crypto API built into Node.js. The process: generate a random 12-byte IV (initialization vector) per encryption, convert the plaintext key to bytes, call crypto.subtle.encrypt with AES-GCM. Store the result as 'iv_hex:ciphertext_hex' in the user_api_keys table. The server holds the 64-character encryption key in the API_KEYS_ENCRYPTION_KEY environment variable — never in the database. AES-256 has a 2^256 key space, making brute force computationally impossible. GCM mode also provides authentication — if the ciphertext is tampered with, decryption fails rather than returning garbage. Decryption only happens server-side immediately before making an AI API call."),
  gap(120),

  qa("How does the study plan agent work and what makes a plan adaptive?",
    "Plan creation: the user specifies their goal (exam prep / understanding / review), prior knowledge level, daily time budget, and exam date. The system fetches context for each of their documents: title, page count, file size, actual token count, inferred difficulty, section titles. This context plus user preferences is sent to the AI, which generates a day-by-day schedule as a JSON array. Each day has a date, activities array with type/duration/priority, and a topic focus. After creation, plans adapt in two ways: manually (user says 'I only have 20 minutes today') or automatically (performance triggers it). The adapt-plan route sends the current schedule, the student's recent performance data, and any explicit user request to the AI. The AI outputs a new schedule for remaining days. The enrichAdaptedSchedule function post-processes this output: assigning scheduler buckets (learn/practice/remember), scheduler weights (review_due_cards gets 0.95 — highest priority), expected outcomes, and reschedule reasons for each activity."),
  gap(120),

  qa("What technical challenges did you face and how did you solve them?",
    "Three significant ones. First: AI reliability — AI APIs can be overloaded, rate-limited, or return incomplete JSON. We built a multi-model fallback with error-type-specific retry strategies and content completeness validation that checks whether the JSON actually closes properly before accepting it. Second: user privacy across a shared database — with thousands of users in the same database tables, we needed guarantees that queries would never cross user boundaries. RLS solved this at the database level, and the dual-client architecture ensures background tasks use the service role appropriately. Third: the async processing problem — text extraction for large PDFs takes 15+ seconds. Making users wait would kill the UX. We implemented fire-and-forget background processing: store the file, return immediately, extract text asynchronously, and let the UI poll for completion. This required careful error handling to ensure that even if extraction fails, the document record is updated gracefully."),

  gap(200),
  h1("PART 13: Your Presentation Script"),
  gap(80),

  box("What to Say — Your Full Opening",["\"I handled the technical core of the platform — the architecture, the AI systems, and the active recall engine that sits at the center of everything.","","Let me start with the overall architecture. CogniLeapAI is built on Next.js with the App Router, which lets us run both the frontend interface and the backend API from a single codebase. The database is PostgreSQL via Supabase — which also handles authentication, file storage, and data security through a feature called Row Level Security. Every single table that stores user data has a policy that makes it physically impossible for one user's data to leak to another, even if there is a bug in the application code.","","The AI system works through a provider router. Rather than being locked to one AI company, the platform checks whether the student has configured their own API key. If not, it falls back to a server-side key. This means advanced users can use their own quotas, while regular users get the platform's default AI without any setup. User API keys are encrypted using AES-256-GCM before being stored — the same encryption standard used by banks and governments.\""],C.navyLight,C.navy,C.navy),
  gap(80),
  box("Transitioning to Active Recall",["\"The most technically interesting part of the system is the active recall engine. It is built around two things: the SM-2 spaced repetition algorithm, and a 4-layer memory model we built on top of it.","","SM-2 is the same algorithm that powers Anki — the most popular flashcard app in the world. It works by scheduling each card at exponentially growing intervals based on how well the student remembers it. But we did not stop there. We added two enhancements that make our implementation adaptive in ways Anki is not.","","First: response time adjustment. If a student takes 12 seconds to remember something and then clicks 'Good', the system treats that differently than a student who remembered in 2 seconds. The slow response signals uncertainty, so the next interval is shortened by 10% even though the answer was technically correct.","","Second: AI-computed topic multipliers. After a series of sessions, our AI coaching system analyzes per-topic accuracy trends. If a student consistently struggles with Newton's Laws across multiple cards, the AI assigns a 0.5 multiplier to all those cards — scheduling them twice as often until performance improves.\""],C.greenLight,C.green,C.green),
  gap(80),
  box("The 4-Layer System and AI Coaching",["\"On top of SM-2, we built a 4-layer recall state machine. Cards start at Layer 1: Absorb — first exposure. After recognizing them correctly twice in a row, they advance to Layer 2: Recognize. After retrieving them correctly three times in a row, they advance to Layer 3: Retrieve — this is genuine active recall without any hints. After consistent retrieval performance, they reach Layer 4: Mastered and enter long-interval maintenance scheduling.","","If a student forgets something they previously mastered, the card lapses back to Layer 2 and the lapse count is recorded. High lapse counts feed back into the AI coaching system as signals of genuinely weak areas.","","The AI coaching system has five modes: motivational nudges on the dashboard, weekly performance reports, real-time adjustments to review intervals, a conversational AI coach that knows your exact learning data, and a study plan agent that generates and adapts a multi-day schedule. Every coaching message is personalized — it references your specific weak topics, your streak, your exam date. Not a generic template.\""],C.purpleLight,C.purple,C.purple),
];

// ── BUILD DOCUMENT ──────────────────────────────────────────
const doc=new Document({
  numbering:{config:[
    {reference:"bullets",levels:[{level:0,format:"bullet",text:"•",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}}]},
    {reference:"bullets2",levels:[{level:0,format:"bullet",text:"◦",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:1080,hanging:360}}}}]},
    {reference:"bullets3",levels:[{level:0,format:"bullet",text:"▪",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:1440,hanging:360}}}}]},
    {reference:"nums",levels:[{level:0,format:"decimal",text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}}]},
  ]},
  styles:{default:{document:{run:{font:"Calibri",size:22}}}},
  sections:[{
    properties:{page:{size:{width:12240,height:15840},margin:{top:1260,right:1260,bottom:1260,left:1260}}},
    children:content,
  }]
});

Packer.toBuffer(doc).then(b=>{
  fs.writeFileSync("C:/Users/swami/Coding/cognileapai/presentation-guides/Swami_MegaGuide.docx",b);
  console.log("Mega guide done.");
});
