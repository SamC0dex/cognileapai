import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getStudyToolPrompt, generateStudyToolTitle, type StudyToolPromptType } from '@/lib/study-tools-prompts'
import { classifyError, addRetryAttempt } from '@/lib/retry-manager'
import { resolveAIConfig } from '@/lib/ai-router'
import { generateCompletion, type UserAIConfig } from '@/lib/ai-providers'

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
  'flashcards': 8192       // JSON arrays don't need as many tokens
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
      // For flashcards, check if JSON is properly closed
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
        const response = await client.chat.completions.create({
          model: modelConfig.name,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: modelConfig.temperature,
          max_tokens: optimalOutputTokens,
        })

        const resultText = response.choices[0]?.message?.content || ''

        // Check for truncation or insufficient content
        if (resultText.length < 50) {
          throw new Error(`Generated content too short (${resultText.length} chars) - likely generation failure`)
        }

        // Check for potential truncation (ends abruptly without proper conclusion)
        if (resultText.length > 100 && !isContentComplete(resultText, type)) {
          console.warn(`[Fallback] ${modelConfig.name} content appears truncated, may retry with higher token limit`)
        }

        console.log(`[Fallback] Success with ${modelConfig.name} (attempt ${attempt}, ${resultText.length} chars)`)
        return {
          resultText,
          modelUsed: `${modelConfig.name}${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
          duration: Date.now() - modelStartTime
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


interface StudyToolGenerateRequest {
  id?: string
  type: StudyToolPromptType
  documentId?: string
  conversationId?: string
  // Flashcard-specific options
  flashcardOptions?: {
    numberOfCards: 'fewer' | 'standard' | 'more'
    difficulty: 'easy' | 'medium' | 'hard'
    customInstructions?: string
  }
}


interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export async function POST(req: NextRequest) {
  let type: StudyToolPromptType | undefined
  let documentId: string | undefined
  let conversationId: string | undefined
  let flashcardOptions: StudyToolGenerateRequest['flashcardOptions']
  let generationId: string | undefined

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

    // Debug logging
    console.log('[StudyTools] API Request received:', { type, documentId, conversationId })
    console.log('[StudyTools] Environment check:', {
      hasKieKey: !!process.env.KIE_API_KEY,
      hasGeminiKey: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })

    // Validate request
    if (!type || !['study-guide', 'smart-summary', 'smart-notes', 'flashcards'].includes(type)) {
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

    // Get content based on documentId or conversationId
    if (documentId) {
      console.log('[StudyTools] Fetching document:', documentId)

      // Fetch document and its content (filtered by user_id through RLS)
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('id, title, processing_status, document_content')
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

      // Check if document has content
      if (!document.document_content) {
        console.warn('[StudyTools] Document has no content:', documentId)
        return NextResponse.json(
          { error: 'Document has no content available for study tool generation' },
          { status: 422 }
        )
      }

      // Use document content directly
      documentContent = document.document_content
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
    if (documentContent.length < 100) {
      return NextResponse.json(
        { error: 'Insufficient content for generating meaningful study materials' },
        { status: 422 }
      )
    }

    // Get the appropriate prompts for the study tool type
    const { systemPrompt, userPrompt } = getStudyToolPrompt(
      type as StudyToolPromptType,
      documentContent,
      documentTitle,
      flashcardOptions ? {
        numberOfCards: flashcardOptions.numberOfCards,
        difficulty: flashcardOptions.difficulty,
        customInstructions: flashcardOptions.customInstructions
      } : undefined
    )

    console.log(`[StudyTools] Generating ${type} for "${documentTitle}" (${documentContent.length} chars)`)

    // Generate study tool
    const startTime = Date.now()
    let resultText: string
    let modelUsed: string
    let generationDuration: number

    if (userAIConfig) {
      // Use user's configured provider
      resultText = await generateCompletion(userAIConfig, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: TOOL_TOKEN_ALLOCATIONS[type] || 16384,
        temperature: 0.7,
      })
      modelUsed = `${userAIConfig.provider}/${userAIConfig.model}`
      generationDuration = Date.now() - startTime
    } else {
      // Use server Gemini with fallback strategy
      const fallbackResult = await generateWithFallback(systemPrompt, userPrompt, type)
      resultText = fallbackResult.resultText
      modelUsed = fallbackResult.modelUsed
      generationDuration = fallbackResult.duration
    }

    const duration = Date.now() - startTime
    console.log(`[StudyTools] Generated ${type} in ${duration}ms using ${modelUsed} (${resultText.length} chars)`)

    // Special handling for flashcards - parse JSON response
    let processedContent: string = resultText
    let flashcardData = null

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

    // Generate appropriate title
    const generatedTitle = generateStudyToolTitle(type as StudyToolPromptType, documentTitle)

    // Save to database - map frontend types to database types
    const dbType = type === 'smart-summary' ? 'summary' :
                   type === 'smart-notes' ? 'notes' :
                   type === 'study-guide' ? 'study_guide' :
                   type === 'flashcards' ? 'flashcards' : type

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
      // Don't throw - return generated content even if save fails
      // But signal that database save failed
      outputId = null
    }

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
      // Include flashcard-specific data in response
      ...(type === 'flashcards' && flashcardData ? {
        cards: flashcardData,
        options: flashcardOptions
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
    const retryPayload = type ? {
      type,
      documentId,
      conversationId,
      flashcardOptions,
      timestamp: Date.now(),
      requestId: crypto.randomUUID()
    } : {
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