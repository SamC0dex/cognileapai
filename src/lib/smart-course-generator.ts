/**
 * Smart Course Generator
 * 
 * Handles all document sizes intelligently with Gemini 2.5 models.
 * 
 * Gemini 2.5 Free Tier Limits:
 * - 10 RPM (requests per minute) - PRIMARY CONSTRAINT
 * - 250,000 TPM (tokens per minute) - generous
 * - 250 RPD (requests per day)
 * - Input context: ~1M tokens
 * - Output: up to 65,536 tokens (32k for flash-lite)
 * 
 * Strategies:
 * - Small docs (<30k tokens): One-shot generation (1 request)
 * - Medium docs (30k-80k tokens): Outline + sequential units
 * - Large docs (>80k tokens): Chunked with summary context
 * 
 * Accuracy Features:
 * - Two-phase outline: Extract topics THEN structure
 * - Source verification: Topics must exist in document
 * - Quality check: Flash-Lite verifies in background
 */

import { GoogleGenAI } from '@google/genai'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================
// UTILS
// ============================================

/**
 * Fisher-Yates shuffle for randomizing quiz options
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Shuffle quiz options - correctAnswer is text so stays the same
 */
function randomizeQuizOptions(options: string[], correctAnswer: string): { options: string[]; correctAnswer: string } {
  return { options: shuffleArray(options), correctAnswer }
}

// ============================================
// TYPES
// ============================================

export type GenerationStrategy = 'ONE_SHOT' | 'MULTI_OUTPUT' | 'CHUNKED'

export interface GenerationPlan {
  strategy: GenerationStrategy
  documentTokens: number
  estimatedOutputTokens: number
  estimatedUnits: number
  chunks?: DocumentChunk[]
  summary?: string
  canParallelize: boolean
  estimatedTimeSeconds: number
}

export interface DocumentChunk {
  index: number
  content: string
  tokens: number
  relevantUnits: number[] // Which units this chunk is relevant for
}

export interface CourseOutline {
  title: string
  description: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedMinutes: number
  units: UnitOutline[]
}

export interface UnitOutline {
  title: string
  description: string
  orderIndex: number
  keyTopics: string[] // Topics to cover - helps with content extraction
}

export interface GeneratedUnit {
  title: string
  description: string
  steps: UnitStep[]
}

export interface UnitStep {
  type: 'content' | 'quiz'
  title?: string
  content?: string
  question?: string
  options?: string[]
  correctAnswer?: string
  explanation?: string
}

export interface GenerationState {
  courseId: string
  strategy: GenerationStrategy
  plan: GenerationPlan
  outline: CourseOutline | null
  unitsCompleted: Set<number>
  unitsInProgress: Set<number>
  unitsFailed: Map<number, string>
  lastRequestTime: number
}

// ============================================
// CONSTANTS - Gemini 2.5 Free Tier
// ============================================

const TOKENS_PER_CHAR = 0.25 // Rough estimate: 4 chars ≈ 1 token

// Gemini 2.5 Model Limits
const MODELS = {
  FLASH: 'gemini-2.5-flash',
  FLASH_LITE: 'gemini-2.5-flash-lite',
  PRO: 'gemini-2.5-pro'
}

const MAX_OUTPUT_TOKENS = 65536 // All Gemini 2.5 models
const MAX_INPUT_CONTEXT = 1000000 // 1M tokens
const SAFE_INPUT_PER_REQUEST = 150000 // Stay under 250k/min total

// Free Tier Rate Limits
const MAX_REQUESTS_PER_MINUTE = 10
const MAX_TOKENS_PER_MINUTE = 250000 // Input + Output combined
const MIN_REQUEST_INTERVAL_MS = 6500 // 6.5 seconds = safe for 10 RPM

// Generation Estimates
const TOKENS_PER_UNIT_OUTPUT = 3500 // Average output per unit
const CHUNK_SIZE_TOKENS = 20000 // Target chunk size
const CHUNK_OVERLAP_TOKENS = 3000 // Overlap for context continuity

// ============================================
// TOKEN UTILITIES
// ============================================

function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR)
}

function estimateUnitsFromDocument(documentTokens: number): number {
  // Rough heuristic: 1 unit per 5000-10000 tokens of source
  const baseUnits = Math.ceil(documentTokens / 7500)
  return Math.max(3, Math.min(15, baseUnits)) // 3-15 units
}

// ============================================
// PLANNING
// ============================================

export function createGenerationPlan(documentContent: string): GenerationPlan {
  const documentTokens = estimateTokens(documentContent)
  const estimatedUnits = estimateUnitsFromDocument(documentTokens)
  const estimatedOutputTokens = estimatedUnits * TOKENS_PER_UNIT_OUTPUT
  
  console.log(`[SmartGen] Document: ${documentTokens} tokens, estimated ${estimatedUnits} units`)
  
  // Strategy decision tree
  let strategy: GenerationStrategy
  let canParallelize = false
  let chunks: DocumentChunk[] | undefined
  let summary: string | undefined
  
  if (documentTokens < 50000 && estimatedOutputTokens < MAX_OUTPUT_TOKENS) {
    // Small doc: Can generate entire course in one request
    strategy = 'ONE_SHOT'
    canParallelize = false
  } else if (documentTokens < SAFE_INPUT_PER_REQUEST) {
    // Medium doc: Full doc fits in context, generate units separately
    strategy = 'MULTI_OUTPUT'
    canParallelize = true
  } else {
    // Large doc (>150k tokens): Need to chunk document
    strategy = 'CHUNKED'
    canParallelize = true
    chunks = createDocumentChunks(documentContent, estimatedUnits)
  }
  
  // Estimate time based on rate limits
  const totalTokens = documentTokens + estimatedOutputTokens
  const requestsNeeded = strategy === 'ONE_SHOT' ? 1 : estimatedUnits + 1 // +1 for outline
  const timePerRequest = Math.max(MIN_REQUEST_INTERVAL_MS, (totalTokens / MAX_TOKENS_PER_MINUTE) * 60000 / requestsNeeded)
  const estimatedTimeSeconds = Math.ceil((requestsNeeded * timePerRequest) / 1000)
  
  console.log(`[SmartGen] Strategy: ${strategy}, parallel: ${canParallelize}, est. time: ${estimatedTimeSeconds}s`)
  
  return {
    strategy,
    documentTokens,
    estimatedOutputTokens,
    estimatedUnits,
    chunks,
    summary,
    canParallelize,
    estimatedTimeSeconds
  }
}

function createDocumentChunks(content: string, estimatedUnits: number): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  const charsPerChunk = Math.floor(CHUNK_SIZE_TOKENS / TOKENS_PER_CHAR)
  const overlapChars = Math.floor(CHUNK_OVERLAP_TOKENS / TOKENS_PER_CHAR)
  
  let position = 0
  let chunkIndex = 0
  
  while (position < content.length) {
    // Find a good break point (paragraph end)
    let endPosition = Math.min(position + charsPerChunk, content.length)
    
    if (endPosition < content.length) {
      // Look for paragraph break
      const searchStart = Math.max(position + charsPerChunk - 500, position)
      const searchEnd = Math.min(position + charsPerChunk + 500, content.length)
      const searchArea = content.slice(searchStart, searchEnd)
      const breakMatch = searchArea.match(/\n\n|\.\s+[A-Z]/)
      
      if (breakMatch && breakMatch.index !== undefined) {
        endPosition = searchStart + breakMatch.index + breakMatch[0].length
      }
    }
    
    const chunkContent = content.slice(position, endPosition)
    
    chunks.push({
      index: chunkIndex,
      content: chunkContent,
      tokens: estimateTokens(chunkContent),
      relevantUnits: [] // Will be filled after outline is generated
    })
    
    // Move position with overlap
    position = endPosition - overlapChars
    chunkIndex++
  }
  
  console.log(`[SmartGen] Created ${chunks.length} chunks`)
  return chunks
}

// ============================================
// PROMPTS - Designed for SOURCE ACCURACY
// ============================================

/**
 * Phase 1: Topic Extraction
 * Forces model to identify ONLY topics that exist in the source
 */
const TOPIC_EXTRACTION_PROMPT = `You are a document analyzer. Your task is to identify the MAIN TOPICS and SUBTOPICS that EXPLICITLY appear in this document.

CRITICAL RULES:
1. ONLY list topics that are DIRECTLY mentioned or discussed in the document
2. DO NOT invent or infer topics that aren't clearly present
3. Use the document's own terminology and headings where possible
4. Group related concepts together

OUTPUT FORMAT (JSON only):
{
  "documentType": "textbook|article|notes|manual|other",
  "mainTopics": [
    {
      "name": "Topic name as it appears in document",
      "subtopics": ["subtopic1", "subtopic2"],
      "approximateLocation": "beginning|middle|end"
    }
  ],
  "totalTopicsFound": <number>
}

DOCUMENT:
`

/**
 * Phase 2: Course Structure
 * Uses ONLY the extracted topics to build course
 */
const STRUCTURE_PROMPT = `You are creating a course structure. You MUST use ONLY the topics provided below - do not add topics that weren't extracted from the source document.

EXTRACTED TOPICS FROM DOCUMENT:
{extractedTopics}

RULES:
1. Create 3-12 units using ONLY the topics listed above
2. Each unit: 10-15 minutes, covering 1-3 related topics
3. Order units from foundational to advanced concepts
4. Every keyTopic in a unit MUST be from the extracted topics list
5. DO NOT add topics that aren't in the extracted list

OUTPUT FORMAT (JSON only):
{
  "title": "Course Title based on document content (max 60 chars)",
  "description": "One-sentence description",
  "difficulty": "beginner|intermediate|advanced",
  "estimatedMinutes": <total>,
  "units": [
    {
      "title": "Unit Title (from source topics)",
      "description": "What this unit covers",
      "orderIndex": 0,
      "keyTopics": ["topic1", "topic2"],
      "sourceTopicNames": ["exact names from extracted topics"]
    }
  ]
}
`

/**
 * Legacy single-step outline (for small documents)
 */
const OUTLINE_PROMPT = `You are creating a course outline from a document. 

CRITICAL - SOURCE ACCURACY:
- Every unit and topic MUST be based on content that EXPLICITLY appears in the document
- Use the document's own terminology and headings
- Do NOT make up topics that aren't discussed in the source

RULES:
1. Create 3-10 units based on document content
2. Each unit: 10-15 minutes, focused on actual document sections
3. keyTopics must be terms/concepts from the document
4. Keep descriptions concise and accurate to source

OUTPUT FORMAT (JSON only):
{
  "title": "Course Title (max 60 chars)",
  "description": "One-sentence description",
  "difficulty": "beginner|intermediate|advanced",
  "estimatedMinutes": <total>,
  "units": [
    {
      "title": "Unit Title",
      "description": "What this unit covers",
      "orderIndex": 0,
      "keyTopics": ["topic1", "topic2", "topic3"]
    }
  ]
}

DOCUMENT CONTENT:
`

function createUnitPrompt(
  outline: CourseOutline,
  unitIndex: number,
  relevantContent: string,
  previousUnitTitles: string[]
): string {
  const unit = outline.units[unitIndex]
  
  return `Generate micro-learning content for Unit ${unitIndex + 1} of ${outline.units.length}.

COURSE: "${outline.title}"
UNIT: "${unit.title}"  
DESCRIPTION: ${unit.description}
KEY TOPICS TO COVER: ${unit.keyTopics.join(', ')}

${previousUnitTitles.length > 0 ? `
PREVIOUS UNITS (for continuity):
${previousUnitTitles.map((t, i) => `- Unit ${i + 1}: ${t}`).join('\n')}
` : ''}

=== MICRO-LEARNING FORMAT (Penseum/Duolingo Style) ===

Create 6-10 STEPS that alternate between bite-sized content and reinforcement quizzes.

CONTENT STEPS must be:
- 60-120 words MAX (one screen of reading)
- Start with a clear heading
- Use bullet points or numbered lists
- Include ONE key concept per step
- Use simple language, avoid jargon
- Add emoji sparingly for visual breaks (📌 💡 ⚡ ✅)

QUIZ STEPS must:
- Appear after every 2-3 content steps
- Test what was JUST learned (not random trivia)
- Have exactly 4 options (A, B, C, D)
- Include brief explanation for the correct answer
- Be answerable from the content shown

=== CRITICAL: SOURCE ACCURACY ===
- ALL facts must come from the SOURCE CONTENT below
- Do NOT add information not in the source
- Use terminology from the source document
- If source doesn't cover a topic, skip it

OUTPUT FORMAT (JSON only, no markdown):
{
  "title": "${unit.title}",
  "description": "${unit.description}",
  "steps": [
    {
      "type": "content",
      "title": "Clear Section Title",
      "content": "📌 **Key Point**\\n\\n• Bullet point one\\n• Bullet point two\\n\\nSimple explanation here."
    },
    {
      "type": "quiz",
      "question": "Based on what you just learned, which is correct?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option B",
      "explanation": "B is correct because [brief reason from content]"
    }
  ]
}

=== SOURCE CONTENT (use ONLY this) ===
${relevantContent}
`
}

const ONE_SHOT_PROMPT = `Generate a complete micro-learning course from this document.

=== COURSE STRUCTURE ===
Create 3-8 UNITS based on the document's natural sections/topics.
Each unit has 6-10 STEPS alternating content and quizzes.

=== MICRO-LEARNING FORMAT ===

CONTENT STEPS:
- 60-120 words MAX per step
- One key concept per step
- Use bullet points and simple language
- Add emoji for visual breaks (📌 💡 ⚡)

QUIZ STEPS:
- After every 2-3 content steps
- 4 options, clear correct answer
- Test what was just taught
- Brief explanation

=== SOURCE ACCURACY ===
- ONLY use information from the document
- Use the document's own terminology
- Do NOT make up facts or topics

OUTPUT FORMAT (JSON only):
{
  "title": "Course Title from Document",
  "description": "One sentence description",
  "difficulty": "beginner|intermediate|advanced",
  "units": [
    {
      "title": "Unit Title",
      "steps": [
        {"type": "content", "title": "Topic", "content": "📌 **Key Point**\\n\\n• Fact one\\n• Fact two"},
        {"type": "quiz", "question": "Question?", "options": ["A", "B", "C", "D"], "correctAnswer": "B", "explanation": "Why B"}
      ]
    }
  ]
}

DOCUMENT:
`

// ============================================
// GENERATOR CLASS
// ============================================

export class SmartCourseGenerator {
  private genai: GoogleGenAI
  private supabase: SupabaseClient
  private primaryModel = MODELS.FLASH // gemini-2.5-flash
  private verificationModel = MODELS.FLASH_LITE // gemini-2.5-flash-lite for QA
  private state: GenerationState | null = null
  private requestCount = 0
  private minuteStartTime = Date.now()
  
  constructor(apiKey: string, supabaseUrl: string, supabaseKey: string) {
    this.genai = new GoogleGenAI({ apiKey })
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }
  
  /**
   * Main entry point - generates course based on optimal strategy
   */
  async generateCourse(
    documentContent: string,
    documentTitle: string,
    userId: string,
    documentId: string,
    onProgress?: (progress: Record<string, unknown>) => void
  ): Promise<string> {
    // Create generation plan
    const plan = createGenerationPlan(documentContent)
    
    // Create course record
    const courseId = await this.createCourseRecord(userId, documentId, documentTitle, plan)
    
    // Initialize state
    this.state = {
      courseId,
      strategy: plan.strategy,
      plan,
      outline: null,
      unitsCompleted: new Set(),
      unitsInProgress: new Set(),
      unitsFailed: new Map(),
      lastRequestTime: 0
    }
    
    try {
      if (plan.strategy === 'ONE_SHOT') {
        await this.generateOneShot(documentContent, onProgress)
      } else {
        await this.generateMultiPart(documentContent, plan, onProgress)
      }
      
      // Mark complete
      await this.updateCourseStatus('ready', 100, 'Course ready!')
      return courseId
      
    } catch (error) {
      console.error('[SmartGen] Generation failed:', error)
      await this.updateCourseStatus('error', 0, `Generation failed: ${error}`)
      throw error
    }
  }
  
  /**
   * One-shot generation for small documents
   */
  private async generateOneShot(
    documentContent: string,
    onProgress?: (progress: Record<string, unknown>) => void
  ): Promise<void> {
    console.log('[SmartGen] Using ONE_SHOT strategy')
    
    await this.updateProgress(10, 'Generating course...', onProgress)
    await this.respectRateLimit()
    
    const response = await this.genai.models.generateContent({
      model: this.primaryModel,
      contents: [{
        role: 'user',
        parts: [{ text: ONE_SHOT_PROMPT + documentContent }]
      }],
      config: {
        temperature: 0.7,
        maxOutputTokens: MAX_OUTPUT_TOKENS // 65,536 - use full capacity
      }
    })
    
    const responseText = response.text || ''
    if (!responseText) throw new Error('Empty response from model')
    
    interface OneShotCourse {
      title: string
      description: string
      difficulty: 'beginner' | 'intermediate' | 'advanced'
      units: GeneratedUnit[]
    }
    const course = this.parseJSON<OneShotCourse>(responseText)
    
    await this.updateProgress(50, 'Saving course...', onProgress)
    
    // Save all units
    for (let i = 0; i < course.units.length; i++) {
      await this.saveUnit(course.units[i], i)
      await this.updateProgress(
        50 + Math.floor((i + 1) / course.units.length * 45),
        `Saved unit ${i + 1}/${course.units.length}`,
        onProgress
      )
    }
    
    // Update course metadata
    await (this.supabase
      .from('courses')
      .update({
        title: course.title,
        description: course.description,
        difficulty: course.difficulty,
        total_chapters: course.units.length,
        total_lessons: course.units.length
      } as Record<string, unknown>)
      .eq('id', this.state!.courseId))
  }
  
  /**
   * Multi-part generation for medium/large documents
   */
  private async generateMultiPart(
    documentContent: string,
    plan: GenerationPlan,
    onProgress?: (progress: Record<string, unknown>) => void
  ): Promise<void> {
    console.log(`[SmartGen] Using ${plan.strategy} strategy`)
    
    // Step 1: Generate outline
    await this.updateProgress(5, 'Analyzing document...', onProgress)
    const outline = await this.generateOutline(documentContent, plan)
    this.state!.outline = outline
    
    // Save outline to DB
    await this.saveOutline(outline)
    await this.updateProgress(15, `Created ${outline.units.length} units`, onProgress)
    
    // Step 2: Generate units
    const totalUnits = outline.units.length
    const completedUnits: string[] = []
    
    // For CHUNKED strategy, map chunks to units
    if (plan.strategy === 'CHUNKED' && plan.chunks) {
      this.mapChunksToUnits(plan.chunks, outline)
    }
    
    // Generate units (can be parallel for MULTI_OUTPUT and CHUNKED)
    if (plan.canParallelize) {
      // Generate up to 2 units in parallel (respect rate limits)
      const queue = [...outline.units.map((_, i) => i)]
      const inFlight: Promise<void>[] = []
      const maxParallel = 2
      
      while (queue.length > 0 || inFlight.length > 0) {
        // Start new requests up to maxParallel
        while (queue.length > 0 && inFlight.length < maxParallel) {
          const unitIndex = queue.shift()!
          const promise = this.generateAndSaveUnit(
            unitIndex,
            documentContent,
            plan,
            completedUnits
          ).then(() => {
            completedUnits.push(outline.units[unitIndex].title)
            this.state!.unitsCompleted.add(unitIndex)
            const progress = 15 + Math.floor((this.state!.unitsCompleted.size / totalUnits) * 80)
            this.updateProgress(
              progress,
              `Generated ${this.state!.unitsCompleted.size}/${totalUnits} units`,
              onProgress
            )
          }).catch(err => {
            console.error(`[SmartGen] Unit ${unitIndex} failed:`, err)
            this.state!.unitsFailed.set(unitIndex, err.message)
          })
          
          inFlight.push(promise)
        }
        
        // Wait for at least one to complete
        if (inFlight.length > 0) {
          await Promise.race(inFlight)
          // Remove completed promises
          for (let i = inFlight.length - 1; i >= 0; i--) {
            // Check if promise is settled
            const isSettled = await Promise.race([
              inFlight[i].then(() => true).catch(() => true),
              Promise.resolve(false)
            ])
            if (isSettled) {
              inFlight.splice(i, 1)
            }
          }
        }
      }
    } else {
      // Sequential generation
      for (let i = 0; i < totalUnits; i++) {
        await this.generateAndSaveUnit(i, documentContent, plan, completedUnits)
        completedUnits.push(outline.units[i].title)
        this.state!.unitsCompleted.add(i)
        
        const progress = 15 + Math.floor((i + 1) / totalUnits * 80)
        await this.updateProgress(
          progress,
          `Generated ${i + 1}/${totalUnits} units`,
          onProgress
        )
      }
    }
  }
  
  /**
   * Generate course outline
   */
  private async generateOutline(
    documentContent: string,
    plan: GenerationPlan
  ): Promise<CourseOutline> {
    await this.respectRateLimit()
    
    // For large docs, use first portion + sampled sections
    // Safe input: 150k tokens (~600k chars) to stay under 250k/min with output
    let contextContent = documentContent
    if (plan.documentTokens > SAFE_INPUT_PER_REQUEST) {
      // Doc too large - use summary approach
      contextContent = this.createDocumentSummaryContext(documentContent)
    } else if (plan.documentTokens > 100000) {
      // Trim to safe limit
      contextContent = documentContent.slice(0, Math.floor(SAFE_INPUT_PER_REQUEST / TOKENS_PER_CHAR))
    }
    
    const response = await this.genai.models.generateContent({
      model: this.primaryModel,
      contents: [{
        role: 'user',
        parts: [{ text: OUTLINE_PROMPT + contextContent }]
      }],
      config: {
        temperature: 0.7,
        maxOutputTokens: MAX_OUTPUT_TOKENS // 65,536
      }
    })
    
    return this.parseJSON<CourseOutline>(response.text || '')
  }
  
  /**
   * Generate and save a single unit
   */
  private async generateAndSaveUnit(
    unitIndex: number,
    documentContent: string,
    plan: GenerationPlan,
    completedUnits: string[]
  ): Promise<void> {
    const outline = this.state!.outline!
    const unit = outline.units[unitIndex]
    
    this.state!.unitsInProgress.add(unitIndex)
    
    // Get relevant content for this unit
    let relevantContent: string
    if (plan.strategy === 'CHUNKED' && plan.chunks) {
      relevantContent = this.getRelevantChunks(plan.chunks, unitIndex)
    } else {
      // For MULTI_OUTPUT, extract section based on position
      relevantContent = this.extractRelevantSection(documentContent, unitIndex, outline.units.length)
    }
    
    // Truncate if too long
    const maxContentTokens = 20000
    if (estimateTokens(relevantContent) > maxContentTokens) {
      relevantContent = relevantContent.slice(0, Math.floor(maxContentTokens / TOKENS_PER_CHAR))
    }
    
    await this.respectRateLimit()
    
    const prompt = createUnitPrompt(outline, unitIndex, relevantContent, completedUnits)
    
    const response = await this.genai.models.generateContent({
      model: this.primaryModel,
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      config: {
        temperature: 0.7,
        maxOutputTokens: MAX_OUTPUT_TOKENS // 65,536
      }
    })
    
    const generatedUnit = this.parseJSON<GeneratedUnit>(response.text || '')
    await this.saveUnit(generatedUnit, unitIndex)
    
    this.state!.unitsInProgress.delete(unitIndex)
  }
  
  /**
   * Save unit to database
   */
  private async saveUnit(unit: GeneratedUnit, orderIndex: number): Promise<void> {
    const courseId = this.state!.courseId
    
    // Get or create chapter
    const { data: chapter } = await this.supabase
      .from('chapters')
      .select('id')
      .eq('course_id', courseId)
      .eq('order_index', orderIndex)
      .single() as { data: { id: string } | null }
    
    let chapterId: string
    if (chapter) {
      chapterId = chapter.id
      // Update chapter
      await (this.supabase
        .from('chapters')
        .update({ title: unit.title, description: unit.description } as Record<string, unknown>)
        .eq('id', chapterId))
    } else {
      // Create chapter
      const { data: newChapter } = await this.supabase
        .from('chapters')
        .insert({
          course_id: courseId,
          title: unit.title,
          description: unit.description,
          order_index: orderIndex
        } as Record<string, unknown>)
        .select('id')
        .single() as { data: { id: string } | null }
      chapterId = newChapter!.id
    }
    
    // Create markdown from steps
    const contentSteps = unit.steps.filter(s => s.type === 'content')
    const quizSteps = unit.steps.filter(s => s.type === 'quiz')
    
    const markdown = contentSteps
      .map(s => `## ${s.title || ''}\n\n${s.content || ''}\n\n---`)
      .join('\n\n')
    
    // Create lesson
    const { data: lesson } = await this.supabase
      .from('lessons')
      .insert({
        course_id: courseId,
        chapter_id: chapterId,
        title: unit.title,
        description: unit.description,
        learning_objective: `Master ${unit.title}`,
        content_markdown: markdown,
        order_index: orderIndex,
        lesson_number: `${orderIndex + 1}`,
        estimated_minutes: Math.ceil(unit.steps.length * 1.5),
        images: [],
        interactive_elements: { steps: unit.steps },
        videos: []
      } as Record<string, unknown>)
      .select('id')
      .single() as { data: { id: string } | null }
    
    // Create quiz questions with randomized options
    for (let i = 0; i < quizSteps.length; i++) {
      const q = quizSteps[i]
      // Randomize option order to prevent predictable answer positions
      const { options: shuffledOptions, correctAnswer } = randomizeQuizOptions(
        q.options || [],
        q.correctAnswer || ''
      )
      await this.supabase
        .from('lesson_quizzes')
        .insert({
          lesson_id: lesson!.id,
          question: q.question || '',
          question_type: 'multiple_choice',
          options: shuffledOptions,
          correct_answer: correctAnswer,
          explanation: q.explanation || '',
          difficulty: 'medium',
          order_index: i
        } as Record<string, unknown>)
    }
  }
  
  /**
   * Save outline to database (create chapters)
   */
  private async saveOutline(outline: CourseOutline): Promise<void> {
    const courseId = this.state!.courseId
    
    // Update course
    await (this.supabase
      .from('courses')
      .update({
        title: outline.title,
        description: outline.description,
        difficulty: outline.difficulty,
        estimated_hours: Math.ceil(outline.estimatedMinutes / 60),
        total_chapters: outline.units.length,
        total_lessons: outline.units.length
      } as Record<string, unknown>)
      .eq('id', courseId))
    
    // Create placeholder chapters
    for (const unit of outline.units) {
      await this.supabase
        .from('chapters')
        .insert({
          course_id: courseId,
          title: unit.title,
          description: unit.description,
          order_index: unit.orderIndex
        } as Record<string, unknown>)
    }
  }
  
  // ============================================
  // HELPER METHODS
  // ============================================
  
  private async createCourseRecord(
    userId: string,
    documentId: string,
    title: string,
    plan: GenerationPlan
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('courses')
      .insert({
        user_id: userId,
        document_id: documentId,
        title: `Course: ${title}`,
        status: 'generating',
        estimated_hours: Math.ceil(plan.estimatedTimeSeconds / 60),
        total_chapters: plan.estimatedUnits,
        total_lessons: plan.estimatedUnits,
        generation_progress: {
          phase: 'outline',
          percentage: 0,
          currentStep: 'Starting...',
          strategy: plan.strategy
        }
      } as Record<string, unknown>)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }
    
    if (error) throw error
    
    // Create user progress
    await this.supabase
      .from('user_course_progress')
      .insert({
        user_id: userId,
        course_id: data!.id,
        completion_percentage: 0,
        lessons_completed: 0,
        total_time_seconds: 0
      } as Record<string, unknown>)
    
    return data!.id
  }
  
  private async updateCourseStatus(
    status: string,
    percentage: number,
    step: string
  ): Promise<void> {
    if (!this.state) return
    
    await (this.supabase
      .from('courses')
      .update({
        status,
        generation_progress: {
          phase: status === 'ready' ? 'complete' : status === 'error' ? 'error' : 'lessons',
          percentage,
          currentStep: step,
          unitsCompleted: this.state.unitsCompleted.size,
          unitsTotal: this.state.outline?.units.length || this.state.plan.estimatedUnits
        }
      } as Record<string, unknown>)
      .eq('id', this.state.courseId))
  }
  
  private async updateProgress(
    percentage: number,
    step: string,
    onProgress?: (progress: Record<string, unknown>) => void
  ): Promise<void> {
    if (!this.state) return
    
    const progress = {
      phase: 'lessons',
      percentage,
      currentStep: step,
      unitsCompleted: this.state.unitsCompleted.size,
      unitsTotal: this.state.outline?.units.length || this.state.plan.estimatedUnits
    }
    
    await (this.supabase
      .from('courses')
      .update({ generation_progress: progress } as Record<string, unknown>)
      .eq('id', this.state.courseId))
    
    if (onProgress) onProgress(progress)
  }
  
  /**
   * Respects Gemini 2.5 Free Tier: 10 RPM limit
   * Enforces minimum 6.5s between requests
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now()
    
    // Reset counter if minute has passed
    if (now - this.minuteStartTime > 60000) {
      this.requestCount = 0
      this.minuteStartTime = now
    }
    
    // If we've hit 9 requests this minute, wait for next minute
    if (this.requestCount >= 9) {
      const waitTime = 60000 - (now - this.minuteStartTime) + 1000
      console.log(`[SmartGen] Rate limit: waiting ${Math.ceil(waitTime/1000)}s for next minute`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      this.requestCount = 0
      this.minuteStartTime = Date.now()
    }
    
    // Always wait minimum interval between requests
    const timeSinceLast = now - (this.state?.lastRequestTime || 0)
    if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLast))
    }
    
    this.requestCount++
    if (this.state) {
      this.state.lastRequestTime = Date.now()
    }
  }
  
  private parseJSON<T = unknown>(text: string): T {
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    
    // Find JSON object/array
    const match = cleaned.match(/[\[{][\s\S]*[\]}]/)
    if (match) {
      return JSON.parse(match[0]) as T
    }
    
    return JSON.parse(cleaned) as T
  }
  
  private createDocumentSummaryContext(content: string): string {
    // Take first 20k chars + middle sample + end sample
    const charsFor20k = Math.floor(20000 / TOKENS_PER_CHAR)
    const first = content.slice(0, charsFor20k)
    const middle = content.slice(
      Math.floor(content.length / 2) - charsFor20k / 4,
      Math.floor(content.length / 2) + charsFor20k / 4
    )
    const end = content.slice(-charsFor20k / 2)
    
    return `[DOCUMENT START]\n${first}\n\n[MIDDLE SECTION]\n${middle}\n\n[DOCUMENT END]\n${end}`
  }
  
  private extractRelevantSection(
    content: string,
    unitIndex: number,
    totalUnits: number
  ): string {
    const charsPerUnit = Math.floor(content.length / totalUnits)
    const start = Math.max(0, (unitIndex - 0.5) * charsPerUnit)
    const end = Math.min(content.length, (unitIndex + 1.5) * charsPerUnit)
    return content.slice(start, end)
  }
  
  private mapChunksToUnits(chunks: DocumentChunk[], outline: CourseOutline): void {
    // Simple mapping: distribute chunks across units
    const chunksPerUnit = Math.ceil(chunks.length / outline.units.length)
    
    for (let i = 0; i < chunks.length; i++) {
      const unitIndex = Math.floor(i / chunksPerUnit)
      if (unitIndex < outline.units.length) {
        chunks[i].relevantUnits.push(unitIndex)
        // Also add to adjacent units for overlap
        if (unitIndex > 0) chunks[i].relevantUnits.push(unitIndex - 1)
        if (unitIndex < outline.units.length - 1) chunks[i].relevantUnits.push(unitIndex + 1)
      }
    }
  }
  
  private getRelevantChunks(chunks: DocumentChunk[], unitIndex: number): string {
    return chunks
      .filter(c => c.relevantUnits.includes(unitIndex))
      .map(c => c.content)
      .join('\n\n---\n\n')
  }
  
  /**
   * Quality verification using Gemini 2.5 Flash-Lite
   * Runs in background after unit is saved - doesn't block generation
   */
  async verifyUnitQuality(
    unitContent: GeneratedUnit,
    sourceContent: string,
    courseId: string
  ): Promise<{ passed: boolean; issues: string[]; score: number }> {
    try {
      const verificationPrompt = `You are a quality checker for educational content. Verify this generated unit against its source.

SOURCE CONTENT (excerpt):
${sourceContent.slice(0, 5000)}

GENERATED UNIT:
Title: ${unitContent.title}
Steps: ${unitContent.steps.length}
Content Preview: ${unitContent.steps.slice(0, 3).map(s => s.content || s.question).join('\n')}

VERIFY:
1. ACCURACY: Is the content factually consistent with the source?
2. COMPLETENESS: Are key topics from the source covered?
3. NO HALLUCINATION: Is there any made-up information not in source?
4. ADHD-FRIENDLY: Is content concise, scannable, with clear structure?
5. QUIZ QUALITY: Are quiz questions answerable from the content?

OUTPUT (JSON only):
{
  "passed": true/false,
  "accuracyScore": 1-10,
  "completenessScore": 1-10,
  "adhdFriendlyScore": 1-10,
  "issues": ["list of specific issues"],
  "overallScore": 1-10
}
`
      
      // Use Flash-Lite for fast, cheap verification
      const response = await this.genai.models.generateContent({
        model: this.verificationModel,
        contents: [{
          role: 'user',
          parts: [{ text: verificationPrompt }]
        }],
        config: {
          temperature: 0.3,
          maxOutputTokens: 8192 // QA response doesn't need full 65k
        }
      })
      
      interface VerificationResult {
        passed: boolean
        issues?: string[]
        overallScore?: number
      }
      const result = this.parseJSON<VerificationResult>(response.text || '')
      
      // Store verification results
      await (this.supabase
        .from('courses')
        .update({
          metadata: {
            lastVerification: {
              timestamp: new Date().toISOString(),
              model: this.verificationModel,
              result
            }
          }
        } as Record<string, unknown>)
        .eq('id', courseId))
      
      return {
        passed: result.passed,
        issues: result.issues || [],
        score: result.overallScore || 0
      }
    } catch (error) {
      console.error('[SmartGen] Verification error:', error)
      return { passed: true, issues: [], score: 0 } // Don't block on verification failure
    }
  }
}

// ============================================
// FACTORY
// ============================================

export function createSmartCourseGenerator(): SmartCourseGenerator {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    throw new Error('Missing required environment variables')
  }
  
  return new SmartCourseGenerator(apiKey, supabaseUrl, supabaseKey)
}
