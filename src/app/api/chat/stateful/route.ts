import { NextRequest } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { validateGeminiConfig } from '@/lib/genai-client'
import { GEMINI_MODELS, GeminiModelSelector, type GeminiModelKey } from '@/lib/ai-config'
import { TokenManager } from '@/lib/token-manager'
import { resolveAIConfig } from '@/lib/ai-router'
import { generateCompletionStream, type UserAIConfig } from '@/lib/ai-providers'

// Service role client for background operations only
const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

interface StatefulChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface StatefulChatRequest {
  messages: StatefulChatMessage[]
  chatType: 'course' | 'lesson' | 'document' | 'general'
  documentId?: string
  selectedDocuments?: Array<{id: string, title: string}>
  conversationId?: string
  preferredModel?: string
  reasoningEffort?: 'low' | 'high'
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user first
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Please log in' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('[StatefulChat] Authenticated user:', user.id)

    // Resolve AI config (user preference or server fallback)
    let userAIConfig: UserAIConfig | null = null
    let resolvedProvider = 'kie'
    let resolvedModel = 'gemini-3-flash'

    try {
      const aiConfig = await resolveAIConfig(user.id)
      userAIConfig = aiConfig.userConfig
      resolvedProvider = aiConfig.provider
      resolvedModel = aiConfig.model
      console.log(`[StatefulChat] Using ${aiConfig.source}: ${resolvedProvider}/${resolvedModel}`)
    } catch {
      // No user config and no server key
    }

    // If no config available, validate fallback
    if (!userAIConfig) {
      const validation = validateGeminiConfig()
      if (!validation.isValid) {
        return new Response(
          JSON.stringify({ error: 'No AI provider configured. Please add an API key in Settings.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    const {
      messages,
      chatType,
      documentId,
      selectedDocuments,
      conversationId,
      preferredModel,
      reasoningEffort
    }: StatefulChatRequest = await req.json()

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'Conversation ID required for stateful chat' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const conversationTokenSummary = TokenManager.estimateConversation(
      messages.map(message => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: new Date(message.timestamp)
      }))
    )
    conversationTokenSummary.conversationId = conversationId

    const documentTokenBudget = TokenManager.getOptimalDocumentSize(conversationTokenSummary.totalTokens)

    console.log(
      `[StatefulChat] Tokens ~${conversationTokenSummary.totalTokens.toLocaleString()} (level: ${conversationTokenSummary.warningLevel}), document budget: ${documentTokenBudget.toLocaleString()} tokens`
    )

    // Get the latest user message
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'user') {
      return new Response(
        JSON.stringify({ error: 'Last message must be from user' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Determine model
    const isLegacyKey = preferredModel && preferredModel in GEMINI_MODELS
    const selectedModelKey: GeminiModelKey = isLegacyKey
      ? (preferredModel as GeminiModelKey)
      : 'FLASH'
    const modelConfig = GeminiModelSelector.getModelConfig(selectedModelKey)

    // The actual model ID to use
    const actualModelId = isLegacyKey
      ? modelConfig.name
      : (preferredModel || resolvedModel || modelConfig.name)
    const actualModelName = isLegacyKey
      ? modelConfig.displayName
      : (preferredModel || resolvedModel || modelConfig.displayName)

    console.log(`[StatefulChat] Processing message for conversation: ${conversationId}`)
    console.log(`[StatefulChat] Using model: ${actualModelName} (provider: ${resolvedProvider})`)
    console.log(`[StatefulChat] Message count: ${messages.length}`)

    // ─── Build messages for OpenAI-compatible API ─────────────────────
    const systemPrompt = getSystemPrompt(chatType, documentId, selectedModelKey)
    const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    // Track token counts
    let systemPromptTokens = Math.ceil(systemPrompt.length / 4)
    let documentContextTokens = 0

    // Add document context if any
    if (documentId || selectedDocuments?.length) {
      const documentsToProcess = selectedDocuments?.length
        ? selectedDocuments
        : documentId
        ? [{ id: documentId, title: 'Document' }]
        : []

      if (documentsToProcess.length > 0) {
        try {
          const { data: documents } = await supabase
            .from('documents')
            .select('id, title, document_content, actual_tokens, token_count_method')
            .in('id', documentsToProcess.map(d => d.id))
            .eq('user_id', user.id)

          if (documents && documents.length > 0) {
            console.log(`[StatefulChat] Found ${documents.length} documents`)

            const processedDocs = documents
              .filter(doc => doc.document_content?.trim())
              .map(doc => ({
                id: doc.id,
                title: doc.title,
                content: doc.document_content!,
                actualTokens: doc.actual_tokens,
                tokenMethod: doc.token_count_method
              }))

            if (processedDocs.length > 0) {
              // Check documents have token counts (accept both api_count and estimation)
              const docsWithoutTokens = processedDocs.filter(doc => !doc.actualTokens)

              if (docsWithoutTokens.length > 0) {
                const missingDocs = docsWithoutTokens.map(d => d.title).join(', ')
                return new Response(
                  JSON.stringify({
                    error: 'Document processing incomplete',
                    message: `These documents need reprocessing: ${missingDocs}. Please re-upload them for token counting.`,
                    details: 'Only documents with token counts can be used for chat.'
                  }),
                  { status: 400, headers: { 'Content-Type': 'application/json' } }
                )
              }

              const totalActualTokens = processedDocs.reduce((sum, doc) =>
                sum + (doc.actualTokens || 0), 0)

              console.log(`[StatefulChat] Document tokens: ${totalActualTokens.toLocaleString()}`)
              documentContextTokens = totalActualTokens

              // Build document context within budget
              const budgetChars = documentTokenBudget * 4
              let remainingChars = budgetChars

              const docContext = processedDocs.map(doc => {
                if (remainingChars <= 0) return ''
                const snippet = doc.content.slice(0, remainingChars)
                remainingChars = Math.max(0, remainingChars - snippet.length)
                return `\n\n=== ${doc.title} ===\n${snippet}`
              }).join('').slice(0, budgetChars)

              if (docContext) {
                apiMessages[0].content += `\n\nDocument context:\n${docContext}`
                console.log(`[StatefulChat] Built document context: ${docContext.length} chars`)
              }
            }
          }
        } catch (error) {
          console.error('[StatefulChat] Error fetching document context:', error)
        }
      }
    }

    // Add conversation history
    for (const msg of messages) {
      apiMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
    }

    // Build config for streaming — use user config or create one from resolved config
    const configForStream: UserAIConfig = userAIConfig
      ? { ...userAIConfig, model: actualModelId }
      : {
          provider: resolvedProvider as UserAIConfig['provider'],
          model: actualModelId,
          apiKey: process.env.KIE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
        }

    console.log(`[StatefulChat] Streaming via ${configForStream.provider}/${configForStream.model}`)

    // ─── Stream response ──────────────────────────────────────────────
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = ''
          let apiUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null

          for await (const chunk of generateCompletionStream(configForStream, {
            messages: apiMessages,
            temperature: 0.5,  // Lower temperature for faster, more focused responses
            reasoningEffort: reasoningEffort || undefined,
          })) {
            if (chunk.text) {
              fullResponse += chunk.text
              const data = JSON.stringify(chunk.text)
              controller.enqueue(new TextEncoder().encode(`0:${data}\n`))
            }

            if (chunk.isComplete) {
              // Use real token counts from the API if available, fall back to estimation
              if (chunk.usage) {
                apiUsage = chunk.usage
              }

              const userMessageTokens = apiUsage?.promptTokens ?? Math.ceil(lastMessage.content.length / 4)
              const assistantMessageTokens = apiUsage?.completionTokens ?? Math.ceil(fullResponse.length / 4)
              const totalTokens = apiUsage?.totalTokens ?? (userMessageTokens + assistantMessageTokens)
              const tokenMethod = apiUsage ? 'api_count' as const : 'estimation' as const

              const metadata = {
                usage: {
                  totalTokens,
                  promptTokens: apiUsage?.promptTokens,
                  completionTokens: apiUsage?.completionTokens,
                },
                model: actualModelName,
                modelKey: actualModelId,
                sessionId: null,
                isNewSession: true,
                tokenBudget: {
                  conversation: conversationTokenSummary.totalTokens,
                  conversationLevel: conversationTokenSummary.warningLevel,
                  document: documentTokenBudget,
                },
                tokenBreakdown: {
                  systemPrompt: systemPromptTokens,
                  documentContext: documentContextTokens,
                  method: tokenMethod,
                  isNewSession: true,
                },
                messageTokens: {
                  user: userMessageTokens,
                  assistant: assistantMessageTokens,
                  method: tokenMethod,
                },
              }

              controller.enqueue(new TextEncoder().encode(`8:${JSON.stringify(metadata)}\n`))

              // Save to database with actual token counts so they persist across refreshes
              if (conversationId) {
                try {
                  await saveMessageToDatabase({
                    conversationId,
                    userId: user.id,
                    role: 'user',
                    content: lastMessage.content,
                    metadata: {
                      chatType,
                      documentId,
                      modelUsed: actualModelId,
                      tokens: userMessageTokens,
                      tokenMethod,
                    },
                  })
                  await saveMessageToDatabase({
                    conversationId,
                    userId: user.id,
                    role: 'assistant',
                    content: fullResponse,
                    metadata: {
                      chatType,
                      documentId,
                      modelUsed: actualModelId,
                      model: actualModelName,
                      tokens: assistantMessageTokens,
                      tokenMethod,
                    },
                  })
                } catch (dbErr) {
                  console.error('[StatefulChat] Error saving messages:', dbErr)
                }
              }
            }
          }

          controller.close()
        } catch (error) {
          console.error('[StatefulChat] Streaming error:', error)
          const errMsg = error instanceof Error ? error.message : 'Streaming failed'
          controller.enqueue(new TextEncoder().encode(`3:${JSON.stringify(errMsg)}\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })

  } catch (error) {
    const errorInstance = error instanceof Error ? error : new Error('Unknown error')
    console.error('[StatefulChat] API error:', errorInstance)

    return new Response(
      JSON.stringify({
        error: 'An error occurred while processing your request',
        details: errorInstance.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

function getSystemPrompt(chatType: string, documentId?: string, modelKey?: GeminiModelKey): string {
  const modelConfig = modelKey ? GeminiModelSelector.getModelConfig(modelKey) : null
  const basePrompt = `You are CogniLeap AI, an intelligent learning assistant powered by ${modelConfig?.displayName || 'Gemini 3 Flash'}. You're designed to help students and educators create, understand, and master educational content.`

  const contextPrompts = {
    course: `You are helping to create and plan comprehensive courses. Focus on:
- Structured learning objectives and outcomes
- Logical progression from basic to advanced concepts
- Engaging activities and assessments
- Real-world applications and examples
- Clear module organization and timelines
- Different learning styles and accessibility

Provide detailed, actionable course planning advice with specific examples.`,

    lesson: `You are helping to design individual lessons and learning experiences. Focus on:
- Clear learning objectives for single sessions
- Engaging opening activities and hooks
- Structured content delivery methods
- Interactive elements and student participation
- Assessment strategies and exit tickets
- Time management and pacing
- Materials and resources needed

Create practical, implementable lesson plans with specific activities.`,

    document: `You are analyzing and helping with document-based learning. Focus on:
- Extracting key concepts and main ideas
- Creating structured study materials
- Identifying relationships between concepts
- Generating practice questions and activities
- Summarizing complex information clearly
- Creating visual learning aids when helpful
- Connecting content to broader topics

${documentId ? 'Reference the uploaded document context when providing responses.' : ''}`,

    general: `You are a helpful learning companion. Focus on:
- Clear, educational explanations
- Encouraging curiosity and deeper thinking
- Providing examples and analogies
- Breaking down complex topics
- Offering study strategies and tips
- Supporting different learning preferences

Be encouraging, patient, and adapt your teaching style to the user's needs.`
  }

  const rolePrompt = contextPrompts[chatType as keyof typeof contextPrompts] || contextPrompts.general

  return `${basePrompt}

${rolePrompt}

Guidelines:
- Use clear, structured formatting with headers, bullet points, and numbered lists
- Include practical examples and real-world applications
- Be encouraging and supportive in your tone
- Ask clarifying questions when needed
- Provide actionable advice and next steps
- Use code blocks for any technical content or structured data
- Keep responses focused and relevant to the educational context`
}

async function saveMessageToDatabase({
  conversationId,
  userId,
  role,
  content,
  metadata
}: {
  conversationId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
}) {
  try {
    // Skip database saving if conversation ID is not a proper UUID
    if (!conversationId || !conversationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.log('[StatefulChat] Skipping save for non-UUID conversation ID:', conversationId)
      return
    }

    // Check if conversation exists, create if not
    const { error: convCheckError } = await serviceSupabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .single()

    if (convCheckError && convCheckError.code === 'PGRST116') {
      console.log('[StatefulChat] Creating missing conversation:', conversationId)
      const { error: createError } = await serviceSupabase
        .from('conversations')
        .insert({
          id: conversationId,
          user_id: userId,
          document_id: null,
          title: content.slice(0, 50) + (content.length > 50 ? '...' : '')
        })

      if (createError) {
        console.warn('[StatefulChat] Failed to create conversation:', createError.message)
        return
      }
    }

    // Get current message count for sequence number
    const { count } = await serviceSupabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)

    const sequenceNumber = (count || 0) + 1

    // Save message
    const { error } = await serviceSupabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        sequence_number: sequenceNumber,
        metadata
      })

    if (error) {
      console.warn('[StatefulChat] Failed to save message, continuing without persistence:', error.message)
      return
    }

    console.log('[StatefulChat] Successfully saved message to conversation:', conversationId)
  } catch (error) {
    console.warn('[StatefulChat] Database save failed, continuing without persistence:', error)
  }
}
