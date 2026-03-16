'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AIProvider } from './model-registry'
import { DEFAULT_MODELS, PROVIDERS } from './model-registry'

export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface UserAIPreferences {
  default_provider: AIProvider
  default_model: string
}

export interface ChatModelOption {
  id: string           // Model ID for API calls (e.g., 'gemini-2.5-flash' or 'anthropic/claude-opus-4.6')
  name: string         // Display name
  description: string
  costTier: 'free' | 'low' | 'medium' | 'high'
  provider: AIProvider
}

// Kie.ai only supports low and high effort (no medium)
const EFFORT_CYCLE_DEFAULT: ReasoningEffort[] = ['low', 'medium', 'high']
const EFFORT_CYCLE_KIE: ReasoningEffort[] = ['low', 'high']

/**
 * Hook that loads user AI preferences and returns available models for the chat selector.
 * Falls back to the 3 default Gemini models if no preferences are set.
 */
export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserAIPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<ChatModelOption[]>(getDefaultGeminiModels())
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-2.5-flash')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('low')

  const cycleReasoningEffort = useCallback(() => {
    const cycle = preferences?.default_provider === 'kie' ? EFFORT_CYCLE_KIE : EFFORT_CYCLE_DEFAULT
    setReasoningEffort(prev => {
      const idx = cycle.indexOf(prev)
      // If current value isn't in the cycle (e.g. 'medium' when switching to kie), reset to 'low'
      const nextIdx = idx === -1 ? 0 : (idx + 1) % cycle.length
      return cycle[nextIdx]
    })
  }, [preferences?.default_provider])

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/preferences')
      if (!res.ok) {
        setModels(getDefaultGeminiModels())
        setSelectedModelId('gemini-2.5-flash')
        return
      }

      const data = await res.json()
      const prefs: UserAIPreferences = data.preferences

      if (prefs?.default_provider && prefs?.default_model) {
        setPreferences(prefs)

        const providerModels = DEFAULT_MODELS[prefs.default_provider] || []
        const chatModels: ChatModelOption[] = providerModels.map(m => ({
          id: m.id,
          name: m.name,
          description: m.description,
          costTier: m.costTier,
          provider: m.provider,
        }))

        if (chatModels.length > 0) {
          setModels(chatModels)
          const defaultExists = chatModels.some(m => m.id === prefs.default_model)
          setSelectedModelId(defaultExists ? prefs.default_model : chatModels[0].id)
        } else {
          setModels(getDefaultGeminiModels())
          setSelectedModelId('gemini-2.5-flash')
        }
      } else {
        setModels(getDefaultGeminiModels())
        setSelectedModelId('gemini-2.5-flash')
      }
    } catch {
      setModels(getDefaultGeminiModels())
      setSelectedModelId('gemini-2.5-flash')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])

  // When provider changes to kie, clamp 'medium' effort down to 'low'
  useEffect(() => {
    if (preferences?.default_provider === 'kie') {
      setReasoningEffort(prev => prev === 'medium' ? 'low' : prev)
    }
  }, [preferences?.default_provider])

  const providerInfo = preferences
    ? PROVIDERS[preferences.default_provider]
    : PROVIDERS.gemini

  return {
    preferences,
    loading,
    models,
    selectedModelId,
    setSelectedModelId,
    providerInfo,
    reasoningEffort,
    setReasoningEffort,
    cycleReasoningEffort,
    refetch: fetchPreferences,
  }
}

/** Default 3 Gemini models that match the old hardcoded GEMINI_MODELS */
function getDefaultGeminiModels(): ChatModelOption[] {
  return [
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash Lite',
      description: 'Fastest model for simple queries and follow-ups',
      costTier: 'low' as const,
      provider: 'gemini' as AIProvider,
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'Balanced speed and capability for study materials',
      costTier: 'medium' as const,
      provider: 'gemini' as AIProvider,
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      description: 'Most capable for complex reasoning and analysis',
      costTier: 'high' as const,
      provider: 'gemini' as AIProvider,
    },
  ]
}
