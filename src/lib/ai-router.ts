/**
 * AI Router
 * Resolves the AI client configuration for each request.
 * Checks user preferences first, falls back to server-side Kie.ai config.
 */

import { getUserAIConfig, generateCompletion, generateCompletionStream, type UserAIConfig, type ChatMessage, type GenerateOptions, type StreamChunk } from './ai-providers'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Default server fallback config
const DEFAULT_MODEL = 'gemini-3-flash'
const KIE_BASE_URL = 'https://api.kie.ai'

export interface ResolvedAIConfig {
  /** Whether using user's own key or server fallback */
  source: 'user' | 'server'
  /** The provider being used */
  provider: string
  /** The model being used */
  model: string
  /** User AI config (null if using server fallback) */
  userConfig: UserAIConfig | null
}

/**
 * Resolve which AI config to use for a given user.
 * Tries user's configured provider first, falls back to server Kie.ai key.
 */
export async function resolveAIConfig(userId: string): Promise<ResolvedAIConfig> {
  // Try user config first
  try {
    const userConfig = await getUserAIConfig(userId)
    if (userConfig) {
      return {
        source: 'user',
        provider: userConfig.provider,
        model: userConfig.model,
        userConfig,
      }
    }
  } catch (error) {
    console.warn('[AIRouter] Failed to load user config, falling back to server:', error)
  }

  // Fallback to server env config — prefer Kie, then Google
  const kieKey = process.env.KIE_API_KEY
  if (kieKey) {
    return {
      source: 'server',
      provider: 'kie',
      model: process.env.KIE_DEFAULT_MODEL || DEFAULT_MODEL,
      userConfig: {
        provider: 'kie',
        model: process.env.KIE_DEFAULT_MODEL || DEFAULT_MODEL,
        apiKey: kieKey,
      },
    }
  }

  const serverKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (serverKey) {
    return {
      source: 'server',
      provider: 'gemini',
      model: process.env.GEMINI_FAST_MODEL || DEFAULT_MODEL,
      userConfig: null,
    }
  }

  throw new Error('No AI configuration available. Please add an API key in Settings.')
}

/**
 * Create an OpenAI client pointing at Kie.ai
 */
function createKieClient(apiKey: string, model: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: `${KIE_BASE_URL}/${model}/v1`,
  })
}

/**
 * Generate a non-streaming completion using resolved config
 */
export async function routedCompletion(
  userId: string,
  options: GenerateOptions
): Promise<{ text: string; config: ResolvedAIConfig }> {
  const config = await resolveAIConfig(userId)

  if (config.userConfig) {
    const text = await generateCompletion(config.userConfig, options)
    return { text, config }
  }

  // Server fallback — should not normally reach here since resolveAIConfig
  // now creates userConfig for Kie fallback, but keep as safety net
  const serverKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!serverKey) {
    throw new Error('No AI configuration available')
  }

  const client = createKieClient(serverKey, config.model)
  const response = await client.chat.completions.create({
    model: config.model,
    messages: options.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
  })

  return { text: response.choices[0]?.message?.content || '', config }
}

/**
 * Generate a streaming completion using resolved config
 */
export async function* routedCompletionStream(
  userId: string,
  options: GenerateOptions
): AsyncGenerator<StreamChunk & { config?: ResolvedAIConfig }> {
  const config = await resolveAIConfig(userId)

  if (config.userConfig) {
    for await (const chunk of generateCompletionStream(config.userConfig, options)) {
      yield { ...chunk, config: chunk.isComplete ? config : undefined }
    }
    return
  }

  // Server fallback (Kie.ai via OpenAI SDK)
  const serverKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!serverKey) {
    throw new Error('No AI configuration available')
  }

  const client = createKieClient(serverKey, config.model)
  const stream = await client.chat.completions.create({
    model: config.model,
    messages: options.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
    stream: true,
  })

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || ''
    if (text) {
      yield { text, isComplete: false }
    }
  }

  yield { text: '', isComplete: true, config }
}
