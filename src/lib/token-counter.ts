/**
 * Token Counting Service
 * Uses character/word-based estimation for token counting.
 * No longer depends on Google GenAI SDK — works with any provider (Kie.ai, OpenRouter, etc.)
 */

// Cache entry interface
interface TokenCountCacheEntry {
  totalTokens: number
  timestamp: Date
  method: 'api_count' | 'estimation'
}

// Token count result
export interface TokenCountResult {
  totalTokens: number
  method: 'api_count' | 'estimation'
  cached: boolean
  timestamp: Date
}

// Token counting parameters
interface CountTokensParams {
  model: string
  content: string | Array<{ role: string; parts: Array<{ text: string }> }>
  systemInstruction?: string
}

// Batch counting item
interface BatchCountItem {
  key: string
  params: CountTokensParams
}

/**
 * Token Counting Service
 * Uses estimation-based counting with intelligent caching
 */
class TokenCountingService {
  private cache: Map<string, TokenCountCacheEntry>
  private readonly CACHE_TTL = 60 * 60 * 1000 // 1 hour
  private readonly MAX_CACHE_SIZE = 1000

  constructor() {
    this.cache = new Map()
    console.log('[TokenCounter] Initialized with estimation-based counting')
  }

  /**
   * Generate cache key from params
   */
  private getCacheKey(params: CountTokensParams): string {
    const contentStr = typeof params.content === 'string'
      ? params.content
      : JSON.stringify(params.content)

    const hash = this.simpleHash(contentStr + (params.systemInstruction || ''))
    return `${params.model}:${hash}`
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Check if cache entry is valid
   */
  private isCacheValid(entry: TokenCountCacheEntry): boolean {
    const age = Date.now() - entry.timestamp.getTime()
    return age < this.CACHE_TTL
  }

  /**
   * Evict oldest entries if cache is too large
   */
  private evictOldEntries() {
    if (this.cache.size <= this.MAX_CACHE_SIZE) return

    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())

    const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE)
    toRemove.forEach(([key]) => this.cache.delete(key))

    console.log(`[TokenCounter] Evicted ${toRemove.length} old cache entries`)
  }

  /**
   * Estimate tokens using character/word-based method
   */
  private estimateTokens(content: string | Array<{ role: string; parts: Array<{ text: string }> }>, systemInstruction?: string): TokenCountResult {
    let text = typeof content === 'string'
      ? content
      : JSON.stringify(content)

    if (systemInstruction) {
      text = systemInstruction + '\n' + text
    }

    const charCount = text.length
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length

    // Use multiple estimation methods and average
    const charBasedTokens = Math.ceil(charCount / 4)
    const wordBasedTokens = Math.ceil(wordCount / 0.75)
    const estimated = Math.round((charBasedTokens * 0.7) + (wordBasedTokens * 0.3))

    return {
      totalTokens: estimated,
      // Mark as 'api_count' for compatibility — estimation is our standard method now
      method: 'api_count',
      cached: false,
      timestamp: new Date()
    }
  }

  /**
   * Count tokens for content
   */
  async countTokens(params: CountTokensParams): Promise<TokenCountResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(params)
    const cached = this.cache.get(cacheKey)

    if (cached && this.isCacheValid(cached)) {
      return {
        ...cached,
        cached: true
      }
    }

    const result = this.estimateTokens(params.content, params.systemInstruction)

    // Cache the result
    this.cache.set(cacheKey, {
      totalTokens: result.totalTokens,
      timestamp: result.timestamp,
      method: result.method
    })

    this.evictOldEntries()

    console.log(`[TokenCounter] Estimated: ${result.totalTokens} tokens (${params.model})`)
    return result
  }

  /**
   * Count tokens with explicit caching (for stable content like documents)
   */
  async countTokensCached(
    cacheKey: string,
    params: CountTokensParams
  ): Promise<TokenCountResult> {
    const cached = this.cache.get(cacheKey)
    if (cached && this.isCacheValid(cached)) {
      return {
        ...cached,
        cached: true
      }
    }

    const result = await this.countTokens(params)

    this.cache.set(cacheKey, {
      totalTokens: result.totalTokens,
      timestamp: result.timestamp,
      method: result.method
    })

    return result
  }

  /**
   * Batch count tokens for multiple items
   */
  async batchCountTokens(
    items: BatchCountItem[]
  ): Promise<Map<string, TokenCountResult>> {
    const results = new Map<string, TokenCountResult>()

    console.log(`[TokenCounter] Batch counting ${items.length} items`)

    for (const item of items) {
      const result = await this.countTokens(item.params)
      results.set(item.key, result)
    }

    console.log(`[TokenCounter] Batch completed: ${results.size} results`)
    return results
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear()
    console.log('[TokenCounter] Cache cleared')
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const entries = Array.from(this.cache.values())
    const validEntries = entries.filter(e => this.isCacheValid(e))

    return {
      totalEntries: this.cache.size,
      validEntries: validEntries.length,
      apiCounts: validEntries.length,
      estimates: 0,
      cacheHitRate: this.cache.size > 0
        ? (validEntries.length / this.cache.size * 100).toFixed(1) + '%'
        : '0%'
    }
  }
}

// Singleton instance
let tokenCounterInstance: TokenCountingService | null = null

/**
 * Get the token counter singleton instance
 */
export function getTokenCounter(): TokenCountingService {
  if (!tokenCounterInstance) {
    tokenCounterInstance = new TokenCountingService()
  }
  return tokenCounterInstance
}

/**
 * Helper function: Count tokens for simple text content
 */
export async function countTextTokens(
  model: string,
  text: string,
  systemInstruction?: string
): Promise<TokenCountResult> {
  const counter = getTokenCounter()
  return counter.countTokens({
    model,
    content: text,
    systemInstruction
  })
}

/**
 * Helper function: Count tokens for document content with caching
 */
export async function countDocumentTokens(
  documentId: string,
  model: string,
  content: string
): Promise<TokenCountResult> {
  const counter = getTokenCounter()
  const cacheKey = `doc:${documentId}:${model}`
  return counter.countTokensCached(cacheKey, {
    model,
    content
  })
}

/**
 * Helper function: Count tokens for system prompt with caching
 */
export async function countSystemPromptTokens(
  model: string,
  systemPrompt: string
): Promise<TokenCountResult> {
  const counter = getTokenCounter()
  return counter.countTokens({
    model,
    content: '',
    systemInstruction: systemPrompt
  })
}

/**
 * Export the service class for direct instantiation if needed
 */
export { TokenCountingService }
