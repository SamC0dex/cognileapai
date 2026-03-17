/**
 * Token Management System for Gemini Models
 * Provides accurate token counting, conversation tracking, and context window management
 */

// Token estimation constants based on Gemini API documentation
export const TOKEN_ESTIMATION = {
  CHARS_PER_TOKEN: 4, // ~4 characters per token for Gemini models
  WORDS_PER_TOKEN: 0.75, // ~0.75 words per token for English text
  BUFFER_PERCENTAGE: 0.1, // 10% safety buffer
} as const

// Context window limits (2025 specs)
export const CONTEXT_LIMITS = {
  // Gemini 2.5 model limits
  GEMINI_INPUT_MAX: 1048576, // 1M+ tokens
  GEMINI_OUTPUT_MAX: 65536,  // 64K+ tokens

  // Practical limits for optimal quality
  PRACTICAL_INPUT_MAX: 200000, // 200K tokens (research-backed optimal performance)
  PRACTICAL_OUTPUT_MAX: 8192,  // 8K tokens for responses

  // Warning thresholds
  WARNING_THRESHOLD: 150000,   // 150K tokens - warn user
  CRITICAL_THRESHOLD: 180000,  // 180K tokens - suggest new chat
} as const

export interface TokenCount {
  estimated: number
  exact?: number
  confidence: 'high' | 'medium' | 'low'
  method: 'estimation' | 'api_count' | 'cached'
  timestamp: Date
}

export interface ConversationTokens {
  conversationId: string
  totalTokens: number
  messageTokens: number
  userTokens: number
  assistantTokens: number
  documentTokens: number
  systemTokens: number
  lastUpdated: Date
  warningLevel: 'none' | 'caution' | 'warning' | 'critical'
  method?: 'estimation' | 'api_count' // Track how tokens were counted (no more mixed)
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  tokenCount?: TokenCount
}

/**
 * Fast token estimation based on character count
 */
export function estimateTokensFromText(text: string): TokenCount {
  if (!text || text.length === 0) {
    return {
      estimated: 0,
      confidence: 'high',
      method: 'estimation',
      timestamp: new Date()
    }
  }

  // Clean text for more accurate estimation
  const cleanText = text.trim()
  const charCount = cleanText.length
  const wordCount = cleanText.split(/\s+/).filter(word => word.length > 0).length

  // Use multiple estimation methods and average
  const charBasedTokens = Math.ceil(charCount / TOKEN_ESTIMATION.CHARS_PER_TOKEN)
  const wordBasedTokens = Math.ceil(wordCount / TOKEN_ESTIMATION.WORDS_PER_TOKEN)

  // Weight character-based estimation more heavily for accuracy
  const estimated = Math.round((charBasedTokens * 0.7) + (wordBasedTokens * 0.3))

  // Determine confidence based on text characteristics
  let confidence: 'high' | 'medium' | 'low' = 'high'
  if (text.includes('```') || text.includes('<') || text.includes('{')) {
    confidence = 'medium' // Code or structured content may have different token density
  }
  if (charCount > 50000) {
    confidence = 'medium' // Very large text may have estimation drift
  }

  return {
    estimated,
    confidence,
    method: 'estimation',
    timestamp: new Date()
  }
}

/**
 * Create conversation tokens with actual API counts
 * @param messages - Array of messages to count
 * @param actualTokens - Actual token counts from Gemini API
 */
export function createConversationTokensWithActual(
  messages: Message[],
  actualTokens: {
    systemPrompt: number
    documentContext: number
    method: 'api_count' | 'estimation'
  }
): ConversationTokens {
  // Document context tokens are already included in the API's input token count
  // (part of user message tokens), so we don't add them separately to avoid double-counting
  const messageTokens = estimateConversationTokens(messages, {
    systemPrompt: actualTokens.systemPrompt,
    documentContext: 0
  })

  return {
    ...messageTokens,
    method: actualTokens.method,
    systemTokens: actualTokens.systemPrompt,
    documentTokens: 0,
    totalTokens: messageTokens.messageTokens + actualTokens.systemPrompt
  }
}

/**
 * Estimate tokens for multiple messages (conversation context)
 * @param messages - Array of messages to count
 * @param externalTokens - Optional external token counts (e.g., from API metadata)
 */
export function estimateConversationTokens(
  messages: Message[],
  externalTokens?: {
    systemPrompt?: number
    documentContext?: number
  }
): ConversationTokens {
  let totalTokens = 0
  let messageTokens = 0
  let userTokens = 0
  let assistantTokens = 0
  let documentTokens = externalTokens?.documentContext || 0
  let systemTokens = externalTokens?.systemPrompt || 0

  for (const message of messages) {
    const tokenCount = message.tokenCount || estimateTokensFromText(message.content)
    const tokens = tokenCount.estimated

    totalTokens += tokens

    switch (message.role) {
      case 'user':
        userTokens += tokens
        messageTokens += tokens
        break
      case 'assistant':
        assistantTokens += tokens
        messageTokens += tokens
        break
      case 'system':
        // System messages often contain document context (fallback if externalTokens not provided)
        if (!externalTokens && message.content.includes('You have access to the following content')) {
          documentTokens += tokens
        } else if (!externalTokens) {
          systemTokens += tokens
        }
        break
    }
  }

  // Add external tokens to total
  totalTokens += systemTokens + documentTokens

  // Determine warning level
  let warningLevel: 'none' | 'caution' | 'warning' | 'critical' = 'none'
  if (totalTokens >= CONTEXT_LIMITS.PRACTICAL_INPUT_MAX) {
    warningLevel = 'critical'
  } else if (totalTokens >= CONTEXT_LIMITS.CRITICAL_THRESHOLD) {
    warningLevel = 'warning'
  } else if (totalTokens >= CONTEXT_LIMITS.WARNING_THRESHOLD) {
    warningLevel = 'caution'
  }

  return {
    conversationId: '', // Will be set by caller
    totalTokens,
    messageTokens,
    userTokens,
    assistantTokens,
    documentTokens,
    systemTokens,
    lastUpdated: new Date(),
    warningLevel,
    method: externalTokens ? 'api_count' : 'estimation' // api_count if using external, estimation if all calculated
  }
}

/**
 * Validate estimated tokens against actual API counts
 * @param estimated - Estimated conversation tokens
 * @param actual - Actual token counts from API
 * @returns Updated tokens with accuracy delta
 */
export function validateWithActualCounts(
  estimated: ConversationTokens,
  actual: {
    systemPrompt?: number
    documentContext?: number
    totalMessages?: number
  }
): ConversationTokens & { accuracyDelta: number } {
  let correctedTotal = estimated.totalTokens
  let correctedSystem = estimated.systemTokens
  let correctedDocument = estimated.documentTokens

  // Use actual counts if provided
  if (actual.systemPrompt !== undefined) {
    correctedTotal = correctedTotal - estimated.systemTokens + actual.systemPrompt
    correctedSystem = actual.systemPrompt
  }

  if (actual.documentContext !== undefined) {
    correctedTotal = correctedTotal - estimated.documentTokens + actual.documentContext
    correctedDocument = actual.documentContext
  }

  // Calculate accuracy delta (percentage difference)
  const delta = estimated.totalTokens > 0
    ? Math.abs(correctedTotal - estimated.totalTokens) / estimated.totalTokens * 100
    : 0

  // Determine warning level with corrected total
  let warningLevel: 'none' | 'caution' | 'warning' | 'critical' = 'none'
  if (correctedTotal >= CONTEXT_LIMITS.PRACTICAL_INPUT_MAX) {
    warningLevel = 'critical'
  } else if (correctedTotal >= CONTEXT_LIMITS.CRITICAL_THRESHOLD) {
    warningLevel = 'warning'
  } else if (correctedTotal >= CONTEXT_LIMITS.WARNING_THRESHOLD) {
    warningLevel = 'caution'
  }

  return {
    ...estimated,
    totalTokens: correctedTotal,
    systemTokens: correctedSystem,
    documentTokens: correctedDocument,
    warningLevel,
    method: (actual.systemPrompt || actual.documentContext) ? 'api_count' : estimated.method,
    lastUpdated: new Date(),
    accuracyDelta: delta
  }
}

/**
 * Check if adding new content would exceed context limits
 */
export function canAddContent(
  currentTokens: number,
  newContentTokens: number,
  limit: number = CONTEXT_LIMITS.PRACTICAL_INPUT_MAX
): {
  canAdd: boolean
  remaining: number
  wouldExceed: boolean
  suggestedAction?: string
} {
  const total = currentTokens + newContentTokens
  const remaining = limit - currentTokens
  const wouldExceed = total > limit

  let suggestedAction: string | undefined
  if (wouldExceed) {
    if (total > CONTEXT_LIMITS.CRITICAL_THRESHOLD) {
      suggestedAction = 'Start a new conversation for optimal performance'
    } else if (total > CONTEXT_LIMITS.WARNING_THRESHOLD) {
      suggestedAction = 'Consider starting a new conversation soon'
    } else {
      suggestedAction = 'Monitor conversation length'
    }
  }

  return {
    canAdd: !wouldExceed,
    remaining: Math.max(0, remaining),
    wouldExceed,
    suggestedAction
  }
}

/**
 * Generate user-friendly warning messages
 */
export function getContextWarningMessage(tokens: ConversationTokens): string | null {
  const { totalTokens, warningLevel } = tokens
  const percentage = Math.round((totalTokens / CONTEXT_LIMITS.PRACTICAL_INPUT_MAX) * 100)

  switch (warningLevel) {
    case 'caution':
      return `💡 Tip: Conversation is ${percentage}% of the context window. Consider starting a new chat soon for best quality.`

    case 'warning':
      return `⚠️ Context window is ${percentage}% full. AI response quality may decline without a fresh chat or optimization.`

    case 'critical':
      return `🚨 Context limit reached (${totalTokens.toLocaleString()} tokens). Start a new chat or optimize to continue.`

    default:
      return null
  }
}

/**
 * Optimize conversation by summarizing old messages
 */
export function optimizeConversationLength(
  messages: Message[],
  targetTokens: number = Math.round(CONTEXT_LIMITS.PRACTICAL_INPUT_MAX * 0.6),
  options?: {
    leadingMessages?: number
    trailingMessages?: number
    minimumTrailing?: number
    highlightSamples?: number
  }
): {
  optimizedMessages: Message[]
  summaryMessage?: Message
  tokensRemoved: number
  tokensKept: number
  removedMessages: Message[]
  keptLeading: number
  keptTrailing: number
  highlightSnippets: string[]
} {
  const {
    leadingMessages = 3,
    trailingMessages = 30,
    minimumTrailing = 8,
    highlightSamples = 3
  } = options ?? {}

  const conversationTokens = estimateConversationTokens(messages)

  if (conversationTokens.totalTokens <= targetTokens) {
    return {
      optimizedMessages: messages,
      tokensRemoved: 0,
      tokensKept: conversationTokens.totalTokens,
      removedMessages: [],
      keptLeading: Math.min(leadingMessages, messages.length),
      keptTrailing: Math.min(trailingMessages, messages.length),
      highlightSnippets: []
    }
  }

  const tokenizedMessages = messages.map(message => ({
    message,
    tokens: (message.tokenCount || estimateTokensFromText(message.content)).estimated
  }))

  const headCount = Math.min(leadingMessages, tokenizedMessages.length)
  const leadingSlice = tokenizedMessages.slice(0, headCount)

  const trailingStart = Math.max(headCount, tokenizedMessages.length - trailingMessages)
  const trailingSlice = tokenizedMessages.slice(trailingStart)

  const middleSlice = tokenizedMessages.slice(headCount, trailingStart)

  let keptTokens = [...leadingSlice, ...trailingSlice].reduce((sum, entry) => sum + entry.tokens, 0)

  if (keptTokens > targetTokens) {
    const minTrailing = Math.max(1, Math.min(minimumTrailing, trailingSlice.length))
    while (keptTokens > targetTokens && trailingSlice.length > minTrailing) {
      const shifted = trailingSlice.shift()
      if (shifted) {
        keptTokens -= shifted.tokens
        middleSlice.unshift(shifted)
      }
    }
  }

  if (keptTokens > targetTokens && leadingSlice.length > 1) {
    while (keptTokens > targetTokens && leadingSlice.length > 1) {
      const removed = leadingSlice.pop()
      if (removed) {
        keptTokens -= removed.tokens
        middleSlice.unshift(removed)
      }
    }
  }

  const removedMessages = middleSlice.map(entry => entry.message)
  const tokensRemoved = Math.max(conversationTokens.totalTokens - keptTokens, 0)

  const highlightCandidates = middleSlice
    .filter(entry => entry.message.role === 'user')
    .map(entry => entry.message.content.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const highlightSnippets = highlightCandidates
    .slice(0, highlightSamples)
    .map(snippet => snippet.length > 140 ? `${snippet.slice(0, 137)}...` : snippet)

  let summaryMessage: Message | undefined
  if (removedMessages.length > 0) {
    const summaryLines = [`[Previous conversation summary: ${removedMessages.length} messages were condensed to keep the latest context intact.]`]

    if (highlightSnippets.length > 0) {
      summaryLines.push('', 'Key themes touched on:', ...highlightSnippets.map(line => `• ${line}`))
    }

    summaryLines.push('', `Tokens removed: ~${tokensRemoved.toLocaleString()} | Tokens kept: ~${keptTokens.toLocaleString()}`)

    const summaryContent = summaryLines.join('\n')

    summaryMessage = {
      id: `summary_${Date.now()}`,
      role: 'system',
      content: summaryContent,
      timestamp: new Date(),
      tokenCount: estimateTokensFromText(summaryContent)
    }
  }

  const optimizedMessages = summaryMessage
    ? [...leadingSlice.map(entry => entry.message), summaryMessage, ...trailingSlice.map(entry => entry.message)]
    : [...leadingSlice.map(entry => entry.message), ...trailingSlice.map(entry => entry.message)]

  return {
    optimizedMessages,
    summaryMessage,
    tokensRemoved,
    tokensKept: keptTokens,
    removedMessages,
    keptLeading: leadingSlice.length,
    keptTrailing: trailingSlice.length,
    highlightSnippets
  }
}

/**
 * Smart document context sizing based on conversation length
 */
export function getOptimalDocumentContextSize(conversationTokens: number): number {
  const remaining = Math.max(0, CONTEXT_LIMITS.PRACTICAL_INPUT_MAX - conversationTokens)
  const reservedForResponse = 20000 // Buffer reserved for upcoming turns
  const available = Math.max(0, remaining - reservedForResponse)

  return Math.max(20000, Math.min(available, 100000))
}

/**
 * Export utility functions for easy access
 */
export const TokenManager = {
  estimate: estimateTokensFromText,
  estimateConversation: estimateConversationTokens,
  createWithActual: createConversationTokensWithActual,
  validate: validateWithActualCounts,
  canAdd: canAddContent,
  getWarning: getContextWarningMessage,
  optimize: optimizeConversationLength,
  getOptimalDocumentSize: getOptimalDocumentContextSize,

  // Constants for external use
  LIMITS: CONTEXT_LIMITS,
  ESTIMATION: TOKEN_ESTIMATION
} as const