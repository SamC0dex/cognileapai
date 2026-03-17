import { NextRequest, NextResponse } from 'next/server'
import { validateGeminiConfig } from '@/lib/ai-config'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { resolveAIConfig } from '@/lib/ai-router'
import { generateCompletion } from '@/lib/ai-providers'

export const maxDuration = 30

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// In-memory cache for document context (5 minutes TTL)
interface CachedDocument {
  data: {
    id: string
    title: string
    sections?: Array<{ title?: string; content?: string }>
  }
  timestamp: number
  content: string
}

const documentCache = new Map<string, CachedDocument>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface ChatDocumentRequest {
  message: string
  documentId: string
  conversationId?: string
  messageHistory?: Array<{ role: 'user' | 'assistant', content: string }>
}

interface DocumentContext {
  id: string
  title: string
  content: string
  sections: Array<{
    id: string
    title: string
    content: string
    relevanceScore?: number
  }>
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    // Authenticate user
    const authSupabase = await createAuthClient()
    const { data: { user } } = await authSupabase.auth.getUser()

    // Parse request body
    const {
      message,
      documentId,
      conversationId
    }: ChatDocumentRequest = await req.json()

    // Validate required fields
    if (!message || typeof message !== 'string') {
      return new NextResponse(
        JSON.stringify({ error: 'Please enter a message' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (message.trim().length === 0) {
      return new NextResponse(
        JSON.stringify({ error: 'Please enter a message' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (message.length > 2000) {
      return new NextResponse(
        JSON.stringify({ error: 'Message too long. Please keep under 2000 characters.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!documentId) {
      return new NextResponse(
        JSON.stringify({ error: 'Document ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Load document context with caching
    const documentContext = await loadDocumentContext(documentId, message)
    
    if (!documentContext) {
      return new NextResponse(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build AI prompt with document context
    const systemPrompt = buildSystemPrompt(documentContext)
    const contextualMessage = buildContextualMessage(message, documentContext)

    let aiResponseText: string
    let modelUsedLabel = 'FLASH_LITE'
    let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null

    // Try user's configured provider first, fall back to server Gemini
    const aiConfig = user ? await resolveAIConfig(user.id).catch(() => null) : null

    if (aiConfig?.userConfig) {
      console.log(`[AI] Using ${aiConfig.provider}/${aiConfig.model} for document chat`)
      const result = await generateCompletion(aiConfig.userConfig, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextualMessage },
        ],
        maxTokens: 2048,
        temperature: 0.5,
      })
      aiResponseText = result.text
      tokenUsage = result.usage
      modelUsedLabel = `${aiConfig.provider}/${aiConfig.model}`
    } else {
      // Server fallback — use resolveAIConfig to get Kie config
      const validation = validateGeminiConfig()
      if (!validation.isValid) {
        return new NextResponse(
          JSON.stringify({ error: 'No AI provider configured. Please add an API key in Settings.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const serverKey = process.env.KIE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      if (!serverKey) {
        return new NextResponse(
          JSON.stringify({ error: 'No AI API key configured.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const serverModel = 'gemini-3-flash'
      console.log(`[AI] Using server Kie.ai/${serverModel} for document chat`)

      const result = await generateCompletion(
        { provider: 'kie', model: serverModel, apiKey: serverKey },
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contextualMessage },
          ],
          maxTokens: 2048,
          temperature: 0.5,
        }
      )
      aiResponseText = result.text
      tokenUsage = result.usage
      modelUsedLabel = `kie/${serverModel}`
    }

    const totalTokens = tokenUsage?.totalTokens ?? Math.ceil(aiResponseText.length / 4)

    // Save messages to database
    try {
      await saveMessagesToDatabase({
        conversationId,
        documentId,
        userMessage: message,
        aiResponse: aiResponseText,
        modelUsed: modelUsedLabel,
        tokenUsage: totalTokens,
        responseTime: Date.now() - startTime
      })
    } catch (error) {
      console.error('[DB] Failed to save messages:', error)
    }

    // Return response with proper headers
    return NextResponse.json({
      content: aiResponseText,
      model: modelUsedLabel,
      usage: {
        totalTokenCount: totalTokens,
        promptTokens: tokenUsage?.promptTokens,
        completionTokens: tokenUsage?.completionTokens,
        method: tokenUsage ? 'api_count' : 'estimation',
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Response-Time': `${Date.now() - startTime}ms`
      }
    })

  } catch (error) {
    console.error('[API] Document chat error:', error)
    
    // Handle rate limiting
    if (error instanceof Error && error.message.includes('rate limit')) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests, please wait' }),
        { 
          status: 429, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generic AI error
    return new NextResponse(
      JSON.stringify({ 
        error: "Sorry, I couldn't generate a response",
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function loadDocumentContext(documentId: string, message: string): Promise<DocumentContext | null> {
  try {
    // Check cache first
    const cacheKey = documentId
    const cached = documentCache.get(cacheKey)
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[Cache] Using cached document context for ${documentId}`)
      // Reconstruct proper DocumentContext from cached data
      const cachedContext: DocumentContext = {
        id: cached.data.id,
        title: cached.data.title,
        content: cached.content,
        sections: (cached.data.sections || []).map((section, index) => ({
          id: `cached-section-${index}`,
          title: section.title || '',
          content: section.content || ''
        }))
      }
      return selectRelevantSections(cachedContext, message)
    }

    // Fetch document from database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, content, metadata')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      console.error('[DB] Document not found:', docError)
      return null
    }

    // Fetch document sections
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('id, title, content, section_type, order_index')
      .eq('document_id', documentId)
      .order('order_index', { ascending: true })

    if (sectionsError) {
      console.error('[DB] Error fetching sections:', sectionsError)
      // Continue without sections if they fail to load
    }

    const documentData: DocumentContext = {
      id: document.id,
      title: document.title,
      content: document.content || '',
      sections: (sections || []).map(section => ({
        id: section.id,
        title: section.title,
        content: section.content
      }))
    }

    // Cache the result
    documentCache.set(cacheKey, {
      data: documentData,
      timestamp: Date.now(),
      content: document.content || ''
    })

    return selectRelevantSections(documentData, message)

  } catch (error) {
    console.error('[DB] Error loading document context:', error)
    return null
  }
}

function selectRelevantSections(documentContext: DocumentContext, message: string): DocumentContext {
  // For general questions, include overview
  const isGeneralQuery = /^(what|how|why|explain|tell me about|summarize|overview)/i.test(message.trim())
  
  if (isGeneralQuery) {
    // Include first few sections and overview
    return {
      ...documentContext,
      sections: documentContext.sections.slice(0, 3)
    }
  }

  // For specific questions, try to find relevant sections
  const messageLower = message.toLowerCase()
  const relevantSections = documentContext.sections.filter(section => {
    const sectionText = `${section.title} ${section.content}`.toLowerCase()
    const words = messageLower.split(/\s+/).filter(word => word.length > 3)
    
    return words.some(word => sectionText.includes(word))
  }).slice(0, 5) // Limit to 5 most relevant sections

  // If no specific matches, include first few sections
  if (relevantSections.length === 0) {
    return {
      ...documentContext,
      sections: documentContext.sections.slice(0, 3)
    }
  }

  return {
    ...documentContext,
    sections: relevantSections
  }
}

function buildSystemPrompt(documentContext: DocumentContext): string {
  const tableOfContents = documentContext.sections
    .map((section, index) => `${index + 1}. ${section.title}`)
    .join('\n')

  return `You are a helpful AI assistant discussing the document: "${documentContext.title}".

Your knowledge is limited to this document's content. Answer based solely on the document provided below.

If something isn't covered in the document, clearly state "This information is not available in the document" or "The document doesn't cover this topic."

Be concise but thorough. Use specific quotes when relevant and always cite which section you're referencing.

Format your responses using markdown for clarity:
- Use **bold** for key terms
- Use > blockquotes for direct quotes  
- Use bullet points for lists
- Use code blocks for technical content

TABLE OF CONTENTS:
${tableOfContents}

Remember: Only answer based on the document content provided. Do not add external knowledge.`
}

function buildContextualMessage(message: string, documentContext: DocumentContext): string {
  // Build context with token limit consideration (~4000 tokens = ~16000 characters)
  let context = `DOCUMENT: "${documentContext.title}"\n\n`
  
  // Add relevant sections
  let contextLength = context.length
  const maxContextLength = 12000 // Leave room for the message and system prompt
  
  for (const section of documentContext.sections) {
    const sectionText = `SECTION: ${section.title}\n${section.content}\n\n`
    
    if (contextLength + sectionText.length > maxContextLength) {
      context += `... (Additional sections available but truncated for length)\n\n`
      break
    }
    
    context += sectionText
    contextLength += sectionText.length
  }
  
  // Add the user's question
  context += `USER QUESTION: ${message}`
  
  return context
}

async function saveMessagesToDatabase({
  conversationId,
  documentId,
  userMessage,
  aiResponse,
  modelUsed,
  tokenUsage,
  responseTime
}: {
  conversationId?: string
  documentId: string
  userMessage: string
  aiResponse: string
  modelUsed: string
  tokenUsage: number
  responseTime: number
}) {
  if (!conversationId) {
    console.log('[DB] No conversation ID provided, skipping message save')
    return
  }

  try {
    // Get current message count for sequence numbers
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)

    const userSequenceNumber = (count || 0) + 1
    const aiSequenceNumber = userSequenceNumber + 1

    // Save user message
    const { error: userError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: userMessage,
        sequence_number: userSequenceNumber,
        metadata: {
          document_id: documentId,
          response_time: responseTime
        }
      })

    if (userError) {
      throw new Error(`Failed to save user message: ${userError.message}`)
    }

    // Save AI message
    const { error: aiError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: aiResponse,
        sequence_number: aiSequenceNumber,
        metadata: {
          model: modelUsed,
          tokens: tokenUsage,
          response_time: responseTime,
          document_id: documentId
        }
      })

    if (aiError) {
      throw new Error(`Failed to save AI message: ${aiError.message}`)
    }

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    console.log(`[DB] Saved messages for conversation ${conversationId}`)

  } catch (error) {
    console.error('[DB] Error saving messages:', error)
    throw error
  }
}

// Cleanup cache periodically (every 10 minutes)
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, value] of documentCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        documentCache.delete(key)
      }
    }
  }, 10 * 60 * 1000)
}