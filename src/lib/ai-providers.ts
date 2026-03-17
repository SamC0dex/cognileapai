/**
 * Unified AI Provider Client
 * Routes AI requests through the user's chosen provider
 * Supports: Gemini (native SDK), OpenRouter, LaoZhang, Kie.ai (all OpenAI-compatible)
 */

import OpenAI from 'openai'
import { decryptApiKey } from './encryption'
import { PROVIDERS, findModel, type AIProvider, type AIModel } from './model-registry'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface UserAIConfig {
  provider: AIProvider
  model: string
  apiKey: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GenerateOptions {
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  stream?: boolean
  reasoningEffort?: 'low' | 'high'
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface CompletionResult {
  text: string
  usage: TokenUsage | null
}

export interface StreamChunk {
  text: string
  isComplete?: boolean
  usage?: TokenUsage | null
}

/**
 * Get the user's AI configuration (provider, model, decrypted API key)
 */
export async function getUserAIConfig(userId: string): Promise<UserAIConfig | null> {
  // Get user preferences
  const { data: prefs } = await supabaseAdmin
    .from('user_ai_preferences')
    .select('default_provider, default_model')
    .eq('user_id', userId)
    .single()

  if (!prefs) return null

  // Get the API key for the chosen provider
  const { data: keyRow } = await supabaseAdmin
    .from('user_api_keys')
    .select('encrypted_key, is_valid')
    .eq('user_id', userId)
    .eq('provider', prefs.default_provider)
    .single()

  if (!keyRow || !keyRow.is_valid) return null

  const apiKey = await decryptApiKey(keyRow.encrypted_key)

  return {
    provider: prefs.default_provider as AIProvider,
    model: prefs.default_model,
    apiKey,
  }
}

/**
 * Create an OpenAI-compatible client for a provider
 */
function createOpenAIClient(provider: AIProvider, apiKey: string, model?: string): OpenAI {
  let baseURL = PROVIDERS[provider].baseUrl
  const headers: Record<string, string> = {}

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'https://cognileap.ai'
    headers['X-Title'] = 'CogniLeap AI'
  }

  // Kie.ai uses per-model base URLs: https://api.kie.ai/{model-id}/v1
  if (provider === 'kie' && model) {
    baseURL = `${baseURL}/${model}/v1`
  }

  // Route 'gemini' provider through Kie.ai (no longer using Google's direct API)
  if (provider === 'gemini' && model) {
    baseURL = `https://api.kie.ai/${model}/v1`
  }

  return new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: headers,
  })
}

/**
 * Generate a chat completion using the user's chosen provider (non-streaming)
 */
export async function generateCompletion(
  config: UserAIConfig,
  options: GenerateOptions
): Promise<CompletionResult> {
  // All providers use OpenAI-compatible API (including Kie.ai for Gemini models)
  const client = createOpenAIClient(config.provider, config.apiKey, config.model)

  const response = await client.chat.completions.create({
    model: config.model,
    messages: options.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
    stream: false,
  })

  const usage = response.usage ? {
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    totalTokens: response.usage.total_tokens,
  } : null

  return {
    text: response.choices[0]?.message?.content || '',
    usage,
  }
}

/**
 * Generate a streaming chat completion
 */
export async function* generateCompletionStream(
  config: UserAIConfig,
  options: GenerateOptions
): AsyncGenerator<StreamChunk> {
  // All providers use OpenAI-compatible API
  const client = createOpenAIClient(config.provider, config.apiKey, config.model)

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
  try {
    const createParams = {
      model: config.model,
      messages: options.messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: true as const,
      stream_options: { include_usage: true },
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    }

    stream = await client.chat.completions.create(createParams)
  } catch (error) {
    throw translateProviderError(error, config.provider)
  }

  let accumulatedText = ''
  let finalUsage: TokenUsage | null = null

  try {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || ''
      if (text) {
        accumulatedText += text
        yield { text, isComplete: false }
      }

      // The final chunk with stream_options.include_usage contains usage data
      if (chunk.usage) {
        finalUsage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        }
      }
    }
  } catch (error) {
    throw translateProviderError(error, config.provider)
  }

  yield { text: '', isComplete: true, usage: finalUsage }
}

/**
 * Validate an API key by making a minimal request
 */
export async function validateApiKey(
  provider: AIProvider,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // All providers use OpenAI-compatible validation
    const validationModel = getValidationModel(provider)
    const client = createOpenAIClient(provider, apiKey, validationModel)
    await client.chat.completions.create({
      model: validationModel,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    })
    return { valid: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('Invalid API Key') || message.includes('invalid_api_key')) {
      return { valid: false, error: 'Invalid API key' }
    }
    if (message.includes('402') || message.includes('insufficient')) {
      // Key is valid but no credits - still a valid key
      return { valid: true }
    }
    // Other errors (rate limit, network) - key might be valid
    return { valid: true }
  }
}

/**
 * Translate provider-specific API errors into user-friendly messages
 */
export function translateProviderError(error: unknown, provider: AIProvider): Error {
  const raw = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number })?.status

  // Kie.ai specific error codes (https://docs.kie.ai)
  if (provider === 'kie') {
    if (status === 400) return new Error('Kie.ai: Bad request — check that the model supports your input format. Only English prompts are supported.')
    if (status === 401) return new Error('Kie.ai: Invalid API key. Please check your key in Settings.')
    if (status === 402) return new Error('Kie.ai: Insufficient credits. Please top up at kie.ai.')
    if (status === 429) return new Error('Kie.ai: Rate limited — max 20 requests per 10 seconds. Please wait a moment.')
    if (status === 451) return new Error('Kie.ai: Content access limit reached.')
    if (status === 455) return new Error('Kie.ai: Service is under maintenance. Please try again later.')
    if (status === 500) return new Error('Kie.ai: Server error or timeout. Please retry.')
    if (status === 501) return new Error('Kie.ai: Generation failed. The model may be temporarily unavailable.')
    if (status === 505) return new Error('Kie.ai: This feature is disabled for the selected model.')
  }

  // Generic provider errors
  if (status === 401 || raw.includes('Unauthorized') || raw.includes('invalid_api_key')) {
    return new Error(`${PROVIDERS[provider].name}: Invalid API key. Please check your key in Settings.`)
  }
  if (status === 402 || raw.includes('insufficient')) {
    return new Error(`${PROVIDERS[provider].name}: Insufficient credits.`)
  }
  if (status === 429 || raw.includes('rate limit')) {
    return new Error(`${PROVIDERS[provider].name}: Rate limited. Please wait a moment and try again.`)
  }

  return error instanceof Error ? error : new Error(raw)
}

function getValidationModel(provider: AIProvider): string {
  switch (provider) {
    case 'openrouter': return 'openai/gpt-5.2-chat'
    case 'laozhang': return 'gpt-4o-mini'
    case 'kie': return 'gemini-3-flash'
    case 'gemini': return 'gemini-3-flash' // Route through Kie for validation
    default: return 'gpt-4o-mini'
  }
}
