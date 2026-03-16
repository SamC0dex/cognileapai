/**
 * AI Model Registry
 * Defines available models for each provider with metadata
 * Models are hardcoded for reliability (kie.ai has no models endpoint)
 * OpenRouter/LaoZhang models can be refreshed via their APIs
 */

export type AIProvider = 'gemini' | 'openrouter' | 'laozhang' | 'kie'

export interface AIModel {
  id: string              // Model ID used in API calls
  name: string            // Human-readable name
  provider: AIProvider
  contextWindow: number   // Max input tokens
  maxOutput: number       // Max output tokens
  costTier: 'free' | 'low' | 'medium' | 'high'
  capabilities: string[]  // e.g. ['chat', 'vision', 'code']
  description: string
}

export interface ProviderInfo {
  id: AIProvider
  name: string
  description: string
  baseUrl: string
  docsUrl: string
  color: string           // For UI badges
  supportsModelFetch: boolean
}

// Provider metadata
export const PROVIDERS: Record<AIProvider, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google\'s Gemini models via official API',
    baseUrl: 'https://generativelanguage.googleapis.com',
    docsUrl: 'https://ai.google.dev/',
    color: '#4285F4',
    supportsModelFetch: false,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 400+ models from OpenAI, Anthropic, Meta & more',
    baseUrl: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/docs',
    color: '#6366F1',
    supportsModelFetch: true,
  },
  laozhang: {
    id: 'laozhang',
    name: 'LaoZhang',
    description: 'Affordable API gateway with 200+ models',
    baseUrl: 'https://api.laozhang.ai/v1',
    docsUrl: 'https://docs.laozhang.ai',
    color: '#EC4899',
    supportsModelFetch: true,
  },
  kie: {
    id: 'kie',
    name: 'Kie.ai',
    description: 'Budget-friendly AI API with up to 80% savings',
    baseUrl: 'https://api.kie.ai',  // Per-model URL: https://api.kie.ai/{model-id}/v1
    docsUrl: 'https://docs.kie.ai',
    color: '#F59E0B',
    supportsModelFetch: false,
  },
}

// Models per provider — updated March 2026
export const DEFAULT_MODELS: Record<AIProvider, AIModel[]> = {
  // ─── Google Gemini (direct API) ───────────────────────────────────
  gemini: [
    {
      id: 'gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro',
      provider: 'gemini',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Latest & most capable Gemini model',
    },
    {
      id: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash',
      provider: 'gemini',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'medium',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Fast next-gen model with strong reasoning',
    },
    {
      id: 'gemini-3.1-flash-lite-preview',
      name: 'Gemini 3.1 Flash Lite',
      provider: 'gemini',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'low',
      capabilities: ['chat', 'vision', 'code'],
      description: 'Ultra-fast lightweight Gemini 3.1',
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'gemini',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Stable pro model for complex reasoning',
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'gemini',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'medium',
      capabilities: ['chat', 'vision', 'code'],
      description: 'Balanced speed and capability',
    },
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash Lite',
      provider: 'gemini',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'low',
      capabilities: ['chat', 'code'],
      description: 'Cheapest Gemini for quick tasks',
    },
  ],

  // ─── OpenRouter ───────────────────────────────────────────────────
  openrouter: [
    // -- OpenAI --
    {
      id: 'openai/gpt-5.4-pro',
      name: 'GPT-5.4 Pro',
      provider: 'openrouter',
      contextWindow: 1050000,
      maxOutput: 128000,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'OpenAI flagship — most capable GPT model',
    },
    {
      id: 'openai/gpt-5.4',
      name: 'GPT-5.4',
      provider: 'openrouter',
      contextWindow: 1050000,
      maxOutput: 128000,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Latest GPT model with 1M+ context',
    },
    {
      id: 'openai/gpt-5.2',
      name: 'GPT-5.2',
      provider: 'openrouter',
      contextWindow: 400000,
      maxOutput: 128000,
      costTier: 'medium',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Strong all-rounder GPT-5 series',
    },
    {
      id: 'openai/gpt-5.3-codex',
      name: 'GPT-5.3 Codex',
      provider: 'openrouter',
      contextWindow: 400000,
      maxOutput: 128000,
      costTier: 'medium',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'OpenAI Codex — optimized for code',
    },
    {
      id: 'openai/gpt-5.2-chat',
      name: 'GPT-5.2 Chat',
      provider: 'openrouter',
      contextWindow: 128000,
      maxOutput: 16384,
      costTier: 'low',
      capabilities: ['chat', 'vision', 'code'],
      description: 'Affordable GPT-5 for everyday chat',
    },
    // -- Anthropic --
    {
      id: 'anthropic/claude-opus-4.6',
      name: 'Claude Opus 4.6',
      provider: 'openrouter',
      contextWindow: 1000000,
      maxOutput: 128000,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Most capable Claude model',
    },
    {
      id: 'anthropic/claude-sonnet-4.6',
      name: 'Claude Sonnet 4.6',
      provider: 'openrouter',
      contextWindow: 1000000,
      maxOutput: 128000,
      costTier: 'medium',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Great balance of speed and intelligence',
    },
    // -- Google --
    {
      id: 'google/gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro',
      provider: 'openrouter',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'medium',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Latest Gemini via OpenRouter',
    },
    {
      id: 'google/gemini-3-flash-preview',
      name: 'Gemini 3 Flash',
      provider: 'openrouter',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'low',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Fast Gemini 3 via OpenRouter',
    },
    // -- DeepSeek --
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek V3',
      provider: 'openrouter',
      contextWindow: 131072,
      maxOutput: 8192,
      costTier: 'low',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'Very affordable high-quality chat',
    },
    {
      id: 'deepseek/deepseek-r1',
      name: 'DeepSeek R1',
      provider: 'openrouter',
      contextWindow: 131072,
      maxOutput: 8192,
      costTier: 'low',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'Strong reasoning at low cost',
    },
    // -- Meta --
    {
      id: 'meta-llama/llama-4-maverick',
      name: 'Llama 4 Maverick',
      provider: 'openrouter',
      contextWindow: 131072,
      maxOutput: 8192,
      costTier: 'low',
      capabilities: ['chat', 'code'],
      description: 'Meta open-source Llama 4',
    },
    // -- Qwen --
    {
      id: 'qwen/qwen3.5-plus-02-15',
      name: 'Qwen 3.5 Plus',
      provider: 'openrouter',
      contextWindow: 1000000,
      maxOutput: 65536,
      costTier: 'low',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'Alibaba Qwen 3.5 — 1M context',
    },
    // -- Mistral --
    {
      id: 'mistralai/mistral-large-2512',
      name: 'Mistral Large 3',
      provider: 'openrouter',
      contextWindow: 262144,
      maxOutput: 65536,
      costTier: 'medium',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'Mistral flagship model',
    },
    // -- OpenRouter Free --
    {
      id: 'openrouter/hunter-alpha',
      name: 'Hunter Alpha',
      provider: 'openrouter',
      contextWindow: 131072,
      maxOutput: 8192,
      costTier: 'free',
      capabilities: ['chat', 'code'],
      description: 'OpenRouter Hunter Alpha — free model',
    },
    {
      id: 'openrouter/healer-alpha',
      name: 'Healer Alpha',
      provider: 'openrouter',
      contextWindow: 131072,
      maxOutput: 8192,
      costTier: 'free',
      capabilities: ['chat', 'code'],
      description: 'OpenRouter Healer Alpha — free model',
    },
    // -- xAI --
    {
      id: 'x-ai/grok-4.20-beta',
      name: 'Grok 4.20 Beta',
      provider: 'openrouter',
      contextWindow: 2000000,
      maxOutput: 131072,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'xAI Grok with 2M context window',
    },
  ],

  // ─── LaoZhang ─────────────────────────────────────────────────────
  laozhang: [
    {
      id: 'o3-pro',
      name: 'OpenAI o3 Pro',
      provider: 'laozhang',
      contextWindow: 200000,
      maxOutput: 100000,
      costTier: 'high',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'OpenAI reasoning flagship via LaoZhang',
    },
    {
      id: 'o3',
      name: 'OpenAI o3',
      provider: 'laozhang',
      contextWindow: 200000,
      maxOutput: 100000,
      costTier: 'medium',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'Strong reasoning model via LaoZhang',
    },
    {
      id: 'o4-mini',
      name: 'OpenAI o4 Mini',
      provider: 'laozhang',
      contextWindow: 200000,
      maxOutput: 100000,
      costTier: 'low',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'Affordable reasoning via LaoZhang',
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'laozhang',
      contextWindow: 128000,
      maxOutput: 16384,
      costTier: 'medium',
      capabilities: ['chat', 'vision', 'code'],
      description: 'OpenAI GPT-4o via LaoZhang',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'laozhang',
      contextWindow: 128000,
      maxOutput: 16384,
      costTier: 'low',
      capabilities: ['chat', 'vision', 'code'],
      description: 'Affordable GPT-4o via LaoZhang',
    },
    {
      id: 'claude-opus-4-20250515',
      name: 'Claude Opus 4',
      provider: 'laozhang',
      contextWindow: 200000,
      maxOutput: 32000,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Most capable Claude via LaoZhang',
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'laozhang',
      contextWindow: 200000,
      maxOutput: 16384,
      costTier: 'medium',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Balanced Claude via LaoZhang',
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      provider: 'laozhang',
      contextWindow: 200000,
      maxOutput: 8192,
      costTier: 'low',
      capabilities: ['chat', 'code'],
      description: 'Fast affordable Claude via LaoZhang',
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'laozhang',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'medium',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Google Gemini Pro via LaoZhang',
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'laozhang',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'low',
      capabilities: ['chat', 'vision', 'code'],
      description: 'Google Gemini Flash via LaoZhang',
    },
    {
      id: 'deepseek-chat',
      name: 'DeepSeek V3',
      provider: 'laozhang',
      contextWindow: 131072,
      maxOutput: 8192,
      costTier: 'low',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'DeepSeek V3 via LaoZhang',
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek R1',
      provider: 'laozhang',
      contextWindow: 131072,
      maxOutput: 8192,
      costTier: 'low',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'DeepSeek R1 via LaoZhang',
    },
  ],

  // ─── Kie.ai (7 models from marketplace — March 2026) ──────────────
  // Cost tiers: 'low' for flash/standard models, 'high' for pro/flagship
  kie: [
    {
      id: 'gemini-3-flash',
      name: 'Gemini 3 Flash',
      provider: 'kie',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'low',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Best balance of speed, cost, and capability',
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'kie',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'low',
      capabilities: ['chat', 'vision', 'code'],
      description: 'Fast and affordable Gemini 2.5',
    },
    {
      id: 'gpt-codex',
      name: 'OpenAI Codex',
      provider: 'kie',
      contextWindow: 400000,
      maxOutput: 128000,
      costTier: 'low',
      capabilities: ['chat', 'code', 'reasoning'],
      description: 'OpenAI Codex — optimized for code generation',
    },
    {
      id: 'gemini-3-pro',
      name: 'Gemini 3 Pro',
      provider: 'kie',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Most capable Gemini 3 for complex tasks',
    },
    {
      id: 'gemini-3.1-pro',
      name: 'Gemini 3.1 Pro',
      provider: 'kie',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Latest Google Gemini via Kie.ai',
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'kie',
      contextWindow: 1048576,
      maxOutput: 65536,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'Gemini 2.5 Pro for deep reasoning',
    },
    {
      id: 'gpt-5-2',
      name: 'GPT-5.2',
      provider: 'kie',
      contextWindow: 400000,
      maxOutput: 128000,
      costTier: 'high',
      capabilities: ['chat', 'vision', 'code', 'reasoning'],
      description: 'OpenAI flagship model via Kie.ai',
    },
  ],
}

/**
 * Get all models for a provider
 */
export function getModelsForProvider(provider: AIProvider): AIModel[] {
  return DEFAULT_MODELS[provider] || []
}

/**
 * Search models across all providers or a specific one
 */
export function searchModels(query: string, provider?: AIProvider): AIModel[] {
  const q = query.toLowerCase()
  const models = provider
    ? DEFAULT_MODELS[provider]
    : Object.values(DEFAULT_MODELS).flat()

  return models.filter(
    m =>
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.capabilities.some(c => c.includes(q))
  )
}

/**
 * Find a model by ID and provider
 */
export function findModel(modelId: string, provider: AIProvider): AIModel | undefined {
  return DEFAULT_MODELS[provider]?.find(m => m.id === modelId)
}

/**
 * Get provider info
 */
export function getProviderInfo(provider: AIProvider): ProviderInfo {
  return PROVIDERS[provider]
}

/**
 * Get all providers
 */
export function getAllProviders(): ProviderInfo[] {
  return Object.values(PROVIDERS)
}
