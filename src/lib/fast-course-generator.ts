/**
 * Fast Course Generator - Penseum-style quick generation
 * 
 * Architecture:
 * 1. Generate outline immediately (~5s)
 * 2. Save outline and show course page with skeletons
 * 3. Generate lessons in parallel (each ~10-15s)
 * 4. Update database as each lesson completes
 * 5. Client uses Supabase realtime to see updates instantly
 * 
 * Key differences from old system:
 * - No batching, generate each lesson independently
 * - Parallel generation (3-4 lessons at once)
 * - Shorter, step-based content (not long markdown)
 * - Quizzes generated inline with content
 */

import { GoogleGenAI } from '@google/genai'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 2000 // Start with 2 seconds
const RETRYABLE_ERRORS = [503, 429, 500, 502, 504]

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
 * Shuffle quiz options and return the new correct answer
 */
function randomizeQuizOptions(options: string[], correctAnswer: string): { options: string[]; correctAnswer: string } {
  const shuffled = shuffleArray(options)
  // correctAnswer is the actual text, not index - so it stays the same
  return { options: shuffled, correctAnswer }
}

/**
 * Retry wrapper with exponential backoff for transient API errors
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      lastError = error as Error
      
      // Check if error is retryable
      const errorStatus = (error as { status?: number })?.status
      const errorMessage = (error as Error)?.message || ''
      const isRetryable = 
        RETRYABLE_ERRORS.includes(errorStatus || 0) ||
        errorMessage.includes('overloaded') ||
        errorMessage.includes('UNAVAILABLE') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('503') ||
        errorMessage.includes('429')
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`[FastGen] ${context} failed after ${attempt + 1} attempts:`, errorMessage)
        throw error
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = BASE_DELAY_MS * Math.pow(2, attempt)
      console.log(`[FastGen] ${context} - Retry ${attempt + 1}/${maxRetries} after ${delay}ms (${errorMessage})`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}

// Types
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
  lessonCount: number
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

// Prompts - Optimized for source accuracy and micro-learning
const OUTLINE_PROMPT = `Analyze this document and create a course outline.

=== SOURCE ACCURACY (CRITICAL) ===
- ONLY create units for topics that EXPLICITLY appear in the document
- Use the document's own terminology and section headings
- Do NOT invent topics not in the source

=== STRUCTURE ===
- Create 3-8 units based on document sections
- Each unit: 10-15 minutes
- Order from foundational to advanced

OUTPUT FORMAT (JSON only):
{
  "title": "Course title based on document (max 50 chars)",
  "description": "One sentence description",
  "difficulty": "beginner|intermediate|advanced",
  "estimatedMinutes": <total>,
  "units": [
    {
      "title": "Unit title (from document)",
      "description": "What this unit covers",
      "orderIndex": 0,
      "lessonCount": 1
    }
  ]
}

DOCUMENT:
`

const UNIT_CONTENT_PROMPT = `Create micro-learning content for this unit.

=== MICRO-LEARNING FORMAT ===

CONTENT STEPS (create 4-6):
- 60-120 words MAX
- ONE key concept per step
- Use bullet points
- Add emoji (📌 💡 ⚡) for visual breaks
- Simple language only

QUIZ STEPS (create 2-3):
- After every 2 content steps
- Test what was JUST taught
- 4 options, clear correct answer
- Brief explanation

=== SOURCE ACCURACY ===
- ONLY use facts from the SOURCE CONTENT below
- Do NOT add external information
- If source is insufficient, keep content brief

OUTPUT FORMAT (JSON only):
{
  "title": "Unit title",
  "description": "Brief description",
  "steps": [
    {
      "type": "content",
      "title": "Topic",
      "content": "📌 **Key Point**\\n\\n• Fact one\\n• Fact two\\n\\nBrief explanation."
    },
    {
      "type": "quiz",
      "question": "Based on what you learned, which is true?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option B",
      "explanation": "B is correct because..."
    }
  ]
}

UNIT: {unitTitle}
DESCRIPTION: {unitDescription}

SOURCE CONTENT:
`

export class FastCourseGenerator {
  private genai: GoogleGenAI
  private supabase: SupabaseClient
  private model = 'gemini-2.5-flash' // Free tier: 10 RPM, 250k TPM
  
  constructor(apiKey: string, supabaseUrl: string, supabaseKey: string) {
    this.genai = new GoogleGenAI({ apiKey })
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }
  
  /**
   * Step 1: Generate outline quickly and create course shell
   */
  async generateOutline(
    documentContent: string,
    documentTitle: string,
    userId: string,
    documentId: string
  ): Promise<{ courseId: string; outline: CourseOutline }> {
    console.log('[FastGen] Generating outline...')
    
    // Generate outline with retry
    const response = await withRetry(
      () => this.genai.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [{ text: OUTLINE_PROMPT + documentContent.slice(0, 50000) }]
        }],
        config: {
          temperature: 0.7,
          maxOutputTokens: 65536 // Full capacity
        }
      }),
      'Outline generation'
    )
    
    const outlineText = response.text || ''
    if (!outlineText) throw new Error('Empty outline response from model')
    const cleaned = outlineText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const outline: CourseOutline = JSON.parse(cleaned)
    
    console.log('[FastGen] Outline generated:', outline.title, outline.units.length, 'units')
    
    // Create course record
    const { data: course, error: courseError } = await this.supabase
      .from('courses')
      .insert({
        user_id: userId,
        document_id: documentId,
        title: outline.title,
        description: outline.description,
        difficulty: outline.difficulty,
        estimated_hours: Math.ceil(outline.estimatedMinutes / 60),
        total_chapters: outline.units.length,
        total_lessons: outline.units.length,
        status: 'generating',
        generation_progress: {
          phase: 'lessons',
          percentage: 10,
          currentStep: 'Creating course structure...',
          unitsTotal: outline.units.length,
          unitsCompleted: 0
        }
      })
      .select('id')
      .single()
    
    if (courseError) throw courseError
    
    // Create chapter records (empty, will be filled with content)
    for (const unit of outline.units) {
      await this.supabase
        .from('chapters')
        .insert({
          course_id: course.id,
          title: unit.title,
          description: unit.description,
          order_index: unit.orderIndex
        })
    }
    
    // Create user progress record
    await this.supabase
      .from('user_course_progress')
      .insert({
        user_id: userId,
        course_id: course.id,
        completion_percentage: 0,
        lessons_completed: 0,
        total_time_seconds: 0
      })
    
    return { courseId: course.id, outline }
  }
  
  /**
   * Step 2: Generate units in parallel (called after outline)
   */
  async generateUnitsParallel(
    courseId: string,
    outline: CourseOutline,
    documentContent: string,
    concurrency: number = 3
  ): Promise<void> {
    console.log('[FastGen] Starting parallel unit generation...')
    
    // Get chapter IDs
    const { data: chapters } = await this.supabase
      .from('chapters')
      .select('id, order_index')
      .eq('course_id', courseId)
      .order('order_index')
    
    if (!chapters) throw new Error('No chapters found')
    
    // Generate units with limited concurrency
    const queue = [...outline.units]
    let completedCount = 0
    const totalUnits = outline.units.length
    
    const generateUnit = async (unit: UnitOutline): Promise<void> => {
      try {
        const chapter = chapters.find(c => c.order_index === unit.orderIndex)
        if (!chapter) return
        
        // Extract relevant content for this unit
        const contentChunk = this.extractContentForUnit(documentContent, unit, outline.units.length)
        
        // Generate unit content
        const prompt = UNIT_CONTENT_PROMPT
          .replace('{unitTitle}', unit.title)
          .replace('{unitDescription}', unit.description)
          + contentChunk
        
        const response = await withRetry(
          () => this.genai.models.generateContent({
            model: this.model,
            contents: [{
              role: 'user',
              parts: [{ text: prompt }]
            }],
            config: {
              temperature: 0.7,
              maxOutputTokens: 65536 // Full capacity
            }
          }),
          `Unit "${unit.title}" generation`
        )
        
        const unitText = response.text || ''
        if (!unitText) throw new Error(`Empty response for unit ${unit.title}`)
        const cleaned = unitText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const generatedUnit: GeneratedUnit = JSON.parse(cleaned)
        
        // Save lesson with step-based content
        const contentSteps = generatedUnit.steps.filter(s => s.type === 'content')
        const quizSteps = generatedUnit.steps.filter(s => s.type === 'quiz')
        
        // Randomize quiz options in steps for interactive_elements storage
        const stepsWithRandomizedQuizzes = generatedUnit.steps.map(step => {
          if (step.type === 'quiz' && step.options && step.correctAnswer) {
            const { options: shuffledOptions } = randomizeQuizOptions(step.options, step.correctAnswer)
            return { ...step, options: shuffledOptions }
          }
          return step
        })
        
        // Create markdown from steps for compatibility
        const markdown = this.stepsToMarkdown(stepsWithRandomizedQuizzes)
        
        // Insert lesson
        const { data: lesson, error: lessonError } = await this.supabase
          .from('lessons')
          .insert({
            course_id: courseId,
            chapter_id: chapter.id,
            title: generatedUnit.title,
            description: generatedUnit.description,
            learning_objective: `Understand ${generatedUnit.title}`,
            content_markdown: markdown,
            order_index: unit.orderIndex,
            lesson_number: `${unit.orderIndex + 1}`,
            estimated_minutes: Math.ceil(generatedUnit.steps.length * 1.5),
            images: [],
            interactive_elements: { steps: stepsWithRandomizedQuizzes },
            videos: []
          })
          .select('id')
          .single()
        
        if (lessonError) throw lessonError
        
        // Insert quiz questions with randomized options
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
              lesson_id: lesson.id,
              question: q.question || '',
              question_type: 'multiple_choice',
              options: shuffledOptions,
              correct_answer: correctAnswer,
              explanation: q.explanation || '',
              difficulty: 'medium',
              order_index: i
            })
        }
        
        // Update progress
        completedCount++
        const percentage = 10 + Math.floor((completedCount / totalUnits) * 85)
        
        await this.supabase
          .from('courses')
          .update({
            generation_progress: {
              phase: completedCount === totalUnits ? 'finalizing' : 'lessons',
              percentage,
              currentStep: `Generated ${completedCount}/${totalUnits} units`,
              unitsTotal: totalUnits,
              unitsCompleted: completedCount
            }
          })
          .eq('id', courseId)
        
        console.log(`[FastGen] Unit ${completedCount}/${totalUnits} complete: ${unit.title}`)
        
      } catch (error) {
        console.error(`[FastGen] Error generating unit "${unit.title}":`, error)
        // Continue with other units even if one fails
      }
    }
    
    // Process with concurrency limit
    const processing: Promise<void>[] = []
    
    for (const unit of queue) {
      const promise = generateUnit(unit)
      processing.push(promise)
      
      if (processing.length >= concurrency) {
        await Promise.race(processing)
        // Remove completed promises
        const completed = processing.filter(p => {
          // Check if promise is settled (hacky but works)
          let settled = false
          p.then(() => settled = true).catch(() => settled = true)
          return settled
        })
        for (const c of completed) {
          const idx = processing.indexOf(c)
          if (idx > -1) processing.splice(idx, 1)
        }
      }
    }
    
    // Wait for remaining
    await Promise.all(processing)
    
    // Finalize course
    await this.supabase
      .from('courses')
      .update({
        status: 'ready',
        total_lessons: totalUnits,
        generation_progress: {
          phase: 'complete',
          percentage: 100,
          currentStep: 'Course ready!',
          unitsTotal: totalUnits,
          unitsCompleted: totalUnits
        }
      })
      .eq('id', courseId)
    
    console.log('[FastGen] Course generation complete!')
  }
  
  /**
   * Convert steps to markdown for compatibility with existing viewer
   */
  private stepsToMarkdown(steps: UnitStep[]): string {
    let md = ''
    
    for (const step of steps) {
      if (step.type === 'content') {
        if (step.title) {
          md += `## ${step.title}\n\n`
        }
        md += `${step.content}\n\n---\n\n`
      }
      // Quiz steps are stored in interactive_elements, not in markdown
    }
    
    return md.trim()
  }
  
  /**
   * Extract relevant portion of document for a unit
   */
  private extractContentForUnit(fullContent: string, unit: UnitOutline, totalUnits: number): string {
    const charsPerUnit = Math.floor(fullContent.length / totalUnits)
    const start = unit.orderIndex * charsPerUnit
    const end = Math.min((unit.orderIndex + 2) * charsPerUnit, fullContent.length)
    return fullContent.slice(start, end)
  }
}

/**
 * Factory function
 */
export function createFastCourseGenerator(): FastCourseGenerator {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    throw new Error('Missing required environment variables')
  }
  
  return new FastCourseGenerator(apiKey, supabaseUrl, supabaseKey)
}
