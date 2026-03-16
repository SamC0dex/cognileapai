/**
 * Kie.ai Chat Client Wrapper (OpenAI-compatible)
 * Provides stateful chat sessions with conversation memory
 * Uses Kie.ai API via OpenAI SDK for generation
 * Includes database persistence to survive server restarts
 */

import OpenAI from 'openai'
import type { GeminiModelKey } from './ai-config'
import { GEMINI_MODELS, GeminiModelSelector } from './ai-config'
import { saveSession, loadSession, findSessionByConversation, updateSessionActivity } from './session-store'
import { getTokenCounter } from './token-counter'

// Default model and provider config
const DEFAULT_MODEL = 'gemini-3-flash'
const KIE_BASE_URL = 'https://api.kie.ai'

/**
 * Get the API key for Kie.ai (server-side fallback)
 */
function getServerApiKey(): string | null {
  return process.env.KIE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || null
}

/**
 * Validate server-side AI configuration
 */
export function validateGeminiConfig(): { isValid: boolean; error?: string } {
  const apiKey = getServerApiKey()

  if (!apiKey) {
    return {
      isValid: false,
      error: 'No AI API key configured. Set KIE_API_KEY in your .env.local or add a key in Settings.'
    }
  }

  return { isValid: true }
}

/**
 * Create an OpenAI client pointing at Kie.ai
 */
function createKieClient(apiKey: string, model: string): OpenAI {
  const baseURL = `${KIE_BASE_URL}/${model}/v1`
  return new OpenAI({
    apiKey,
    baseURL,
  })
}

// Stateful chat session interface
export interface StatefulChatSession {
  id: string
  conversationId: string
  documentContext?: string
  systemPrompt: string
  history: Array<{
    role: 'user' | 'model'
    parts: Array<{ text: string }>
  }>
  modelKey: GeminiModelKey
  createdAt: Date
  lastActivityAt: Date
  actualSystemTokens?: number
  actualDocumentTokens?: number
  tokenCountMethod?: 'api_count' | 'estimation'
}

// Session storage (in-memory, can be moved to Redis later)
const activeSessions = new Map<string, StatefulChatSession>()

// Session cleanup (remove inactive sessions after 1 hour)
const SESSION_TTL = 60 * 60 * 1000 // 1 hour
setInterval(() => {
  const now = Date.now()
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastActivityAt.getTime() > SESSION_TTL) {
      activeSessions.delete(sessionId)
      console.log(`[GenAI] Cleaned up inactive session: ${sessionId}`)
    }
  }
}, 15 * 60 * 1000) // Clean every 15 minutes

export interface CreateChatOptions {
  conversationId: string
  modelKey?: GeminiModelKey
  systemPrompt: string
  documentContext?: string
  history?: Array<{
    role: 'user' | 'model'
    parts: Array<{ text: string }>
  }>
  countActualTokens?: boolean
  preCountedSystemTokens?: number
  preCountedDocumentTokens?: number
  tokenCountMethod?: 'api_count' | 'estimation'
}

export interface SendMessageOptions {
  message: string
  sessionId: string
  apiKey?: string  // Optional: use user's API key instead of server key
  model?: string   // Optional: override model
}

export interface StreamChunk {
  text: string
  isComplete?: boolean
  usage?: {
    totalTokens?: number
    promptTokens?: number
    completionTokens?: number
  }
}

/**
 * Create a new stateful chat session with database persistence
 */
export async function createStatefulChat(options: CreateChatOptions): Promise<string> {
  try {
    // First check if session already exists in database
    const existingSession = await findSessionByConversation(options.conversationId)

    if (existingSession) {
      console.log(`[GenAI] Found existing session in database: ${existingSession.id}`)

      // Restore session to memory
      const session: StatefulChatSession = {
        id: existingSession.id,
        conversationId: existingSession.conversation_id,
        documentContext: existingSession.document_context,
        systemPrompt: existingSession.system_prompt,
        history: existingSession.conversation_history,
        modelKey: existingSession.model_key,
        createdAt: new Date(existingSession.created_at),
        lastActivityAt: new Date(),
        actualSystemTokens: existingSession.actual_system_tokens,
        actualDocumentTokens: existingSession.actual_document_tokens,
        tokenCountMethod: existingSession.token_count_method
      }

      activeSessions.set(existingSession.id, session)
      await updateSessionActivity(existingSession.id)

      return existingSession.id
    }

    const modelKey = options.modelKey || 'FLASH'
    const modelConfig = GEMINI_MODELS[modelKey]

    console.log(`[GenAI] Creating new stateful chat with model: ${modelConfig.name} (via Kie.ai)`)

    // Generate session ID
    const sessionId = crypto.randomUUID()

    // Use pre-counted tokens if provided, otherwise estimate them
    let actualSystemTokens: number | undefined = options.preCountedSystemTokens
    let actualDocumentTokens: number | undefined = options.preCountedDocumentTokens
    let tokenCountMethod: 'api_count' | 'estimation' = options.tokenCountMethod || 'estimation'

    if (!actualSystemTokens && !actualDocumentTokens && options.countActualTokens !== false) {
      try {
        const tokenCounter = getTokenCounter()

        if (options.systemPrompt) {
          const systemResult = await tokenCounter.countTokens({
            model: modelConfig.name,
            content: '',
            systemInstruction: options.systemPrompt
          })
          actualSystemTokens = systemResult.totalTokens
          console.log(`[GenAI] System prompt tokens: ${actualSystemTokens} (${systemResult.method})`)
        }

        if (options.documentContext) {
          const docResult = await tokenCounter.countTokensCached(
            `doc:${options.conversationId}:${modelKey}`,
            {
              model: modelConfig.name,
              content: options.documentContext
            }
          )
          actualDocumentTokens = docResult.totalTokens
          tokenCountMethod = docResult.method
          console.log(`[GenAI] Document context tokens: ${actualDocumentTokens} (${docResult.method})`)
        }

        if (actualSystemTokens !== undefined && actualDocumentTokens !== undefined) {
          tokenCountMethod = 'api_count'
        }
      } catch (error) {
        console.warn('[GenAI] Failed to count tokens, will use estimates:', error)
        tokenCountMethod = 'estimation'
      }
    } else if (actualSystemTokens || actualDocumentTokens) {
      console.log(`[GenAI] Using pre-counted tokens: system=${actualSystemTokens || 0}, document=${actualDocumentTokens || 0}, method=${tokenCountMethod}`)
    }

    // Create session object
    const session: StatefulChatSession = {
      id: sessionId,
      conversationId: options.conversationId,
      documentContext: options.documentContext,
      systemPrompt: options.systemPrompt,
      history: options.history || [],
      modelKey,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      actualSystemTokens,
      actualDocumentTokens,
      tokenCountMethod
    }

    // Store in memory first
    activeSessions.set(sessionId, session)

    // Save to database for persistence
    const saved = await saveSession({
      id: sessionId,
      conversationId: options.conversationId,
      modelKey,
      systemPrompt: options.systemPrompt,
      documentContext: options.documentContext,
      history: options.history || [],
      actualSystemTokens,
      actualDocumentTokens,
      tokenCountMethod
    })

    if (!saved) {
      console.warn(`[GenAI] Failed to save session to database: ${sessionId}`)
    }

    console.log(`[GenAI] Created stateful session: ${sessionId} for conversation: ${options.conversationId} (tokens: ${tokenCountMethod})`)

    return sessionId
  } catch (error) {
    console.error('[GenAI] Failed to create stateful chat:', error)
    throw error
  }
}

/**
 * Send message to existing stateful session with streaming
 * Uses Kie.ai via OpenAI SDK
 */
export async function* sendStatefulMessage(options: SendMessageOptions): AsyncGenerator<StreamChunk> {
  let session = activeSessions.get(options.sessionId)

  // If session not in memory, try to load from database
  if (!session) {
    console.log(`[GenAI] Session ${options.sessionId} not in memory, loading from database`)
    const persistedSession = await loadSession(options.sessionId)

    if (!persistedSession) {
      throw new Error(`Session not found: ${options.sessionId}`)
    }

    // Restore session to memory
    session = {
      id: persistedSession.id,
      conversationId: persistedSession.conversation_id,
      documentContext: persistedSession.document_context,
      systemPrompt: persistedSession.system_prompt,
      history: persistedSession.conversation_history,
      modelKey: persistedSession.model_key,
      createdAt: new Date(persistedSession.created_at),
      lastActivityAt: new Date()
    }

    activeSessions.set(options.sessionId, session)
    console.log(`[GenAI] Restored session from database: ${options.sessionId}`)
  }

  try {
    const apiKey = options.apiKey || getServerApiKey()
    if (!apiKey) {
      throw new Error('No API key available for generation. Set KIE_API_KEY or add a key in Settings.')
    }

    const modelName = options.model || GeminiModelSelector.getModelName(session.modelKey)

    // Update last activity
    session.lastActivityAt = new Date()

    console.log(`[GenAI] Sending message via Kie.ai to session: ${options.sessionId} (model: ${modelName})`)

    // Build OpenAI-compatible messages array
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

    // System prompt
    let systemContent = session.systemPrompt || ''
    if (session.documentContext) {
      systemContent += '\n\nDocument context:\n' + session.documentContext
    }
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent })
    }

    // Conversation history
    for (const entry of session.history) {
      messages.push({
        role: entry.role === 'model' ? 'assistant' : 'user',
        content: entry.parts.map(p => p.text).join('')
      })
    }

    // Current user message
    messages.push({ role: 'user', content: options.message })

    // Create Kie client and stream response
    const client = createKieClient(apiKey, modelName)

    const stream = await client.chat.completions.create({
      model: modelName,
      messages,
      max_tokens: 4000,
      temperature: 0.7,
      stream: true,
    })

    let accumulatedText = ''

    try {
      for await (const chunk of stream) {
        const chunkText = chunk.choices[0]?.delta?.content || ''
        if (chunkText) {
          accumulatedText += chunkText
          yield {
            text: chunkText,
            isComplete: false
          }
        }
      }
    } catch (streamError) {
      console.error(`[GenAI] Stream error for session ${options.sessionId}:`, streamError)
    }

    // Ensure we have some response content
    if (!accumulatedText.trim()) {
      accumulatedText = "I apologize, but I encountered an issue generating a response. Please try again."
      console.warn(`[GenAI] Empty response for session ${options.sessionId}, using fallback message`)
    }

    // Add conversation to history
    session.history.push({
      role: 'user',
      parts: [{ text: options.message }]
    })
    session.history.push({
      role: 'model',
      parts: [{ text: accumulatedText }]
    })

    // Save updated session to database (non-blocking)
    try {
      await saveSession({
        id: session.id,
        conversationId: session.conversationId,
        modelKey: session.modelKey,
        systemPrompt: session.systemPrompt,
        documentContext: session.documentContext,
        history: session.history
      })
    } catch (dbError) {
      console.error(`[GenAI] Failed to save session ${options.sessionId}:`, dbError)
    }

    // Final chunk with completion signal
    yield {
      text: '',
      isComplete: true,
      usage: {
        totalTokens: Math.ceil(accumulatedText.length / 4),
        promptTokens: undefined,
        completionTokens: undefined
      }
    }

    console.log(`[GenAI] Message sent successfully to session: ${options.sessionId}`)

  } catch (error) {
    console.error(`[GenAI] Failed to send message to session ${options.sessionId}:`, error)

    yield {
      text: "I apologize, but I encountered an error processing your request. Please try again.",
      isComplete: true,
      usage: {
        totalTokens: 20,
        promptTokens: undefined,
        completionTokens: undefined
      }
    }
  }
}

/**
 * Get session information
 */
export function getSessionInfo(sessionId: string): StatefulChatSession | null {
  return activeSessions.get(sessionId) || null
}

/**
 * Get chat history from session
 */
export async function getSessionHistory(sessionId: string): Promise<Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> | null> {
  const session = activeSessions.get(sessionId)
  if (!session) {
    return null
  }
  return session.history
}

/**
 * Close and cleanup session
 */
export function closeSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId)
  if (session) {
    activeSessions.delete(sessionId)
    console.log(`[GenAI] Closed session: ${sessionId}`)
    return true
  }
  return false
}

/**
 * Get active session statistics
 */
export function getSessionStats() {
  const now = Date.now()
  let activeCount = 0
  let oldestSession = now

  for (const session of activeSessions.values()) {
    const lastActivity = session.lastActivityAt.getTime()
    if (now - lastActivity < SESSION_TTL) {
      activeCount++
      oldestSession = Math.min(oldestSession, session.createdAt.getTime())
    }
  }

  return {
    totalSessions: activeSessions.size,
    activeSessions: activeCount,
    oldestSessionAge: oldestSession < now ? Math.floor((now - oldestSession) / 1000) : 0
  }
}
