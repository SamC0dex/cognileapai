/**
 * Course Generation Manager - Multi-Phase AI Generation Orchestrator
 *
 * Handles the complete course generation workflow with intelligent batching,
 * model fallback, progress tracking, and error recovery.
 *
 * Architecture:
 * - Phase A: Generate course outline (1 request)
 * - Phase B: Generate lesson content in batches (multiple requests)
 * - Phase C: Generate quizzes in batches (multiple requests)
 * - Phase D: Finalization and cleanup
 *
 * Features:
 * - Token-based intelligent batching
 * - Multi-model fallback (Pro → Flash → Flash-Lite)
 * - Progress tracking with database updates
 * - Automatic retry with exponential backoff
 * - Graceful error handling
 */

import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import {
  COURSE_PROMPTS,
  fillPromptTemplate,
  estimatePagesFromLength,
  estimateTokens,
  calculateLessonBatchSize
} from './course-prompts'

// ============================================
// Types & Interfaces
// ============================================

export interface ModelConfig {
  name: string
  maxInputTokens: number
  maxOutputTokens: number
  temperature: number
  topK: number
  maxRetries: number
}

export interface GenerationProgress {
  phase: 'outline' | 'lessons' | 'quizzes' | 'verification' | 'finalizing' | 'complete' | 'error'
  percentage: number
  currentStep: string
  error?: string
  batchInfo?: {
    currentBatch: number
    totalBatches: number
    itemsInBatch: number
  }
  verificationResults?: {
    passed: boolean
    issues: string[]
    suggestions: string[]
  }
}

export interface CourseOutline {
  courseTitle: string
  courseDescription: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedHours: number
  totalLessons: number
  totalChapters: number
  chapters: ChapterOutline[]
}

export interface ChapterOutline {
  title: string
  description: string
  orderIndex: number
  lessons: LessonOutline[]
}

export interface LessonOutline {
  title: string
  description: string
  learningObjective: string
  estimatedMinutes: number
  orderIndex: number
  lessonNumber: string
  plannedDiagrams: Array<{
    type: string
    title: string
    description: string
  }>
}

export interface LessonContent {
  lessonId: string
  title: string
  contentMarkdown: string
  estimatedMinutes: number
  completed: boolean
}

export interface QuizSet {
  lessonId: string
  lessonTitle: string
  questions: QuizQuestion[]
}

export interface QuizQuestion {
  question: string
  questionType: 'multiple_choice'
  options: string[]
  correctAnswer: string
  explanation: string
  incorrectFeedback: string
  difficulty: 'easy' | 'medium' | 'hard'
  orderIndex: number
}

export interface GenerationOptions {
  documentId: string
  userId: string
  documentContent: string
  documentTitle: string
  customInstructions?: string
  onProgress?: (progress: GenerationProgress) => void
}

export interface RetryConfig {
  maxRetries: number
  delaysMs: number[]
}

// ============================================
// Error Types
// ============================================

export class CourseGenerationError extends Error {
  constructor(
    message: string,
    public phase: GenerationProgress['phase'],
    public retryable: boolean = true
  ) {
    super(message)
    this.name = 'CourseGenerationError'
  }
}

export class AllModelsOverloadedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AllModelsOverloadedError'
  }
}

// ============================================
// Course Generation Manager
// ============================================

export class CourseGenerationManager {
  private genai: GoogleGenAI
  private supabase: ReturnType<typeof createClient>
  private currentProgress: GenerationProgress

  // Model hierarchy (fallback chain)
  private readonly MODEL_HIERARCHY: ModelConfig[] = [
    {
      name: 'gemini-2.5-pro',
      maxInputTokens: 1000000,
      maxOutputTokens: 65536,
      temperature: 0.7,
      topK: 40,
      maxRetries: 3
    },
    {
      name: 'gemini-2.5-flash',
      maxInputTokens: 1000000,
      maxOutputTokens: 65536,
      temperature: 0.75,
      topK: 35,
      maxRetries: 3
    },
    {
      name: 'gemini-2.5-flash-lite',
      maxInputTokens: 1000000,
      maxOutputTokens: 32768,
      temperature: 0.8,
      topK: 30,
      maxRetries: 2
    }
  ]

  // Retry strategies by error type
  private readonly RETRY_STRATEGIES: Record<string, RetryConfig> = {
    overloaded: { maxRetries: 3, delaysMs: [15000, 30000, 60000] },
    rate_limit: { maxRetries: 2, delaysMs: [60000, 120000] },
    internal_error: { maxRetries: 2, delaysMs: [30000, 45000] },
    timeout: { maxRetries: 2, delaysMs: [15000, 30000] },
    network: { maxRetries: 2, delaysMs: [15000, 30000] }
  }

  constructor(apiKey: string, supabaseUrl: string, supabaseKey: string) {
    this.genai = new GoogleGenAI({ apiKey })
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.currentProgress = {
      phase: 'outline',
      percentage: 0,
      currentStep: 'Initializing...'
    }
  }

  /**
   * Main entry point - Generate complete course from document
   */
  async generateCourse(options: GenerationOptions): Promise<string> {
    const { documentId, userId, documentContent, documentTitle, customInstructions, onProgress } = options

    try {
      // Create initial course record with 'generating' status
      const courseId = await this.createCourseRecord(userId, documentId, documentTitle)

      // Phase A: Generate Course Outline
      const outline = await this.generateCourseOutline({
        documentContent,
        documentTitle,
        customInstructions,
        courseId,
        onProgress
      })

      // Save outline to database (chapters structure)
      await this.saveOutlineToDatabase(courseId, outline)

      // Phase B: Generate Lesson Content (batched)
      await this.generateAllLessons({
        courseId,
        outline,
        documentContent,
        customInstructions,
        onProgress
      })

      // Phase C: Generate Quizzes (batched)
      await this.generateAllQuizzes({
        courseId,
        outline,
        customInstructions,
        onProgress
      })

      // Phase D: Quality Verification (NEW)
      await this.verifyCourseQuality({
        courseId,
        outline,
        onProgress
      })

      // Phase E: Finalize course
      await this.finalizeCourse(courseId, onProgress)

      return courseId

    } catch (error) {
      console.error('[CourseGeneration] Fatal error:', error)
      throw error
    }
  }

  // ============================================
  // PHASE A: Course Outline Generation
  // ============================================

  private async generateCourseOutline(params: {
    documentContent: string
    documentTitle: string
    customInstructions?: string
    courseId: string
    onProgress?: (progress: GenerationProgress) => void
  }): Promise<CourseOutline> {
    const { documentContent, documentTitle, customInstructions, courseId, onProgress } = params

    this.updateProgress({
      phase: 'outline',
      percentage: 5,
      currentStep: 'Analyzing document structure...'
    }, onProgress)

    // Prepare prompt
    const userPrompt = fillPromptTemplate(COURSE_PROMPTS.courseOutline.userPrompt, {
      documentTitle,
      documentLength: documentContent.length.toString(),
      estimatedPages: estimatePagesFromLength(documentContent.length).toString(),
      documentContent: documentContent.slice(0, 150000), // First 150K chars for outline
      customInstructions: customInstructions || 'None'
    })

    // Generate outline with fallback
    const outlineText = await this.generateWithFallback({
      systemPrompt: COURSE_PROMPTS.courseOutline.systemPrompt,
      userPrompt,
      outputTokens: 32768, // Generous allocation for outline
      courseId,
      phase: 'outline'
    })

    this.updateProgress({
      phase: 'outline',
      percentage: 15,
      currentStep: 'Parsing course structure...'
    }, onProgress)

    // Parse JSON response
    let outline: CourseOutline
    try {
      // Clean the response (remove markdown code blocks if present)
      const cleanedText = outlineText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      outline = JSON.parse(cleanedText)
    } catch (parseError) {
      console.error('[CourseGeneration] Failed to parse outline JSON:', parseError)
      throw new CourseGenerationError('Failed to parse course outline', 'outline', true)
    }

    this.updateProgress({
      phase: 'outline',
      percentage: 20,
      currentStep: `Created ${outline.totalChapters} chapters with ${outline.totalLessons} lessons`
    }, onProgress)

    return outline
  }

  // ============================================
  // PHASE B: Lesson Content Generation (Batched)
  // ============================================

  private async generateAllLessons(params: {
    courseId: string
    outline: CourseOutline
    documentContent: string
    customInstructions?: string
    onProgress?: (progress: GenerationProgress) => void
  }): Promise<void> {
    const { courseId, outline, documentContent, customInstructions, onProgress } = params

    // Calculate batching strategy
    const { batchSize, totalBatches } = calculateLessonBatchSize(
      outline.totalLessons,
      documentContent
    )

    console.log(`[CourseGeneration] Lesson generation: ${outline.totalLessons} lessons in ${totalBatches} batches (${batchSize} per batch)`)

    // Flatten all lessons across chapters
    const allLessons: Array<{ lesson: LessonOutline; chapterTitle: string; chapterDescription: string; chapterId: string }> = []

    for (const chapter of outline.chapters) {
      // Get chapter ID from database
      const { data: chapterRecord } = await this.supabase
        .from('chapters')
        .select('id')
        .eq('course_id', courseId)
        .eq('order_index', chapter.orderIndex)
        .single()

      if (!chapterRecord) {
        throw new CourseGenerationError(`Chapter not found: ${chapter.title}`, 'lessons', true)
      }

      for (const lesson of chapter.lessons) {
        allLessons.push({
          lesson,
          chapterTitle: chapter.title,
          chapterDescription: chapter.description,
          chapterId: chapterRecord.id
        })
      }
    }

    // Generate lessons in batches
    let completedLessons = 0

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * batchSize
      const endIdx = Math.min(startIdx + batchSize, allLessons.length)
      const batchLessons = allLessons.slice(startIdx, endIdx)

      const basePercentage = 20 + Math.floor((completedLessons / outline.totalLessons) * 60)

      this.updateProgress({
        phase: 'lessons',
        percentage: basePercentage,
        currentStep: `Generating lessons ${startIdx + 1}-${endIdx}...`,
        batchInfo: {
          currentBatch: batchIndex + 1,
          totalBatches,
          itemsInBatch: batchLessons.length
        }
      }, onProgress)

      // Prepare batch prompt
      const lessonsOutline = JSON.stringify(batchLessons.map(l => l.lesson), null, 2)
      const sourceContent = this.extractRelevantContent(documentContent, startIdx, endIdx, outline.totalLessons)

      const userPrompt = fillPromptTemplate(COURSE_PROMPTS.lessonBatch.userPrompt, {
        lessonsOutline,
        sourceContent,
        chapterTitle: batchLessons[0].chapterTitle,
        chapterDescription: batchLessons[0].chapterDescription,
        customInstructions: customInstructions || 'None'
      })

      // Generate lesson batch
      const batchResponseText = await this.generateWithFallback({
        systemPrompt: COURSE_PROMPTS.lessonBatch.systemPrompt,
        userPrompt,
        outputTokens: batchLessons.length * 8192, // 8K tokens per lesson
        courseId,
        phase: 'lessons'
      })

      // Parse and save lessons
      const lessonContents = this.parseLessonBatch(batchResponseText)
      await this.saveLessonBatch(courseId, batchLessons, lessonContents)

      completedLessons += batchLessons.length

      // Update progress after batch
      const progressPercentage = 20 + Math.floor((completedLessons / outline.totalLessons) * 60)
      this.updateProgress({
        phase: 'lessons',
        percentage: progressPercentage,
        currentStep: `Completed ${completedLessons}/${outline.totalLessons} lessons`
      }, onProgress)

      // Small delay between batches to respect rate limits
      if (batchIndex < totalBatches - 1) {
        await this.delay(2000)
      }
    }
  }

  // ============================================
  // PHASE C: Quiz Generation (Batched)
  // ============================================

  private async generateAllQuizzes(params: {
    courseId: string
    outline: CourseOutline
    customInstructions?: string
    onProgress?: (progress: GenerationProgress) => void
  }): Promise<void> {
    const { courseId, outline, customInstructions, onProgress } = params

    // Fetch all lessons from database to get IDs and content
    const { data: lessons } = await this.supabase
      .from('lessons')
      .select('id, title, learning_objective, content_markdown')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })

    if (!lessons || lessons.length === 0) {
      throw new CourseGenerationError('No lessons found for quiz generation', 'quizzes', true)
    }

    // Generate quizzes in batches of 5-10 lessons
    const quizBatchSize = 8
    const totalBatches = Math.ceil(lessons.length / quizBatchSize)

    console.log(`[CourseGeneration] Quiz generation: ${lessons.length} quizzes in ${totalBatches} batches`)

    let completedQuizzes = 0

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * quizBatchSize
      const endIdx = Math.min(startIdx + quizBatchSize, lessons.length)
      const batchLessons = lessons.slice(startIdx, endIdx)

      const basePercentage = 80 + Math.floor((completedQuizzes / lessons.length) * 15)

      this.updateProgress({
        phase: 'quizzes',
        percentage: basePercentage,
        currentStep: `Generating quizzes ${startIdx + 1}-${endIdx}...`,
        batchInfo: {
          currentBatch: batchIndex + 1,
          totalBatches,
          itemsInBatch: batchLessons.length
        }
      }, onProgress)

      // Prepare batch prompt
      const lessonsInfo = JSON.stringify(
        batchLessons.map(l => ({
          lessonId: l.id,
          lessonTitle: l.title,
          learningObjective: l.learning_objective,
          contentSummary: l.content_markdown.slice(0, 500) // First 500 chars
        })),
        null,
        2
      )

      const userPrompt = fillPromptTemplate(COURSE_PROMPTS.quizBatch.userPrompt, {
        lessonsInfo,
        customInstructions: customInstructions || 'None'
      })

      // Generate quiz batch
      const batchResponseText = await this.generateWithFallback({
        systemPrompt: COURSE_PROMPTS.quizBatch.systemPrompt,
        userPrompt,
        outputTokens: batchLessons.length * 4096, // 4K tokens per quiz set
        courseId,
        phase: 'quizzes'
      })

      // Parse and save quizzes
      const quizSets = this.parseQuizBatch(batchResponseText)
      await this.saveQuizBatch(quizSets)

      completedQuizzes += batchLessons.length

      // Update progress after batch
      const progressPercentage = 80 + Math.floor((completedQuizzes / lessons.length) * 15)
      this.updateProgress({
        phase: 'quizzes',
        percentage: progressPercentage,
        currentStep: `Completed ${completedQuizzes}/${lessons.length} quiz sets`
      }, onProgress)

      // Small delay between batches
      if (batchIndex < totalBatches - 1) {
        await this.delay(2000)
      }
    }
  }

  // ============================================
  // PHASE D: Quality Verification (Using Gemini 2.5 Flash Lite)
  // ============================================

  private async verifyCourseQuality(params: {
    courseId: string
    outline: CourseOutline
    onProgress?: (progress: GenerationProgress) => void
  }): Promise<void> {
    const { courseId, outline, onProgress } = params

    this.updateProgress({
      phase: 'verification',
      percentage: 90,
      currentStep: 'Running quality assurance checks...'
    }, onProgress)

    // Fetch all lessons and quizzes for verification
    const { data: lessons } = await this.supabase
      .from('lessons')
      .select('id, title, content_markdown, estimated_minutes')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })

    const { data: quizzes } = await this.supabase
      .from('lesson_quizzes')
      .select('lesson_id, question, correct_answer, explanation')
      .in('lesson_id', lessons?.map(l => l.id) || [])

    if (!lessons || lessons.length === 0) {
      console.warn('[CourseGeneration] No lessons found for verification')
      return
    }

    // Create verification prompt
    const verificationPrompt = `You are a Quality Assurance Agent for educational course generation. Your role is to verify that a generated course meets quality standards.

Course Information:
- Title: ${outline.courseTitle}
- Total Chapters: ${outline.totalChapters}
- Total Lessons: ${outline.totalLessons}
- Difficulty: ${outline.difficulty}

Generated Content Summary:
- ${lessons.length} lessons created
- ${quizzes?.length || 0} quiz questions generated

Verification Criteria:
1. COMPLETENESS: Are all lessons generated with adequate content?
2. ADHD-FRIENDLY FORMATTING: Check if content uses short paragraphs, clear headings, and is easy to scan
3. LESSON QUALITY: Do lessons have clear learning objectives and well-structured content?
4. QUIZ QUALITY: Are quiz questions relevant, clear, and have good explanations?
5. COHERENCE: Does the course flow logically from one lesson to the next?
6. ESTIMATED TIME: Are lesson durations reasonable (not too short or too long)?

Sample Lesson Content (first 3 lessons):
${JSON.stringify(lessons.slice(0, 3).map(l => ({
  title: l.title,
  contentPreview: l.content_markdown.slice(0, 500),
  estimatedMinutes: l.estimated_minutes
})), null, 2)}

Sample Quiz Questions (first 5):
${JSON.stringify(quizzes?.slice(0, 5).map(q => ({
  question: q.question,
  answer: q.correct_answer,
  explanation: q.explanation
})), null, 2)}

TASK: Analyze the course and provide a JSON response with the following structure:
{
  "passed": true/false,
  "overallQuality": "excellent/good/fair/poor",
  "issues": ["list of specific issues found"],
  "suggestions": ["list of improvement suggestions"],
  "strengths": ["list of what was done well"],
  "adhdFriendliness": "excellent/good/fair/poor",
  "completenessScore": 0-100,
  "coherenceScore": 0-100
}

Provide your verification results:`

    try {
      // Use Gemini 2.5 Flash Lite specifically for QA (fast and cost-effective)
      const response = await this.genai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{
          role: 'user',
          parts: [{ text: verificationPrompt }]
        }],
        config: {
          temperature: 0.3, // Lower temperature for more consistent evaluation
          maxOutputTokens: 4096,
          topK: 20
        }
      })

      const responseText = response.text

      // Parse verification results
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const verificationResults = JSON.parse(cleaned)

      console.log('[CourseGeneration] QA Results:', verificationResults)

      // Update progress with verification results
      this.updateProgress({
        phase: 'verification',
        percentage: 95,
        currentStep: `Quality check ${verificationResults.passed ? 'passed' : 'completed'} - ${verificationResults.overallQuality} quality`,
        verificationResults: {
          passed: verificationResults.passed,
          issues: verificationResults.issues || [],
          suggestions: verificationResults.suggestions || []
        }
      }, onProgress)

      // Store verification results in course metadata
      await this.supabase
        .from('courses')
        .update({
          metadata: {
            verificationResults,
            verifiedAt: new Date().toISOString(),
            qaModel: 'gemini-2.5-flash-lite'
          }
        })
        .eq('id', courseId)

      // Log warnings if quality is not excellent
      if (verificationResults.overallQuality !== 'excellent') {
        console.warn('[CourseGeneration] Quality issues detected:', verificationResults.issues)
      }

    } catch (error) {
      console.error('[CourseGeneration] Verification failed:', error)
      // Don't fail the entire generation if verification fails
      this.updateProgress({
        phase: 'verification',
        percentage: 95,
        currentStep: 'Quality verification skipped (error occurred)'
      }, onProgress)
    }
  }

  // ============================================
  // PHASE E: Finalization
  // ============================================

  private async finalizeCourse(courseId: string, onProgress?: (progress: GenerationProgress) => void): Promise<void> {
    this.updateProgress({
      phase: 'finalizing',
      percentage: 95,
      currentStep: 'Finalizing course...'
    }, onProgress)

    // Update course status to 'ready'
    await this.supabase
      .from('courses')
      .update({
        status: 'ready',
        generation_progress: {
          phase: 'complete',
          percentage: 100,
          currentStep: 'Course ready!',
          completedAt: new Date().toISOString()
        }
      })
      .eq('id', courseId)

    this.updateProgress({
      phase: 'complete',
      percentage: 100,
      currentStep: 'Course generation complete!'
    }, onProgress)

    console.log(`[CourseGeneration] Course ${courseId} generation complete!`)
  }

  // ============================================
  // AI Generation with Model Fallback
  // ============================================

  private async generateWithFallback(params: {
    systemPrompt: string
    userPrompt: string
    outputTokens: number
    courseId: string
    phase: GenerationProgress['phase']
  }): Promise<string> {
    const { systemPrompt, userPrompt, outputTokens, courseId, phase } = params

    // Calculate input tokens
    const estimatedInputTokens = estimateTokens(systemPrompt + userPrompt)

    let lastError: Error | null = null

    // Try each model in hierarchy
    for (const modelConfig of this.MODEL_HIERARCHY) {
      // Check if content fits in this model
      if (estimatedInputTokens > modelConfig.maxInputTokens) {
        console.log(`[CourseGeneration] Content too large for ${modelConfig.name}, trying next model...`)
        continue
      }

      // Attempt generation with retries
      for (let attempt = 0; attempt < modelConfig.maxRetries; attempt++) {
        try {
          console.log(`[CourseGeneration] Attempting ${modelConfig.name} (attempt ${attempt + 1}/${modelConfig.maxRetries})`)

          const response = await this.genai.models.generateContent({
            model: modelConfig.name,
            contents: [{
              role: 'user',
              parts: [{ text: systemPrompt + '\n\n' + userPrompt }]
            }],
            config: {
              temperature: modelConfig.temperature,
              maxOutputTokens: Math.min(outputTokens, modelConfig.maxOutputTokens),
              topK: modelConfig.topK
            }
          })

          const responseText = response.text

          if (!responseText || responseText.trim().length < 100) {
            throw new Error('Response too short or empty')
          }

          console.log(`[CourseGeneration] Success with ${modelConfig.name}`)
          return responseText

        } catch (error: any) {
          console.error(`[CourseGeneration] Error with ${modelConfig.name}:`, error.message)
          lastError = error

          // Classify error
          const errorType = this.classifyError(error)

          // If model is overloaded, skip to next model immediately
          if (errorType === 'overloaded') {
            console.log(`[CourseGeneration] ${modelConfig.name} overloaded, trying next model`)
            break // Break inner retry loop, move to next model
          }

          // For other errors, retry if we have attempts left
          if (attempt < modelConfig.maxRetries - 1) {
            const delay = this.RETRY_STRATEGIES[errorType]?.delaysMs[attempt] || 15000
            console.log(`[CourseGeneration] Retrying in ${delay}ms...`)
            await this.delay(delay)
          }
        }
      }
    }

    // All models failed
    console.error('[CourseGeneration] All models failed')

    // Update course status to error
    await this.supabase
      .from('courses')
      .update({
        status: 'error',
        generation_progress: {
          phase,
          percentage: this.currentProgress.percentage,
          currentStep: 'Generation failed',
          error: lastError?.message || 'Unknown error'
        }
      })
      .eq('id', courseId)

    throw new AllModelsOverloadedError('All AI models are currently overloaded. Please try again in a few minutes.')
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async createCourseRecord(userId: string, documentId: string, title: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('courses')
      .insert({
        user_id: userId,
        document_id: documentId,
        title: `Course: ${title}`,
        status: 'generating',
        generation_progress: {
          phase: 'outline',
          percentage: 0,
          currentStep: 'Starting generation...'
        }
      })
      .select('id')
      .single()

    if (error || !data) {
      throw new CourseGenerationError('Failed to create course record', 'outline', false)
    }

    // Initialize user progress record
    await this.supabase
      .from('user_course_progress')
      .insert({
        user_id: userId,
        course_id: data.id,
        completion_percentage: 0,
        lessons_completed: 0,
        total_time_seconds: 0
      })

    return data.id
  }

  private async saveOutlineToDatabase(courseId: string, outline: CourseOutline): Promise<void> {
    // Update course metadata
    await this.supabase
      .from('courses')
      .update({
        title: outline.courseTitle,
        description: outline.courseDescription,
        difficulty: outline.difficulty,
        estimated_hours: outline.estimatedHours,
        total_lessons: outline.totalLessons,
        total_chapters: outline.totalChapters
      })
      .eq('id', courseId)

    // Insert chapters (lessons will be added later)
    for (const chapter of outline.chapters) {
      await this.supabase
        .from('chapters')
        .insert({
          course_id: courseId,
          title: chapter.title,
          description: chapter.description,
          order_index: chapter.orderIndex
        })
    }
  }

  private async saveLessonBatch(
    courseId: string,
    lessonMeta: Array<{ lesson: LessonOutline; chapterId: string }>,
    lessonContents: LessonContent[]
  ): Promise<void> {
    for (let i = 0; i < lessonMeta.length; i++) {
      const meta = lessonMeta[i]
      const content = lessonContents[i]

      if (!content) {
        console.warn(`[CourseGeneration] Missing content for lesson: ${meta.lesson.title}`)
        continue
      }

      await this.supabase
        .from('lessons')
        .insert({
          course_id: courseId,
          chapter_id: meta.chapterId,
          title: meta.lesson.title,
          description: meta.lesson.description,
          learning_objective: meta.lesson.learningObjective,
          content_markdown: content.contentMarkdown,
          estimated_minutes: meta.lesson.estimatedMinutes,
          order_index: meta.lesson.orderIndex,
          lesson_number: meta.lesson.lessonNumber,
          images: [],
          interactive_elements: {},
          videos: []
        })
    }
  }

  private async saveQuizBatch(quizSets: QuizSet[]): Promise<void> {
    for (const quizSet of quizSets) {
      for (const question of quizSet.questions) {
        await this.supabase
          .from('lesson_quizzes')
          .insert({
            lesson_id: quizSet.lessonId,
            question: question.question,
            question_type: question.questionType,
            options: question.options,
            correct_answer: question.correctAnswer,
            explanation: question.explanation,
            difficulty: question.difficulty,
            order_index: question.orderIndex
          })
      }
    }
  }

  private parseLessonBatch(responseText: string): LessonContent[] {
    // Strategy 1: Standard JSON parsing
    try {
      let cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (jsonArrayMatch) {
        cleaned = jsonArrayMatch[0]
      }
      console.log('[CourseGeneration] Strategy 1: Standard parsing, length:', cleaned.length)
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        console.log('[CourseGeneration] ✓ Strategy 1 succeeded')
        return parsed
      }
    } catch (error) {
      console.log('[CourseGeneration] ✗ Strategy 1 failed:', error instanceof Error ? error.message : String(error))
    }

    // Strategy 2: Fix common JSON issues
    try {
      let cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (jsonArrayMatch) {
        cleaned = jsonArrayMatch[0]
      }

      // Fix trailing commas
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')
      // Fix unescaped newlines in strings
      cleaned = cleaned.replace(/([^\\])(\\n)/g, '$1\\\\n')
      // Remove any BOMs or special characters
      cleaned = cleaned.replace(/^\uFEFF/, '')

      console.log('[CourseGeneration] Strategy 2: Fixed common issues')
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        console.log('[CourseGeneration] ✓ Strategy 2 succeeded')
        return parsed
      }
    } catch (error) {
      console.log('[CourseGeneration] ✗ Strategy 2 failed:', error instanceof Error ? error.message : String(error))
    }

    // Strategy 3: Incremental parsing - extract valid objects one by one
    try {
      console.log('[CourseGeneration] Strategy 3: Incremental parsing')
      let cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      // Find the array start
      const arrayStart = cleaned.indexOf('[')
      if (arrayStart === -1) throw new Error('No array found')

      const lessons: LessonContent[] = []
      let depth = 0
      let currentObject = ''
      let inString = false
      let escapeNext = false

      for (let i = arrayStart + 1; i < cleaned.length; i++) {
        const char = cleaned[i]

        if (escapeNext) {
          currentObject += char
          escapeNext = false
          continue
        }

        if (char === '\\') {
          currentObject += char
          escapeNext = true
          continue
        }

        if (char === '"' && !escapeNext) {
          inString = !inString
          currentObject += char
          continue
        }

        if (inString) {
          currentObject += char
          continue
        }

        if (char === '{') {
          if (depth === 0) {
            currentObject = '{'
          } else {
            currentObject += char
          }
          depth++
          continue
        }

        if (char === '}') {
          depth--
          currentObject += char

          if (depth === 0 && currentObject.trim()) {
            try {
              const lesson = JSON.parse(currentObject)
              if (lesson && typeof lesson === 'object' && 'lessonId' in lesson) {
                lessons.push(lesson as LessonContent)
              }
            } catch (e) {
              console.log('[CourseGeneration] Skipping malformed object at position', i)
            }
            currentObject = ''
          }
          continue
        }

        if (char === ']' && depth === 0) {
          break
        }

        if (depth > 0) {
          currentObject += char
        }
      }

      if (lessons.length > 0) {
        console.log('[CourseGeneration] ✓ Strategy 3 succeeded, extracted', lessons.length, 'lessons')
        return lessons
      }
    } catch (error) {
      console.log('[CourseGeneration] ✗ Strategy 3 failed:', error instanceof Error ? error.message : String(error))
    }

    // All strategies failed
    console.error('[CourseGeneration] All parsing strategies failed')
    console.error('[CourseGeneration] Response text sample:', responseText.substring(0, 500))
    console.error('[CourseGeneration] Response text end:', responseText.substring(Math.max(0, responseText.length - 500)))
    throw new CourseGenerationError('Failed to parse lesson content after trying all strategies', 'lessons', true)
  }

  private parseQuizBatch(responseText: string): QuizSet[] {
    // Strategy 1: Standard JSON parsing
    try {
      let cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (jsonArrayMatch) {
        cleaned = jsonArrayMatch[0]
      }
      console.log('[CourseGeneration] Quiz Strategy 1: Standard parsing, length:', cleaned.length)
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        console.log('[CourseGeneration] ✓ Quiz Strategy 1 succeeded')
        return parsed
      }
    } catch (error) {
      console.log('[CourseGeneration] ✗ Quiz Strategy 1 failed:', error instanceof Error ? error.message : String(error))
    }

    // Strategy 2: Fix common JSON issues
    try {
      let cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (jsonArrayMatch) {
        cleaned = jsonArrayMatch[0]
      }

      // Fix trailing commas
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')
      // Fix unescaped newlines in strings
      cleaned = cleaned.replace(/([^\\])(\\n)/g, '$1\\\\n')
      // Remove any BOMs or special characters
      cleaned = cleaned.replace(/^\uFEFF/, '')

      console.log('[CourseGeneration] Quiz Strategy 2: Fixed common issues')
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        console.log('[CourseGeneration] ✓ Quiz Strategy 2 succeeded')
        return parsed
      }
    } catch (error) {
      console.log('[CourseGeneration] ✗ Quiz Strategy 2 failed:', error instanceof Error ? error.message : String(error))
    }

    // Strategy 3: Incremental parsing - extract valid objects one by one
    try {
      console.log('[CourseGeneration] Quiz Strategy 3: Incremental parsing')
      let cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      const arrayStart = cleaned.indexOf('[')
      if (arrayStart === -1) throw new Error('No array found')

      const quizSets: QuizSet[] = []
      let depth = 0
      let currentObject = ''
      let inString = false
      let escapeNext = false

      for (let i = arrayStart + 1; i < cleaned.length; i++) {
        const char = cleaned[i]

        if (escapeNext) {
          currentObject += char
          escapeNext = false
          continue
        }

        if (char === '\\') {
          currentObject += char
          escapeNext = true
          continue
        }

        if (char === '"' && !escapeNext) {
          inString = !inString
          currentObject += char
          continue
        }

        if (inString) {
          currentObject += char
          continue
        }

        if (char === '{') {
          if (depth === 0) {
            currentObject = '{'
          } else {
            currentObject += char
          }
          depth++
          continue
        }

        if (char === '}') {
          depth--
          currentObject += char

          if (depth === 0 && currentObject.trim()) {
            try {
              const quiz = JSON.parse(currentObject)
              if (quiz && typeof quiz === 'object' && 'lessonId' in quiz) {
                quizSets.push(quiz as QuizSet)
              }
            } catch (e) {
              console.log('[CourseGeneration] Skipping malformed quiz object at position', i)
            }
            currentObject = ''
          }
          continue
        }

        if (char === ']' && depth === 0) {
          break
        }

        if (depth > 0) {
          currentObject += char
        }
      }

      if (quizSets.length > 0) {
        console.log('[CourseGeneration] ✓ Quiz Strategy 3 succeeded, extracted', quizSets.length, 'quiz sets')
        return quizSets
      }
    } catch (error) {
      console.log('[CourseGeneration] ✗ Quiz Strategy 3 failed:', error instanceof Error ? error.message : String(error))
    }

    // All strategies failed
    console.error('[CourseGeneration] All quiz parsing strategies failed')
    console.error('[CourseGeneration] Response text sample:', responseText.substring(0, 500))
    console.error('[CourseGeneration] Response text end:', responseText.substring(Math.max(0, responseText.length - 500)))
    throw new CourseGenerationError('Failed to parse quiz content after trying all strategies', 'quizzes', true)
  }

  private extractRelevantContent(fullContent: string, startIdx: number, endIdx: number, totalLessons: number): string {
    // Calculate which portion of the document corresponds to these lessons
    const charsPerLesson = Math.floor(fullContent.length / totalLessons)
    const startChar = startIdx * charsPerLesson
    const endChar = Math.min(endIdx * charsPerLesson, fullContent.length)

    return fullContent.slice(startChar, endChar)
  }

  private updateProgress(progress: GenerationProgress, callback?: (progress: GenerationProgress) => void): void {
    this.currentProgress = progress

    if (callback) {
      callback(progress)
    }
  }

  private classifyError(error: any): string {
    const errorMessage = error.message?.toLowerCase() || error.toString().toLowerCase()

    if (errorMessage.includes('overloaded') || errorMessage.includes('503')) {
      return 'overloaded'
    }
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return 'rate_limit'
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('deadline')) {
      return 'timeout'
    }
    if (errorMessage.includes('internal') || errorMessage.includes('500')) {
      return 'internal_error'
    }
    if (errorMessage.includes('network') || errorMessage.includes('econnrefused')) {
      return 'network'
    }

    return 'internal_error' // Default
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ============================================
// Factory Function
// ============================================

export function createCourseGenerationManager(): CourseGenerationManager {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!apiKey) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set')
  }
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set (needed for background operations)')
  }

  return new CourseGenerationManager(apiKey, supabaseUrl, supabaseServiceKey)
}
