import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getStudyToolPrompt, generateStudyToolTitle, type StudyToolPromptType } from '@/lib/study-tools-prompts'
import { classifyError, addRetryAttempt } from '@/lib/retry-manager'
import { resolveAIConfig } from '@/lib/ai-router'
import { generateCompletion, type UserAIConfig } from '@/lib/ai-providers'
import { recordUsage } from '@/lib/usage-tracker'
import { shouldUseDirectPdfForQuery } from '@/lib/kie-direct-pdf'

// Service role client for background operations only (bypasses RLS)
const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


// Vercel Hobby (free) tier: 10s max for serverless functions
// Pro tier allows up to 60s
export const maxDuration = 10

/**
 * Multi-Model Fallback Strategy with Content Chunking
 * Implements sophisticated retry and fallback mechanisms for study tool generation
 */

/**
 * Custom error for when all models are overloaded
 * This gets special handling in the UI (removes empty card, shows friendly popup)
 */
class AllModelsOverloadedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AllModelsOverloadedError'
  }
}

interface FallbackResult {
  resultText: string
  modelUsed: string
  duration: number
  chunksUsed?: number
  fallbackReason?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null
}

interface ModelConfig {
  name: string
  maxInputTokens: number
  baseOutputTokens: number
  temperature: number
  topK: number
  maxRetries: number
}

interface RetryConfig {
  maxRetries: number
  delaysMs: number[]
}

// Error-type based retry configuration
const RETRY_STRATEGIES: Record<string, RetryConfig> = {
  'overloaded': { maxRetries: 3, delaysMs: [15000, 30000, 60000] },
  'rate_limit': { maxRetries: 2, delaysMs: [60000, 120000] },
  'internal_error': { maxRetries: 2, delaysMs: [30000, 45000] },
  'timeout': { maxRetries: 2, delaysMs: [15000, 30000] },
  'network': { maxRetries: 2, delaysMs: [15000, 30000] },
  'default': { maxRetries: 1, delaysMs: [30000] }
}

// All Gemini 2.5 models support up to 65,536 output tokens!
const GEMINI_MAX_OUTPUT_TOKENS = 65536

// Study tool specific token allocations (using full model capacity)
const TOOL_TOKEN_ALLOCATIONS: Record<string, number> = {
  'smart-notes': 32768,    // Long-form content needs more tokens
  'study-guide': 32768,    // Comprehensive guides need space
  'smart-summary': 16384,  // Summaries should be more concise
  'flashcards': 8192,      // JSON arrays don't need as many tokens
  'quiz': 16384,            // Quiz JSON with explanations needs more tokens
  'mind-map': GEMINI_MAX_OUTPUT_TOKENS  // Full capacity — mind maps vary wildly in size based on document content
}

const MODEL_HIERARCHY: ModelConfig[] = [
  {
    name: 'gemini-3-flash',
    maxInputTokens: 1000000,  // 1M context window
    baseOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    temperature: 0.5,
    topK: 40,
    maxRetries: 3
  },
  {
    name: 'gemini-2.5-flash',
    maxInputTokens: 1000000,  // 1M context window
    baseOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    temperature: 0.5,
    topK: 35,
    maxRetries: 3
  },
  {
    name: 'gemini-2.5-pro',
    maxInputTokens: 1000000,  // 1M context window
    baseOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    temperature: 0.5,
    topK: 30,
    maxRetries: 2
  }
]

function getOptimalOutputTokens(toolType: string, modelName: string): number {
  // Use tool-specific allocation, but cap at model maximum
  const toolAllocation = TOOL_TOKEN_ALLOCATIONS[toolType] || 16384
  const modelConfig = MODEL_HIERARCHY.find(m => m.name === modelName)
  const modelMax = modelConfig?.baseOutputTokens || GEMINI_MAX_OUTPUT_TOKENS

  return Math.min(toolAllocation, modelMax)
}

function getRetryConfigForError(errorMessage: string): RetryConfig {
  const message = errorMessage.toLowerCase()

  if (message.includes('overloaded') || message.includes('busy') || message.includes('capacity')) {
    return RETRY_STRATEGIES.overloaded
  }
  if (message.includes('rate limit') || message.includes('quota') || message.includes('resource_exhausted')) {
    return RETRY_STRATEGIES.rate_limit
  }
  if (message.includes('internal') || message.includes('status 13') || message.includes('status 500')) {
    return RETRY_STRATEGIES.internal_error
  }
  if (message.includes('timeout') || message.includes('deadline') || message.includes('status 4')) {
    return RETRY_STRATEGIES.timeout
  }
  if (message.includes('network') || message.includes('connection') || message.includes('fetch')) {
    return RETRY_STRATEGIES.network
  }

  return RETRY_STRATEGIES.default
}

function getErrorType(errorMessage: string): string {
  const message = errorMessage.toLowerCase()

  if (message.includes('overloaded') || message.includes('busy')) return 'overloaded'
  if (message.includes('rate limit') || message.includes('quota')) return 'rate_limit'
  if (message.includes('internal') || message.includes('status 13')) return 'internal_error'
  if (message.includes('timeout') || message.includes('deadline')) return 'timeout'
  if (message.includes('network') || message.includes('connection')) return 'network'

  return 'unknown'
}

function isContentComplete(content: string, toolType: string): boolean {
  // Check if content appears to be properly completed
  const trimmed = content.trim()

  // Basic length check - very short content is likely truncated
  if (trimmed.length < 200) return false

  // Tool-specific completion indicators
  switch (toolType) {
    case 'flashcards':
    case 'quiz':
    case 'mind-map':
      // For flashcards/quiz/mind-map, check if JSON is properly closed
      try {
        JSON.parse(trimmed)
        return true
      } catch {
        return false
      }

    case 'smart-notes':
    case 'study-guide':
      // Long-form content should end with proper conclusion
      const lastParagraph = trimmed.split('\n\n').pop() || ''
      return lastParagraph.length > 50 && !lastParagraph.endsWith('...')

    case 'smart-summary':
      // Summaries should have proper endings
      return !trimmed.endsWith('...') && trimmed.length > 100

    default:
      return true
  }
}

async function generateWithFallback(
  systemPrompt: string,
  userPrompt: string,
  type: string
): Promise<FallbackResult> {
  const apiKey = process.env.KIE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    throw new Error('No AI API key configured. Set KIE_API_KEY in your .env.local.')
  }

  // Estimate token count (rough approximation: 1 token ≈ 4 characters)
  const estimatedTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4)
  console.log(`[Fallback] Estimated input tokens: ${estimatedTokens}`)

  // Track if all models failed due to overload specifically
  let allModelsOverloaded = true

  for (let modelIndex = 0; modelIndex < MODEL_HIERARCHY.length; modelIndex++) {
    const modelConfig = MODEL_HIERARCHY[modelIndex]
    const modelStartTime = Date.now()

    console.log(`[Fallback] Attempting generation with ${modelConfig.name} via Kie.ai (tokens: ${estimatedTokens}/${modelConfig.maxInputTokens})`)

    // Check if content fits within model limits
    if (estimatedTokens > modelConfig.maxInputTokens) {
      console.log(`[Fallback] Content too large for ${modelConfig.name} (${estimatedTokens} > ${modelConfig.maxInputTokens}), trying next model...`)
      continue
    }

    // Per-model retry loop
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= modelConfig.maxRetries; attempt++) {
      console.log(`[Fallback] ${modelConfig.name} attempt ${attempt}/${modelConfig.maxRetries}`)

      try {
        // Get optimal output tokens for this tool type and model
        const optimalOutputTokens = getOptimalOutputTokens(type, modelConfig.name)

        // Create Kie client for this model
        const client = new OpenAI({
          apiKey,
          baseURL: `https://api.kie.ai/${modelConfig.name}/v1`,
        })

        // Generate via OpenAI-compatible API
        let response = await client.chat.completions.create({
          model: modelConfig.name,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: modelConfig.temperature,
          max_tokens: optimalOutputTokens,
        }) as unknown as Record<string, unknown>

        // Kie.ai sometimes returns raw JSON string instead of parsed object
        if (typeof response === 'string') {
          try {
            response = JSON.parse(response)
          } catch {
            throw new Error('AI provider returned unparseable response')
          }
        }

        const choices = response.choices as Array<{ message?: { content?: string } }> | undefined
        if (!choices || choices.length === 0) {
          throw new Error('AI provider returned empty response (no choices)')
        }

        const resultText = choices[0]?.message?.content || ''

        // Check for truncation or insufficient content
        if (resultText.length < 50) {
          throw new Error(`Generated content too short (${resultText.length} chars) - likely generation failure`)
        }

        // Check for potential truncation (ends abruptly without proper conclusion)
        if (resultText.length > 100 && !isContentComplete(resultText, type)) {
          console.warn(`[Fallback] ${modelConfig.name} content appears truncated, may retry with higher token limit`)
        }

        // Extract usage data from response
        const responseUsage = response.usage ? {
          promptTokens: (response.usage as Record<string, number>).prompt_tokens ?? 0,
          completionTokens: (response.usage as Record<string, number>).completion_tokens ?? 0,
          totalTokens: (response.usage as Record<string, number>).total_tokens ?? 0,
        } : null

        console.log(`[Fallback] Success with ${modelConfig.name} (attempt ${attempt}, ${resultText.length} chars)`)
        return {
          resultText,
          modelUsed: `${modelConfig.name}${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
          duration: Date.now() - modelStartTime,
          usage: responseUsage,
        }

      } catch (error) {
        const errorInstance = error instanceof Error ? error : new Error('Unknown error')
        lastError = errorInstance
        console.error(`[Fallback] ${modelConfig.name} attempt ${attempt} failed:`, errorInstance.message)

        // Get retry configuration based on error type
        const retryConfig = getRetryConfigForError(errorInstance.message)
        const errorClassification = classifyError(errorInstance)

        // DEBUG: Log the classification result
        console.log(`[Fallback] Error classification for ${modelConfig.name}:`, {
          isRetryable: errorClassification.isRetryable,
          isModelOverload: errorClassification.isModelOverload,
          reason: errorClassification.reason,
          messageSnippet: errorInstance.message.substring(0, 200)
        })

        // Track if this is NOT a model overload error
        if (!errorClassification.isModelOverload) {
          allModelsOverloaded = false
        }

        // CRITICAL: For model overload, skip retries and immediately fallback to next model
        // Retries don't help with overload (it's indefinite), but they DO help with rate limits
        if (errorClassification.isModelOverload) {
          console.log(`[Fallback] Model overload detected - skipping retries for ${modelConfig.name}, immediate fallback to next model`)
          break // Immediately try next model in hierarchy
        }

        // If this is the last attempt for this model, or error is non-retryable, break to try next model
        if (attempt >= modelConfig.maxRetries || !errorClassification.isRetryable) {
          console.log(`[Fallback] ${modelConfig.name} exhausted (${attempt}/${modelConfig.maxRetries} attempts) or non-retryable error`)
          break
        }

        // Calculate delay for retry (use error-specific delays if available)
        const delayIndex = Math.min(attempt - 1, retryConfig.delaysMs.length - 1)
        const delay = retryConfig.delaysMs[delayIndex] || 30000

        console.log(`[Fallback] Retrying ${modelConfig.name} in ${delay}ms (error-type: ${getErrorType(errorInstance.message)})`)

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    // If we get here, all attempts for this model failed
    // For the last model, check if all models failed due to overload
    if (modelIndex === MODEL_HIERARCHY.length - 1) {
      console.error(`[Fallback] All models exhausted`)
      
      // If all models failed specifically due to overload, throw special error
      if (allModelsOverloaded) {
        console.log(`[Fallback] All models overloaded - throwing AllModelsOverloadedError`)
        throw new AllModelsOverloadedError('All AI models are currently experiencing high demand. Please try again in a few minutes.')
      }
      
      // Otherwise throw the last error
      throw lastError || new Error('All fallback models failed')
    }

    // Continue to next model
    console.log(`[Fallback] ${modelConfig.name} failed all attempts, trying next model...`)
  }

  // This should never be reached due to the throw in the last iteration
  throw new Error('All fallback models failed')
}

async function generateWithDirectPdfFallback(
  systemPrompt: string,
  userPrompt: string,
  type: string,
  pdfUrl: string,
  apiKey: string,
  preferredModel?: string
): Promise<FallbackResult> {
  if (!apiKey) {
    throw new Error('Direct PDF generation requires a configured API key.')
  }

  const promptText = `${systemPrompt}\n\n${userPrompt}\n\nThe source document is attached as a PDF URL. Read the PDF directly and generate the requested study tool from its visual/document content.`
  const models = preferredModel
    ? [
        MODEL_HIERARCHY.find((model) => model.name === preferredModel) || {
          name: preferredModel,
          maxInputTokens: 1000000,
          baseOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          temperature: 0.5,
          topK: 40,
          maxRetries: 1,
        },
        ...MODEL_HIERARCHY.filter((model) => model.name !== preferredModel),
      ]
    : MODEL_HIERARCHY

  for (const modelConfig of models) {
    const modelStartTime = Date.now()
    const optimalOutputTokens = getOptimalOutputTokens(type, modelConfig.name)

    try {
      console.log(`[DirectPDF] Attempting generation with ${modelConfig.name}`)

      const response = await fetch(`https://api.kie.ai/${modelConfig.name}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelConfig.name,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: pdfUrl } },
            ],
          }],
          max_tokens: optimalOutputTokens,
          temperature: modelConfig.temperature,
        }),
      })

      const responseText = await response.text()
      if (!response.ok) {
        throw new Error(`${response.status} ${responseText || response.statusText}`)
      }

      const data = JSON.parse(responseText) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
      }

      const resultText = data.choices?.[0]?.message?.content || ''
      if (resultText.length < 50) {
        throw new Error(`Generated content too short (${resultText.length} chars)`)
      }

      console.log(`[DirectPDF] Success with ${modelConfig.name} (${resultText.length} chars)`)
      return {
        resultText,
        modelUsed: `${modelConfig.name} direct-pdf`,
        duration: Date.now() - modelStartTime,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        } : null,
      }
    } catch (error) {
      console.warn(`[DirectPDF] ${modelConfig.name} failed:`, error)
    }
  }

  throw new Error('Direct PDF generation failed for all Kie models.')
}


interface StudyToolGenerateRequest {
  id?: string
  type: StudyToolPromptType
  documentId?: string
  conversationId?: string
  planId?: string
  planDay?: number
  activityIndex?: number
  // Flashcard-specific options
  flashcardOptions?: {
    numberOfCards: 'fewer' | 'standard' | 'more'
    difficulty: 'easy' | 'medium' | 'hard'
    customInstructions?: string
  }
  // Quiz-specific options
  quizOptions?: {
    numberOfQuestions: 'fewer' | 'standard' | 'more' | 'custom'
    customCount?: number
    difficulty: 'easy' | 'medium' | 'hard'
    customInstructions?: string
  }
  // Mind map-specific options
  mindMapOptions?: {
    depth?: 2 | 3 | 4
    detailLevel?: 'keywords' | 'brief' | 'detailed'
    focusArea?: string
    visualStyle?: 'radial' | 'tree' | 'organic'
    customInstructions?: string
    batchTopics?: string[]  // Generate multiple focused mindmaps in one request
  }
}


interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

async function syncGeneratedPlanActivity(params: {
  userId: string
  planId?: string
  planDay?: number
  activityIndex?: number
  outputId: string | null
  type: StudyToolPromptType
  documentId?: string
  flashcardData: Array<{ id: string; question: string; answer: string; topic?: string; difficulty?: 'easy' | 'medium' | 'hard' }> | null
  quizData: Array<{ id: string; question: string; options: string[]; correctAnswer: number; explanation?: string; topic?: string; difficulty?: 'easy' | 'medium' | 'hard' }> | null
}) {
  const { userId, planId, planDay, activityIndex, outputId, type, documentId, flashcardData, quizData } = params
  if (!planId || typeof planDay !== 'number' || typeof activityIndex !== 'number' || !outputId) return null

  const generatedSourceType =
    type === 'quiz' ? 'quiz_set' :
    type === 'flashcards' ? 'flashcard_set' :
    type === 'mind-map' ? 'mindmap_set' :
    'output'

  const cards = type === 'flashcards' && flashcardData?.length
    ? flashcardData.map((card) => ({
        sourceType: 'flashcard',
        sourceId: card.id,
        question: card.question,
        answer: card.answer,
        options: null as string[] | null,
        correctAnswer: null as number | null,
        topic: card.topic || null,
        difficulty: card.difficulty || null,
      }))
    : type === 'quiz' && quizData?.length
      ? quizData.map((question) => ({
          sourceType: 'quiz',
          sourceId: question.id,
          question: question.question,
          answer: `${question.options[question.correctAnswer]}${question.explanation ? `\n\n${question.explanation}` : ''}`,
          options: question.options,
          correctAnswer: question.correctAnswer,
          topic: question.topic || null,
          difficulty: question.difficulty || null,
        }))
      : []

  let sourceType: 'flashcard' | 'quiz' | null = null
  let synced = 0
  let existing = 0
  let total = 0

  if (cards.length > 0) {
    const sourceIds = cards.map((card) => card.sourceId)
    sourceType = type === 'quiz' ? 'quiz' : 'flashcard'
    const { data: existingCards, error: existingFetchError } = await serviceSupabase
      .from('review_cards')
      .select('source_id')
      .eq('user_id', userId)
      .eq('source_type', sourceType)
      .in('source_id', sourceIds)

    if (existingFetchError) {
      throw new Error('Generated cards could not be checked for existing review state')
    }

    const existingIds = new Set((existingCards || []).map((card) => card.source_id))
    existing = existingIds.size
    const newCards = cards.filter((card) => !existingIds.has(card.sourceId))
    for (const card of newCards) {
      const { error } = await serviceSupabase
        .from('review_cards')
        .insert({
          user_id: userId,
          source_type: card.sourceType,
          source_id: card.sourceId,
          source_set_id: outputId,
          document_id: documentId || null,
          plan_id: planId,
          question: card.question,
          answer: card.answer,
          options: card.options,
          correct_answer: card.correctAnswer,
          topic: card.topic,
          difficulty: card.difficulty,
        })
      if (!error) synced++
    }

    await serviceSupabase
      .from('review_cards')
      .update({ plan_id: planId })
      .eq('user_id', userId)
      .eq('source_set_id', outputId)

    const { count } = await serviceSupabase
      .from('review_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('source_set_id', outputId)
    total = count || cards.length
  }

  const { data: plan, error: planError } = await serviceSupabase
    .from('agent_study_plans')
    .select('schedule')
    .eq('id', planId)
    .eq('user_id', userId)
    .single()

  if (planError || !plan) throw new Error('Generated cards synced, but plan activity could not be updated')

  const schedule = typeof plan.schedule === 'string' ? JSON.parse(plan.schedule) : plan.schedule
  const dayEntry = schedule.find((day: { day: number }) => day.day === planDay)
  const activity = dayEntry?.activities?.[activityIndex]
  if (!activity) throw new Error('Generated cards synced, but plan activity was not found')

  activity.generationStatus = 'ready'
  activity.generatedSourceId = outputId
  activity.generatedSourceType = generatedSourceType
  if (cards.length > 0) activity.cardCount = total || cards.length

  const { error: updateError } = await serviceSupabase
    .from('agent_study_plans')
    .update({ schedule, updated_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('user_id', userId)

  if (updateError) throw new Error('Generated cards synced, but plan activity update failed')

  return {
    sourceType: sourceType || generatedSourceType,
    synced,
    existing,
    total,
  }
}

export async function POST(req: NextRequest) {
  let type: StudyToolPromptType | undefined
  let documentId: string | undefined
  let conversationId: string | undefined
  let flashcardOptions: StudyToolGenerateRequest['flashcardOptions']
  let quizOptions: StudyToolGenerateRequest['quizOptions']
  let mindMapOptions: StudyToolGenerateRequest['mindMapOptions']
  let generationId: string | undefined
  let planId: string | undefined
  let planDay: number | undefined
  let activityIndex: number | undefined

  try {
    // Authenticate user first
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in to generate study tools' },
        { status: 401 }
      )
    }

    console.log('[StudyTools] Authenticated user:', user.id)

    const requestData: StudyToolGenerateRequest = await req.json()
    generationId = requestData.id
    type = requestData.type
    documentId = requestData.documentId
    conversationId = requestData.conversationId
    flashcardOptions = requestData.flashcardOptions
    quizOptions = requestData.quizOptions
    mindMapOptions = requestData.mindMapOptions
    planId = requestData.planId
    planDay = requestData.planDay
    activityIndex = requestData.activityIndex

    // Debug logging
    console.log('[StudyTools] API Request received:', { type, documentId, conversationId })
    console.log('[StudyTools] Environment check:', {
      hasKieKey: !!process.env.KIE_API_KEY,
      hasGeminiKey: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })

    // Validate request
    if (!type || !['study-guide', 'smart-summary', 'smart-notes', 'flashcards', 'quiz', 'mind-map'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid study tool type' },
        { status: 400 }
      )
    }

    if (!documentId && !conversationId) {
      return NextResponse.json(
        { error: 'Either documentId or conversationId is required' },
        { status: 400 }
      )
    }

    // Resolve AI config (user preference or server fallback)
    let userAIConfig: UserAIConfig | null = null
    try {
      const aiConfig = await resolveAIConfig(user.id)
      if (aiConfig.userConfig) {
        userAIConfig = aiConfig.userConfig
        console.log(`[StudyTools] Using user's ${aiConfig.provider}/${aiConfig.model}`)
      }
    } catch {
      // No user config
    }

    // If no user config, verify server key (Kie or Google)
    if (!userAIConfig && !process.env.KIE_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json(
        { error: 'No AI provider configured. Please add an API key in Settings.' },
        { status: 500 }
      )
    }

    let documentContent = ''
    let documentTitle = 'Untitled Document'
    let directPdfUrl: string | null = null

    // Get content based on documentId or conversationId
    if (documentId) {
      console.log('[StudyTools] Fetching document:', documentId)

      // Fetch document and its content (filtered by user_id through RLS)
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('id, title, processing_status, document_content, storage_path, file_type')
        .eq('id', documentId)
        .eq('user_id', user.id) // Explicit user filter for security
        .single()

      console.log('[StudyTools] Document query result:', { document, docError })

      if (docError || !document) {
        console.error('[StudyTools] Document not found:', { documentId, docError })
        return NextResponse.json(
          { error: 'Document not found or inaccessible' },
          { status: 404 }
        )
      }

      if (document.processing_status !== 'completed') {
        return NextResponse.json(
          { error: 'Document is still processing. Please wait for processing to complete.' },
          { status: 422 }
        )
      }

      documentTitle = document.title

      const extractedContent = document.document_content?.trim() || ''
      const isPdf = document.file_type === 'pdf' || document.storage_path?.toLowerCase().endsWith('.pdf')

      if (isPdf && shouldUseDirectPdfForQuery(extractedContent, `${type} ${documentTitle}`) && document.storage_path) {
        const { data: signedUrlData, error: signedUrlError } = await serviceSupabase.storage
          .from('documents')
          .createSignedUrl(document.storage_path, 15 * 60)

        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error('[StudyTools] Failed to create direct PDF signed URL:', signedUrlError)
          return NextResponse.json(
            { error: 'Document has no extractable text and could not be prepared for direct PDF reading.' },
            { status: 422 }
          )
        }

        directPdfUrl = signedUrlData.signedUrl
        documentContent = 'This PDF has little or no extractable text. Use the attached PDF file directly as the source content.'
        console.log('[StudyTools] Using direct PDF fallback for weak extracted content:', documentId)
      } else if (!extractedContent) {
        console.warn('[StudyTools] Document has no content:', documentId)
        return NextResponse.json(
          { error: 'Document has no content available for study tool generation' },
          { status: 422 }
        )
      } else {
        documentContent = extractedContent
      }

      console.log('[StudyTools] Using document content length:', documentContent.length)

    } else if (conversationId) {
      // Fetch conversation messages (filtered by user_id through RLS)
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('id, title, document_id')
        .eq('id', conversationId)
        .eq('user_id', user.id) // Explicit user filter for security
        .single()

      if (convError || !conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        )
      }

      documentTitle = conversation.title || 'Conversation'

      // Fetch conversation messages
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('sequence_number', { ascending: true })

      if (messagesError) {
        return NextResponse.json(
          { error: 'Failed to fetch conversation content' },
          { status: 500 }
        )
      }

      if (!messages || messages.length === 0) {
        return NextResponse.json(
          { error: 'Conversation has no content available for study tool generation' },
          { status: 422 }
        )
      }

      // Build conversation content
      documentContent = buildConversationContent(messages as Message[])

      // If conversation has an associated document, include document context
      if (conversation.document_id) {
        const { data: docData } = await supabase
          .from('documents')
          .select('document_content')
          .eq('id', conversation.document_id)
          .eq('user_id', user.id) // Explicit user filter for security
          .single()

        if (docData && docData.document_content) {
          documentContent = `# Document Context:\n\n${docData.document_content}\n\n# Conversation:\n\n${documentContent}`
        }
      }
    }

    // Validate content length
    if (!directPdfUrl && documentContent.length < 100) {
      return NextResponse.json(
        { error: 'Insufficient content for generating meaningful study materials' },
        { status: 422 }
      )
    }

    // Get the appropriate prompts for the study tool type
    let { systemPrompt, userPrompt } = getStudyToolPrompt(
      type as StudyToolPromptType,
      documentContent,
      documentTitle,
      flashcardOptions ? {
        numberOfCards: flashcardOptions.numberOfCards,
        difficulty: flashcardOptions.difficulty,
        customInstructions: flashcardOptions.customInstructions
      } : undefined,
      quizOptions ? {
        numberOfQuestions: quizOptions.numberOfQuestions,
        customCount: quizOptions.customCount,
        difficulty: quizOptions.difficulty,
        customInstructions: quizOptions.customInstructions
      } : undefined,
      mindMapOptions ? {
        depth: mindMapOptions.depth,
        detailLevel: mindMapOptions.detailLevel,
        focusArea: mindMapOptions.focusArea,
        visualStyle: mindMapOptions.visualStyle,
        customInstructions: mindMapOptions.customInstructions
      } : undefined
    )

    // Override prompt for batch mind map generation (multiple topic-focused maps in one call)
    if (type === 'mind-map' && mindMapOptions?.batchTopics?.length) {
      const batchTopics = mindMapOptions.batchTopics
      const batchSystemPrompt = `You are an expert mind map creator that generates rich, comprehensive visual knowledge maps from educational content.

Your job: Generate one mind map per topic provided. Each mind map must faithfully represent the actual content and complexity of that topic as it appears in the source document.

## How to decide the size and depth of each mind map
- Read the document content carefully for each topic
- The number of branches, children, and depth of nesting should reflect how much content actually exists for that topic in the document
- A topic with many sub-concepts, examples, and details should produce a large, deep mind map
- A topic with fewer points should produce a proportionally smaller map — but still meaningfully cover what's there
- Never produce a map with just 2-3 nodes — if a topic was identified, there is enough content to map out properly
- Nest deeper when the content has natural sub-categories (e.g., a branch about "Types" that has several distinct types, each with their own properties)

## Node design
- **Labels**: Concise 3-8 word phrases that capture the concept. Not single words, not full sentences.
- **Details**: 1-3 sentences with specific facts, definitions, relationships, or examples drawn from the document. This is where the real learning value lives — be thorough.
- **Emoji**: One meaningful emoji per node as a visual mnemonic for the concept.

## Output format
Output a JSON ARRAY of mind map objects:
[
  {
    "title": "Descriptive Title for This Mind Map",
    "centralTopic": "Core Concept (3-8 words)",
    "branches": [
      {
        "id": "t1_b1",
        "label": "Branch Label",
        "detail": "Thorough explanation with facts from the document.",
        "emoji": "🔬",
        "children": [
          {
            "id": "t1_b1_1",
            "label": "Sub-topic Label",
            "detail": "Detailed explanation.",
            "emoji": "📊",
            "children": [
              {
                "id": "t1_b1_1_1",
                "label": "Deeper concept",
                "detail": "Specific detail or example.",
                "emoji": "📌"
              }
            ]
          }
        ]
      }
    ]
  }
]

## Rules
- One mind map per topic — cover that topic as completely as the document content allows
- Every node MUST have: id, label, detail, emoji. Children array is optional (omit or use empty array for leaf nodes).
- IDs must be globally unique across all maps (prefix with topic index: t1_b1, t1_b1_1, t2_b1, etc.)
- Return ONLY the valid JSON array — no markdown, no code fences, no explanatory text before or after
- Balance branches — spread content evenly rather than putting everything under one branch
- Go as deep as the content naturally requires. If a branch has sub-categories that themselves have sub-points, nest them.`

      const batchUserPrompt = `Document: "${documentTitle}"

Topics to map (one mind map each):
${batchTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Source material:
${documentContent.slice(0, 25000)}

For each topic, read the source material and build a mind map that covers all the relevant concepts, sub-topics, relationships, and details present in the document for that topic. Let the document content dictate the size and depth — more content means a bigger map. Output the JSON array now.`

      // Replace the prompts
      systemPrompt = batchSystemPrompt as typeof systemPrompt
      userPrompt = batchUserPrompt as typeof userPrompt
      console.log(`[StudyTools] Batch mind map mode: generating ${batchTopics.length} focused maps`)
    }

    console.log(`[StudyTools] Generating ${type} for "${documentTitle}" (${documentContent.length} chars)`)

    // Generate study tool
    const startTime = Date.now()
    let resultText: string
    let modelUsed: string
    let generationDuration: number
    let usageProvider = 'kie'
    let usageModel = 'gemini-3-flash'

    if (directPdfUrl) {
      const directPdfConfig = userAIConfig || {
        provider: 'kie' as const,
        model: process.env.KIE_DEFAULT_MODEL || 'gemini-3-flash',
        apiKey: process.env.KIE_API_KEY || '',
      }
      const fallbackResult = await generateWithDirectPdfFallback(
        systemPrompt,
        userPrompt,
        type,
        directPdfUrl,
        directPdfConfig.apiKey,
        directPdfConfig.model
      )
      resultText = fallbackResult.resultText
      modelUsed = fallbackResult.modelUsed
      generationDuration = fallbackResult.duration
      usageModel = fallbackResult.modelUsed.split(' ')[0]
      usageProvider = directPdfConfig.provider

      const inputTokens = fallbackResult.usage?.promptTokens ?? Math.ceil((systemPrompt.length + userPrompt.length) / 4)
      const outputTokens = fallbackResult.usage?.completionTokens ?? Math.ceil(resultText.length / 4)
      recordUsage({
        userId: user.id,
        provider: usageProvider,
        model: usageModel,
        inputTokens,
        outputTokens,
        totalTokens: fallbackResult.usage?.totalTokens ?? (inputTokens + outputTokens),
        source: 'study-tool',
        sourceId: generationId,
      })
    } else if (userAIConfig) {
      // Use user's configured provider
      const completionResult = await generateCompletion(userAIConfig, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: TOOL_TOKEN_ALLOCATIONS[type] || 16384,
        temperature: 0.7,
      })
      resultText = completionResult.text
      modelUsed = `${userAIConfig.provider}/${userAIConfig.model}`
      generationDuration = Date.now() - startTime
      usageProvider = userAIConfig.provider
      usageModel = userAIConfig.model

      // Record usage from completion result
      // Recompute total as input + output for consistency (API total may include hidden tokens)
      const inputTokens = completionResult.usage?.promptTokens ?? Math.ceil((systemPrompt.length + userPrompt.length) / 4)
      const outputTokens = completionResult.usage?.completionTokens ?? Math.ceil(resultText.length / 4)
      recordUsage({
        userId: user.id,
        provider: usageProvider,
        model: usageModel,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        source: 'study-tool',
        sourceId: generationId,
      })
    } else {
      // Use server Gemini with fallback strategy
      const fallbackResult = await generateWithFallback(systemPrompt, userPrompt, type)
      resultText = fallbackResult.resultText
      modelUsed = fallbackResult.modelUsed
      generationDuration = fallbackResult.duration
      // Extract the actual model name from fallback (e.g. "gemini-3-flash (attempt 2)" -> "gemini-3-flash")
      usageModel = fallbackResult.modelUsed.split(' ')[0]

      // Record usage — prefer real token counts from API, fall back to estimates
      const inputTokens = fallbackResult.usage?.promptTokens ?? Math.ceil((systemPrompt.length + userPrompt.length) / 4)
      const outputTokens = fallbackResult.usage?.completionTokens ?? Math.ceil(resultText.length / 4)
      recordUsage({
        userId: user.id,
        provider: usageProvider,
        model: usageModel,
        inputTokens,
        outputTokens,
        totalTokens: fallbackResult.usage?.totalTokens ?? (inputTokens + outputTokens),
        source: 'study-tool',
        sourceId: generationId,
      })
    }

    const duration = Date.now() - startTime
    console.log(`[StudyTools] Generated ${type} in ${duration}ms using ${modelUsed} (${resultText.length} chars)`)

    // Special handling for flashcards - parse JSON response
    let processedContent: string = resultText
    let flashcardData = null
    let quizData = null
    let mindMapData = null

    if (type === 'flashcards') {
      try {
        // Parse the JSON response from the AI
        const cleanedText = resultText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '')
        flashcardData = JSON.parse(cleanedText)

        if (!Array.isArray(flashcardData)) {
          throw new Error('Flashcard data is not an array')
        }

        // Validate flashcard structure
        flashcardData.forEach((card, index) => {
          if (!card.question || !card.answer || !card.id) {
            throw new Error(`Invalid flashcard at index ${index}: missing required fields`)
          }
        })

        console.log(`[StudyTools] Successfully parsed ${flashcardData.length} flashcards`)

        // Keep the original JSON for content field
        processedContent = resultText
      } catch (error) {
        console.error('[StudyTools] Failed to parse flashcard JSON:', error)
        return NextResponse.json(
          { error: 'Failed to parse generated flashcards. The AI response was not in the expected format.' },
          { status: 500 }
        )
      }
    }

    // Special handling for quiz - parse JSON response
    if (type === 'quiz') {
      try {
        const cleanedText = resultText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '')
        quizData = JSON.parse(cleanedText)

        if (!Array.isArray(quizData)) {
          throw new Error('Quiz data is not an array')
        }

        // Validate quiz structure
        quizData.forEach((q: Record<string, unknown>, index: number) => {
          if (!q.question || !q.id) {
            throw new Error(`Invalid quiz question at index ${index}: missing required fields`)
          }
          if (!Array.isArray(q.options) || (q.options as unknown[]).length !== 4) {
            throw new Error(`Invalid quiz question at index ${index}: must have exactly 4 options`)
          }
          if (typeof q.correctAnswer !== 'number' || (q.correctAnswer as number) < 0 || (q.correctAnswer as number) > 3) {
            throw new Error(`Invalid quiz question at index ${index}: correctAnswer must be 0-3`)
          }
          // Ensure wrongExplanations array exists and has 4 entries
          if (!Array.isArray(q.wrongExplanations)) {
            q.wrongExplanations = ['', '', '', '']
          }
          while ((q.wrongExplanations as string[]).length < 4) {
            (q.wrongExplanations as string[]).push('')
          }
        })

        console.log(`[StudyTools] Successfully parsed ${quizData.length} quiz questions`)
        processedContent = resultText
      } catch (error) {
        console.error('[StudyTools] Failed to parse quiz JSON:', error)
        return NextResponse.json(
          { error: 'Failed to parse generated quiz. The AI response was not in the expected format.' },
          { status: 500 }
        )
      }
    }

    // Special handling for mind-map - parse JSON response
    // Count nodes helper
    const countMindMapNodes = (nodes: Array<{ children?: unknown[] }>): number => {
      let count = nodes.length
      for (const node of nodes) {
        if (Array.isArray(node.children)) {
          count += countMindMapNodes(node.children as Array<{ children?: unknown[] }>)
        }
      }
      return count
    }

    // Batch mind maps: multiple mindmaps generated in one LLM call
    let batchMindMaps: Array<{ centralTopic: string; branches: unknown[]; title?: string; metadata?: { totalNodes: number; maxDepth: number } }> | null = null

    if (type === 'mind-map') {
      try {
        const cleanedText = resultText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '')
        const parsed = JSON.parse(cleanedText)

        // Check if response is a batch (array of mindmaps or object with mindmaps array)
        const mindmapArray = Array.isArray(parsed) ? parsed
          : parsed?.mindmaps && Array.isArray(parsed.mindmaps) ? parsed.mindmaps
          : null

        if (mindmapArray && mindmapArray.length > 1 && mindmapArray[0]?.centralTopic) {
          // Batch mode — multiple mindmaps in one response
          const parsedBatch = mindmapArray.map((mm: Record<string, unknown>) => {
            const branches = (mm.branches as unknown[]) || []
            const totalNodes = countMindMapNodes(branches as Array<{ children?: unknown[] }>) + 1
            return {
              centralTopic: mm.centralTopic as string,
              branches,
              title: (mm.title as string) || (mm.centralTopic as string),
              metadata: { totalNodes, maxDepth: mindMapOptions?.depth || 3 },
            }
          })
          batchMindMaps = parsedBatch
          // Use first mindmap as the primary mindMapData for backward-compat response
          mindMapData = parsedBatch[0]
          console.log(`[StudyTools] Parsed ${parsedBatch.length} batch mind maps`)
        } else {
          // Single mind map
          mindMapData = parsed
          if (!mindMapData.centralTopic || !Array.isArray(mindMapData.branches)) {
            throw new Error('Mind map data missing required fields: centralTopic and branches')
          }
          const totalNodes = countMindMapNodes(mindMapData.branches) + 1
          if (!mindMapData.metadata) {
            mindMapData.metadata = { totalNodes, maxDepth: mindMapOptions?.depth || 3 }
          }
          console.log(`[StudyTools] Successfully parsed mind map with ${totalNodes} nodes`)
        }
        processedContent = resultText
      } catch (error) {
        console.error('[StudyTools] Failed to parse mind map JSON:', error)
        return NextResponse.json(
          { error: 'Failed to parse generated mind map. The AI response was not in the expected format.' },
          { status: 500 }
        )
      }
    }

    // Generate appropriate title
    const generatedTitle = generateStudyToolTitle(type as StudyToolPromptType, documentTitle)

    // Save to database - map frontend types to database types
    const dbType = type === 'smart-summary' ? 'summary' :
                   type === 'smart-notes' ? 'notes' :
                   type === 'study-guide' ? 'study_guide' :
                   type === 'flashcards' ? 'flashcards' :
                   type === 'quiz' ? 'quiz' :
                   type === 'mind-map' ? 'mind_map' : type

    let outputId: string | null = null

    // For conversation-based study tools, validate and get the associated document if available
    let saveDocumentId = documentId
    let validatedConversationId = conversationId
    
    if (conversationId) {
      // Validate that the conversation still exists before saving
      // This prevents foreign key constraint violations
      const { data: conversationCheck, error: conversationCheckError } = await supabase
        .from('conversations')
        .select('id, document_id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (conversationCheckError || !conversationCheck) {
        console.warn('[StudyTools] Conversation not found or inaccessible during save:', {
          conversationId,
          error: conversationCheckError,
          exists: !!conversationCheck
        })
        // Conversation doesn't exist - set to null to prevent FK violation
        validatedConversationId = undefined
      } else {
        // Conversation exists - use its document_id if we don't have one
        if (!saveDocumentId && conversationCheck.document_id) {
          saveDocumentId = conversationCheck.document_id
        }
      }
    }

    try {
      const nowIso = new Date().toISOString()
      const resolvedDocumentId = saveDocumentId ?? null
      const resolvedConversationId = validatedConversationId ?? null

      const payload: Record<string, unknown> = {
        title: generatedTitle,
        content: processedContent,
        type,
        documentId,
        conversationId: validatedConversationId,
        createdAt: nowIso,
        ...(type === 'flashcards' && flashcardData
          ? {
              cards: flashcardData,
              options: flashcardOptions,
              metadata: {
                model: modelUsed,
                duration: generationDuration,
                contentLength: processedContent.length,
                sourceContentLength: documentContent.length,
                totalCards: flashcardData.length,
                avgDifficulty: flashcardOptions?.difficulty || 'medium',
                fallbackStrategy: modelUsed.includes('flash') ? 'applied' : 'none'
              }
            }
          : type === 'quiz' && quizData
          ? {
              questions: quizData,
              options: quizOptions,
              metadata: {
                model: modelUsed,
                duration: generationDuration,
                contentLength: processedContent.length,
                sourceContentLength: documentContent.length,
                totalQuestions: quizData.length,
                avgDifficulty: quizOptions?.difficulty || 'medium',
                fallbackStrategy: modelUsed.includes('flash') ? 'applied' : 'none'
              }
            }
          : type === 'mind-map' && mindMapData
          ? {
              mindMapData,
              options: mindMapOptions,
              metadata: {
                model: modelUsed,
                duration: generationDuration,
                contentLength: processedContent.length,
                sourceContentLength: documentContent.length,
                totalNodes: mindMapData.metadata?.totalNodes || 0,
                maxDepth: mindMapData.metadata?.maxDepth || 3,
                fallbackStrategy: modelUsed.includes('flash') ? 'applied' : 'none'
              }
            }
          : {
              metadata: {
                model: modelUsed,
                duration: generationDuration,
                contentLength: processedContent.length,
                sourceContentLength: documentContent.length,
                fallbackStrategy: modelUsed.includes('flash') ? 'applied' : 'none'
              }
            })
      }

      // Ensure we have at least one source (document or conversation)
      if (!resolvedDocumentId && !resolvedConversationId) {
        console.error('[StudyTools] Cannot save study tool: no document_id or conversation_id provided')
        throw new Error('Study tool must have either a document or conversation source')
      }

      // Check if an output already exists for this source/type combination
      let existingQuery = serviceSupabase
        .from('outputs')
        .select('id')
        .eq('overall', true)
        .eq('type', dbType)
        .is('section_id', null)

      existingQuery = resolvedDocumentId
        ? existingQuery.eq('document_id', resolvedDocumentId)
        : existingQuery.is('document_id', null)

      existingQuery = resolvedConversationId
        ? existingQuery.eq('conversation_id', resolvedConversationId)
        : existingQuery.is('conversation_id', null)

      const { data: existingOutput, error: existingError } = await existingQuery.maybeSingle()

      if (existingError) {
        // Log but do not fail - we'll treat it as no existing record
        console.warn('[StudyTools] Existing output lookup error:', existingError)
      }

      if (existingOutput?.id) {
        const { data: updatedOutput, error: updateError } = await serviceSupabase
          .from('outputs')
          .update({
            payload,
            document_id: resolvedDocumentId,
            conversation_id: resolvedConversationId
            // Note: outputs table doesn't have updated_at column, only created_at
          })
          .eq('id', existingOutput.id)
          .select('id')
          .single()

        if (updateError) {
          console.error('[StudyTools] Failed to update existing output:', updateError)
          console.error('[StudyTools] Update error details:', {
            code: updateError.code,
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint
          })
        } else {
          outputId = updatedOutput?.id ?? existingOutput.id
          console.log('[StudyTools] Updated existing study tool output:', outputId, {
            documentId: resolvedDocumentId,
            conversationId: resolvedConversationId,
            type: dbType
          })
        }
      } else {
        const insertPayload = {
          ...(generationId ? { id: generationId } : {}),
          section_id: null,
          overall: true,
          type: dbType,
          document_id: resolvedDocumentId,
          conversation_id: resolvedConversationId,
          payload
        }

        const { data: output, error: saveError } = await serviceSupabase
          .from('outputs')
          .insert(insertPayload)
          .select('id')
          .single()

        if (saveError) {
          console.error('[StudyTools] Failed to save to database:', saveError)
          console.error('[StudyTools] Save error details:', {
            code: saveError.code,
            message: saveError.message,
            details: saveError.details,
            hint: saveError.hint
          })
        } else {
          outputId = output?.id || null
          console.log('[StudyTools] Successfully saved study tool to database:', outputId, {
            documentId: resolvedDocumentId,
            conversationId: resolvedConversationId,
            type: dbType
          })
        }
      }
    } catch (saveError) {
      console.error('[StudyTools] Database save error:', saveError)
      outputId = null
    }

    // For batch mind maps: save additional mind maps as separate outputs (first was already saved above)
    const batchOutputIds: string[] = outputId ? [outputId] : []
    if (batchMindMaps && batchMindMaps.length > 1) {
      const resolvedDocumentId = saveDocumentId ?? null
      const resolvedConversationId = validatedConversationId ?? null

      for (let i = 1; i < batchMindMaps.length; i++) {
        const mm = batchMindMaps[i]
        try {
          const batchPayload = {
            title: mm.title || mm.centralTopic,
            content: JSON.stringify(mm),
            type,
            documentId,
            createdAt: new Date().toISOString(),
            mindMapData: mm,
            options: mindMapOptions,
            metadata: {
              model: modelUsed,
              duration: generationDuration,
              contentLength: JSON.stringify(mm).length,
              sourceContentLength: documentContent.length,
              totalNodes: mm.metadata?.totalNodes || 0,
              maxDepth: mm.metadata?.maxDepth || 2,
              batchIndex: i,
              fallbackStrategy: modelUsed.includes('flash') ? 'applied' : 'none'
            }
          }
          const { data: batchOutput, error: batchError } = await serviceSupabase
            .from('outputs')
            .insert({
              section_id: null,
              overall: true,
              type: 'mind_map',
              document_id: resolvedDocumentId,
              conversation_id: resolvedConversationId,
              payload: batchPayload,
            })
            .select('id')
            .single()

          if (!batchError && batchOutput) {
            batchOutputIds.push(batchOutput.id)
            console.log(`[StudyTools] Saved batch mind map ${i + 1}/${batchMindMaps.length}: ${batchOutput.id} — "${mm.centralTopic}"`)
          } else {
            console.error(`[StudyTools] Failed to save batch mind map ${i + 1}:`, batchError)
          }
        } catch (err) {
          console.error(`[StudyTools] Batch save error ${i + 1}:`, err)
        }
      }
      console.log(`[StudyTools] Batch complete: ${batchOutputIds.length}/${batchMindMaps.length} mind maps saved`)
    }

    const activeRecallSync = await syncGeneratedPlanActivity({
      userId: user.id,
      planId,
      planDay,
      activityIndex,
      outputId,
      type,
      documentId: saveDocumentId,
      flashcardData,
      quizData,
    })

    return NextResponse.json({
      success: true,
      id: outputId,
      title: generatedTitle,
      content: processedContent,
      type,
      documentId,
      conversationId: validatedConversationId,
      // Signal if database save failed
      savedToDatabase: outputId !== null,
      activeRecallSync,
      // Include flashcard-specific data in response
      ...(type === 'flashcards' && flashcardData ? {
        cards: flashcardData,
        options: flashcardOptions
      } : {}),
      // Include quiz-specific data in response
      ...(type === 'quiz' && quizData ? {
        questions: quizData,
        options: quizOptions
      } : {}),
      // Include mind-map-specific data in response
      ...(type === 'mind-map' && mindMapData ? {
        mindMapData,
        options: mindMapOptions,
        // Include all batch mind maps with their DB IDs so the client can add them to stores
        ...(batchMindMaps && batchMindMaps.length > 1 ? {
          batchMindMaps: batchMindMaps.map((mm, i) => ({
            id: batchOutputIds[i] || crypto.randomUUID(),
            title: mm.title || mm.centralTopic,
            centralTopic: mm.centralTopic,
            branches: mm.branches,
            metadata: mm.metadata,
          }))
        } : {})
      } : {}),
      metadata: {
        generatedAt: new Date().toISOString(),
        model: modelUsed,
        duration: generationDuration,
        contentLength: processedContent.length,
        sourceContentLength: documentContent.length,
        fallbackStrategy: modelUsed.includes('chunked') || modelUsed.includes('flash') ? 'applied' : 'none',
        ...(type === 'flashcards' && flashcardData ? {
          totalCards: flashcardData.length,
          avgDifficulty: flashcardOptions?.difficulty || 'medium'
        } : {}),
        ...(type === 'quiz' && quizData ? {
          totalQuestions: quizData.length,
          avgDifficulty: quizOptions?.difficulty || 'medium'
        } : {}),
        ...(type === 'mind-map' && mindMapData ? {
          totalNodes: mindMapData.metadata?.totalNodes || 0,
          maxDepth: mindMapData.metadata?.maxDepth || 3
        } : {})
      }
    })

  } catch (error) {
    const errorInstance = error instanceof Error ? error : new Error('Unknown error')
    console.error('[StudyTools] Generation failed:', errorInstance)

    // Log detailed error information for debugging
    console.error('[StudyTools] Error name:', errorInstance.name)
    console.error('[StudyTools] Error message:', errorInstance.message)
    console.error('[StudyTools] Error stack:', errorInstance.stack)

    // SPECIAL HANDLING: All models overloaded - return special error for clean UI handling
    if (errorInstance instanceof AllModelsOverloadedError) {
      console.log('[StudyTools] All models overloaded - returning special error response')
      return NextResponse.json(
        {
          error: errorInstance.message,
          errorType: 'all_models_overloaded', // Special flag for frontend
          retryable: false, // Don't auto-retry, user should manually retry later
          reason: 'All AI models temporarily overloaded',
          details: 'Our AI is experiencing unusually high demand right now. Please try again in a few minutes.'
        },
        { status: 503 }
      )
    }

    // Classify error for retry eligibility
    const errorClassification = classifyError(errorInstance)
    console.log('[StudyTools] Error classification:', errorClassification)

    // Get reason with fallback
    const reason = errorClassification.reason || 'unknown error'

    // Prepare retry payload for background processing (only if we have type assigned)
    const retryPayload: import('@/lib/retry-manager').RetryPayload = type ? {
      type,
      documentId,
      conversationId,
      flashcardOptions,
      timestamp: Date.now(),
      requestId: crypto.randomUUID()
    } as import('@/lib/retry-manager').StudyToolTaskPayload : {
      error: 'Invalid request structure',
      timestamp: Date.now(),
      requestId: crypto.randomUUID()
    }

    if (errorClassification.isRetryable && type) {
      // Add to background retry queue
      const retryId = addRetryAttempt(
        'study-tool-generation',
        retryPayload,
        errorInstance,
        {
          maxRetries: 8, // Enhanced retry count for study tool generation
          baseDelayMs: errorClassification.retryAfterMs || 45000, // Use classification delay or default
          exponentialBackoff: true,
          jitterMs: 10000 // Increased jitter for Google AI
        }
      )

      console.log(`[StudyTools] Added to retry queue with ID: ${retryId}`)

      // Return appropriate user-facing message based on error type
      if (reason.includes('rate limit')) {
        return NextResponse.json(
          {
            error: 'Study tool generation temporarily rate limited. Your request has been queued for automatic retry.',
            retryId,
            retryable: true,
            reason,
            estimatedRetryIn: Math.round((errorClassification.retryAfterMs || 60000) / 1000)
          },
          { status: 429 }
        )
      }

      if (reason.includes('unavailable') || reason.includes('overloaded')) {
        return NextResponse.json(
          {
            error: 'AI service temporarily unavailable. Your request has been queued for automatic retry.',
            retryId,
            retryable: true,
            reason,
            estimatedRetryIn: Math.round((errorClassification.retryAfterMs || 45000) / 1000)
          },
          { status: 503 }
        )
      }

      if (reason.includes('network') || reason.includes('timeout')) {
        return NextResponse.json(
          {
            error: 'Network error occurred. Your request has been queued for automatic retry.',
            retryId,
            retryable: true,
            reason,
            estimatedRetryIn: Math.round((errorClassification.retryAfterMs || 60000) / 1000)
          },
          { status: 503 }
        )
      }

      // Generic retryable error
      return NextResponse.json(
        {
          error: 'Study tool generation failed but will be retried automatically in the background.',
          retryId,
          retryable: true,
          reason,
          estimatedRetryIn: Math.round((errorClassification.retryAfterMs || 60000) / 1000)
        },
        { status: 500 }
      )
    }

    // Handle case where type is not defined (early error in request parsing)
    if (!type) {
      return NextResponse.json(
        {
          error: 'Invalid request format. Please check your request structure.',
          retryable: false,
          reason: 'Invalid request format'
        },
        { status: 400 }
      )
    }

    // Non-retryable errors - provide specific guidance
    if (reason.includes('authentication') || reason.includes('api key')) {
      return NextResponse.json(
        {
          error: 'AI service configuration error. Please contact support if this persists.',
          retryable: false,
          reason
        },
        { status: 500 }
      )
    }

    if (reason.includes('safety') || reason.includes('content')) {
      return NextResponse.json(
        {
          error: 'Content not suitable for study tool generation. Please try with different content.',
          retryable: false,
          reason
        },
        { status: 400 }
      )
    }

    if (reason.includes('invalid') || reason.includes('bad request')) {
      return NextResponse.json(
        {
          error: 'Invalid request parameters. Please check your input and try again.',
          retryable: false,
          reason
        },
        { status: 400 }
      )
    }

    // Fallback for non-retryable errors
    return NextResponse.json(
      {
        error: 'Failed to generate study tool. Please try again with different content or parameters.',
        retryable: false,
        reason,
        details: errorInstance.message
      },
      { status: 500 }
    )
  }
}


/**
 * Build conversation content from messages
 */
function buildConversationContent(messages: Message[]): string {
  let content = ''

  for (const message of messages) {
    const timestamp = new Date(message.created_at).toLocaleString()
    const roleLabel = message.role === 'user' ? 'User' : 'Assistant'

    content += `## ${roleLabel} (${timestamp})\n\n${message.content}\n\n---\n\n`
  }

  return content.trim()
}
