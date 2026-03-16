'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AIProvider } from './model-registry'
import { DEFAULT_MODELS, PROVIDERS } from './model-registry'

export type ReasoningEffort = 'low' | 'high'

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

// Kie.ai only supports low and high reasoning effort
const EFFORT_CYCLE: ReasoningEffort[] = ['low', 'high']

/**
 * Hook that loads user AI preferences and returns available models for the chat selector.
 * Falls back to the 3 default Gemini models if no preferences are set.
 */
export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserAIPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<ChatModelOption[]>(getDefaultKieModels())
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3-flash')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('low')

  const cycleReasoningEffort = useCallback(() => {
    setReasoningEffort(prev => {
      const idx = EFFORT_CYCLE.indexOf(prev)
      const nextIdx = idx === -1 ? 0 : (idx + 1) % EFFORT_CYCLE.length
      return EFFORT_CYCLE[nextIdx]
    })
  }, [])

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/preferences')
      if (!res.ok) {
        setModels(getDefaultKieModels())
        setSelectedModelId('gemini-3-flash')
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
          setModels(getDefaultKieModels())
          setSelectedModelId('gemini-3-flash')
        }
      } else {
        setModels(getDefaultKieModels())
        setSelectedModelId('gemini-3-flash')
      }
    } catch {
      setModels(getDefaultKieModels())
      setSelectedModelId('gemini-3-flash')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])


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

/** Default Kie.ai models (gemini-3-flash is the primary default) */
function getDefaultKieModels(): ChatModelOption[] {
  return DEFAULT_MODELS.kie.map(m => ({
    id: m.id,
    name: m.name,
    description: m.description,
    costTier: m.costTier,
    provider: m.provider,
  }))
}
