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
  unitType?: 'intro' | 'concept' | 'process' | 'application' | 'summary'
  needsDiagram?: boolean
  needsQuiz?: boolean
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

// Prompts - Optimized for engagement, ADHD-friendly design, and source accuracy
const OUTLINE_PROMPT = `You are CogniLeap's AI course architect — you design courses that are impossible to ignore.

=== YOUR DESIGN PHILOSOPHY ===
You build courses for learners with short attention spans. Every unit must EARN the learner's attention through:
- **Chunking**: Small, focused units (one concept per unit)
- **Novelty**: Each unit opens with something unexpected — a question, a surprising fact, a "what if" scenario
- **Dopamine hooks**: Progress feels rewarding, not draining
- **Active recall**: Quizzes test understanding, not memorization
- **Spaced repetition**: Later units reference earlier concepts

=== SOURCE ACCURACY (CRITICAL) ===
- ONLY create units for topics EXPLICITLY in the document
- Use the document's own terminology and section headings
- Do NOT invent or assume topics not in the source

=== INTELLIGENT UNIT TYPES ===
Mark each unit with its type for smart content generation:

1. **intro** - Course introduction/overview (NO quizzes, NO complex diagrams)
   - Hook the learner immediately — why should they care?
   - Course goals, what you'll be able to DO after this

2. **concept** - Teaching new concepts (diagrams helpful, quizzes appropriate)
   - Definitions, explanations, theory
   - Diagrams: flowcharts, mind maps for relationships

3. **process** - Step-by-step procedures (diagrams essential, quizzes appropriate)
   - How-to content, workflows, algorithms
   - Diagrams: flowcharts, sequence diagrams

4. **application** - Practical examples/case studies (diagrams optional, quizzes appropriate)
   - Real-world scenarios, examples
   - Diagrams only if they clarify the example

5. **summary** - Review/conclusion (NO quizzes in final summary, recap diagram optional)
   - Key takeaways, next steps
   - Light content, no testing

=== ENGAGEMENT TYPES ===
Assign an engagementType to each unit to vary pacing:
- **story**: Open with a narrative or real-world scenario
- **challenge**: Open with a problem to solve or a question to ponder
- **visual**: Lead with a diagram or visual metaphor
- **explore**: Let the learner discover the concept through guided exploration

=== STRUCTURE ===
- Create 3-8 units based on document sections
- First unit should be "intro" type (brief, hooks the learner)
- Last unit can be "summary" type if document has conclusion
- Core units: "concept", "process", or "application" based on content
- Each unit: 8-15 minutes
- VARY engagement types — don't repeat the same type consecutively

OUTPUT FORMAT (JSON only):
{
  "title": "Course title (max 50 chars)",
  "description": "One engaging sentence",
  "difficulty": "beginner|intermediate|advanced",
  "estimatedMinutes": <total>,
  "units": [
    {
      "title": "Unit title",
      "description": "What this unit covers",
      "orderIndex": 0,
      "lessonCount": 1,
      "unitType": "intro|concept|process|application|summary",
      "engagementType": "story|challenge|visual|explore",
      "hook": "An engaging opener question or surprising fact for this unit",
      "keyTakeaway": "One sentence: the single most important thing to remember",
      "needsDiagram": true/false,
      "needsQuiz": true/false
    }
  ]
}

DOCUMENT:
`

const UNIT_CONTENT_PROMPT = `You are CogniLeap's content writer. You create micro-learning content that grabs attention and never lets go.

=== UNIT CONTEXT ===
Unit Type: {unitType}
Needs Diagram: {needsDiagram}
Needs Quiz: {needsQuiz}

=== ATTENTION RULES (EVERY STEP MUST FOLLOW THESE) ===
1. **START strong** — every step opens with a hook: a bold statement, a question, a "Did you know?", or a surprising fact
2. **ONE concept per step** — never overload
3. **Use analogies** — relate every abstract concept to something concrete and real-world
4. **Bold key terms** — make scanning easy
5. **Use callout types** for variety:
   - 💡 **Did You Know?** — surprising facts for dopamine hits
   - ⚡ **Pro Tip** — advanced insights or shortcuts
   - ⚠️ **Common Mistake** — what most people get wrong
   - 📌 **Key Point** — the essential takeaway

=== CONTENT RULES BY UNIT TYPE ===

**intro** (Introduction units):
- 3-4 content steps that hook the learner immediately
- NO quizzes - this is orientation only
- NO complex diagrams - maybe a simple overview visual
- Confident, direct tone — tell them exactly what they'll master
- Focus: Why this matters, what you'll be able to DO

**concept** (Theory/Definition units):
- 4-5 content steps explaining the concept with real-world analogies
- 1-2 quizzes — scenario-based, not just recall
- Diagrams: mind maps or flowcharts showing relationships
- Include at least one "Did You Know?" callout
- Focus: Clear explanations with concrete examples

**process** (How-to/Procedure units):
- 4-6 content steps walking through the process
- 1-2 quizzes on applying the steps to a scenario
- Diagrams: flowcharts or sequence diagrams (ESSENTIAL)
- Include a "Common Mistake" callout
- Focus: Step-by-step clarity with practical context

**application** (Examples/Case Studies):
- 3-5 content steps with real, vivid examples
- 1-2 quizzes that present new scenarios to solve
- Diagrams: only if they clarify the example
- Include a "Pro Tip" callout
- Focus: Practical understanding through stories

**summary** (Review/Conclusion):
- 2-3 recap content steps
- NO quizzes - this is reflection only
- Maybe one recap diagram summarizing key points
- Focus: Key takeaways, what to remember, next steps

=== QUIZ DESIGN (when needsQuiz is true) ===
- Questions must be **scenario-based**: "Imagine you're..." or "A company needs to..."
- NEVER just ask "What is X?" — ask "When would you use X?" or "What happens if X fails?"
- 4 options, one clearly correct
- Explanation must include **why** the correct answer works AND why one popular wrong answer fails
- Reference concepts from earlier units when possible (spaced repetition)

=== CONTENT FORMATTING ===
- 60-120 words per step
- ONE concept per step
- Use bullet points for clarity
- **Bold** key terms on first use
- Use blockquotes (>) for insights and callouts

=== DIAGRAM STYLING (when needed) ===
Use soft pastel colors, keep it SIMPLE (max 6 nodes):
\`\`\`mermaid
flowchart TD
    A[Input]:::input --> B[Process]:::process
    B --> C[Output]:::output

    classDef input fill:#e0e7ff,stroke:#818cf8,stroke-width:2px
    classDef process fill:#ddd6fe,stroke:#8b5cf6,stroke-width:2px
    classDef output fill:#d1fae5,stroke:#34d399,stroke-width:2px
\`\`\`

=== SOURCE ACCURACY ===
- ONLY use facts from SOURCE CONTENT below
- Do NOT invent information

OUTPUT FORMAT (JSON only):
{
  "title": "Unit title",
  "description": "Brief description",
  "steps": [
    {
      "type": "content",
      "title": "Topic Title",
      "content": "💡 **Did You Know?** Most people think X, but actually...\\n\\n**Key Term** means...\\n\\n> This matters because..."
    }
  ]
}

NOTE: Only include quiz steps if needsQuiz is true. Only include diagrams if needsDiagram is true.

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
        
        // Determine unit type defaults if not specified
        const unitType = unit.unitType || (unit.orderIndex === 0 ? 'intro' : 'concept')
        const needsDiagram = unit.needsDiagram ?? (unitType !== 'intro' && unitType !== 'summary')
        const needsQuiz = unit.needsQuiz ?? (unitType !== 'intro' && unitType !== 'summary')
        
        // Generate unit content with smart parameters
        const prompt = UNIT_CONTENT_PROMPT
          .replace('{unitTitle}', unit.title)
          .replace('{unitDescription}', unit.description)
          .replace('{unitType}', unitType)
          .replace('{needsDiagram}', String(needsDiagram))
          .replace('{needsQuiz}', String(needsQuiz))
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
        
        // Insert quiz questions only if this unit type needs quizzes
        if (needsQuiz && quizSteps.length > 0) {
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
