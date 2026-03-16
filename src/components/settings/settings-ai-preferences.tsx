'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Badge } from '@/components/ui'
import { Check, Loader2, Search, Zap, Brain, Code, Eye, Star } from 'lucide-react'
import { toast } from 'sonner'
import { PROVIDERS, DEFAULT_MODELS, type AIProvider, type AIModel } from '@/lib/model-registry'
import { cn } from '@/lib/utils'

interface UserPreferences {
  default_provider: AIProvider
  default_model: string
}

interface StoredKey {
  provider: AIProvider
  is_valid: boolean
}

const PROVIDER_LIST: AIProvider[] = ['gemini', 'openrouter', 'laozhang', 'kie']

export function SettingsAIPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>({
    default_provider: 'gemini',
    default_model: 'gemini-2.5-flash-lite',
  })
  const [availableKeys, setAvailableKeys] = useState<StoredKey[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [savedPrefs, setSavedPrefs] = useState<UserPreferences | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [prefsRes, keysRes] = await Promise.all([
        fetch('/api/settings/preferences'),
        fetch('/api/settings/api-keys'),
      ])

      const prefsData = await prefsRes.json()
      const keysData = await keysRes.json()

      const prefs = prefsData.preferences || { default_provider: 'gemini', default_model: 'gemini-2.5-flash' }
      setPreferences(prefs)
      setSavedPrefs(prefs)
      setAvailableKeys((keysData.keys || []).map((k: { provider: AIProvider; is_valid: boolean }) => ({
        provider: k.provider,
        is_valid: k.is_valid,
      })))
    } catch {
      toast.error('Failed to load preferences')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Track changes
  useEffect(() => {
    if (savedPrefs) {
      setHasChanges(
        preferences.default_provider !== savedPrefs.default_provider ||
        preferences.default_model !== savedPrefs.default_model
      )
    }
  }, [preferences, savedPrefs])

  const hasKeyForProvider = (provider: AIProvider) =>
    availableKeys.some(k => k.provider === provider && k.is_valid)

  const filteredModels = useMemo(() => {
    const models = DEFAULT_MODELS[preferences.default_provider] || []
    if (!searchQuery.trim()) return models
    const q = searchQuery.toLowerCase()
    return models.filter(
      m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    )
  }, [preferences.default_provider, searchQuery])

  const handleSelectProvider = (provider: AIProvider) => {
    if (!hasKeyForProvider(provider)) {
      toast.error(`Add an API key for ${PROVIDERS[provider].name} first`, {
        description: 'Go to the API Keys tab to add your key',
      })
      return
    }
    const firstModel = DEFAULT_MODELS[provider]?.[0]?.id || ''
    setPreferences({ default_provider: provider, default_model: firstModel })
    setSearchQuery('')
  }

  const handleSelectModel = (modelId: string) => {
    setPreferences(prev => ({ ...prev, default_model: modelId }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      const data = await res.json()
      setSavedPrefs(data.preferences)
      toast.success('AI preferences saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Default Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {PROVIDER_LIST.map((providerId) => {
              const provider = PROVIDERS[providerId]
              const hasKey = hasKeyForProvider(providerId)
              const isSelected = preferences.default_provider === providerId

              return (
                <button
                  key={providerId}
                  onClick={() => handleSelectProvider(providerId)}
                  className={cn(
                    'relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-150 text-left',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : hasKey
                        ? 'border-border hover:border-primary/40 hover:bg-muted/50'
                        : 'border-border/50 opacity-50 cursor-not-allowed'
                  )}
                  disabled={!hasKey}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: provider.color }}
                  >
                    {provider.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{provider.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {hasKey ? `${DEFAULT_MODELS[providerId].length} models` : 'No API key'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Default Model
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({PROVIDERS[preferences.default_provider].name})
              </span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="pl-9"
            />
          </div>

          {/* Model List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {filteredModels.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No models found for &quot;{searchQuery}&quot;
              </p>
            ) : (
              filteredModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isSelected={preferences.default_model === model.id}
                  onSelect={() => handleSelectModel(model.id)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="shadow-lg"
            variant="purple"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Save Preferences
          </Button>
        </div>
      )}
    </div>
  )
}

function ModelCard({
  model,
  isSelected,
  onSelect,
}: {
  model: AIModel
  isSelected: boolean
  onSelect: () => void
}) {
  const costColors = {
    free: 'text-green-600 bg-green-500/10',
    low: 'text-blue-600 bg-blue-500/10',
    medium: 'text-amber-600 bg-amber-500/10',
    high: 'text-red-600 bg-red-500/10',
  }

  const capabilityIcons: Record<string, typeof Zap> = {
    chat: Zap,
    vision: Eye,
    code: Code,
    reasoning: Brain,
  }

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-lg border transition-all duration-150 text-left',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      {/* Selection indicator */}
      <div className={cn(
        'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
        isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
      )}>
        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium truncate">{model.name}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', costColors[model.costTier])}>
            {model.costTier === 'free' ? 'Free' : model.costTier.charAt(0).toUpperCase() + model.costTier.slice(1)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-1.5">{model.description}</p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70">
          <span>{formatTokens(model.contextWindow)} context</span>
          <span>{formatTokens(model.maxOutput)} output</span>
          <div className="flex items-center gap-1">
            {model.capabilities.slice(0, 4).map((cap) => {
              const Icon = capabilityIcons[cap] || Zap
              return (
                <span key={cap} className="flex items-center gap-0.5" title={cap}>
                  <Icon className="h-3 w-3" />
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </button>
  )
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(0)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return String(n)
}
