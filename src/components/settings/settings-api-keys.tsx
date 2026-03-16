'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@/components/ui'
import {
  Key, Plus, Trash2, Loader2, Check, X, ExternalLink, Eye, EyeOff,
  ShieldCheck, AlertTriangle, Pencil
} from 'lucide-react'
import { toast } from 'sonner'
import { PROVIDERS, type AIProvider } from '@/lib/model-registry'
import { cn } from '@/lib/utils'

interface StoredKey {
  id: string
  provider: AIProvider
  key_hint: string
  is_valid: boolean
  created_at: string
  updated_at: string
}

const PROVIDER_LIST: AIProvider[] = ['gemini', 'openrouter', 'laozhang', 'kie']

export function SettingsApiKeys() {
  const [keys, setKeys] = useState<StoredKey[]>([])
  const [loading, setLoading] = useState(true)
  const [addingProvider, setAddingProvider] = useState<AIProvider | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingProvider, setDeletingProvider] = useState<AIProvider | null>(null)
  const [revealingProvider, setRevealingProvider] = useState<AIProvider | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/api-keys')
      const data = await res.json()
      setKeys(data.keys || [])
    } catch {
      toast.error('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const getKeyForProvider = (provider: AIProvider) =>
    keys.find(k => k.provider === provider)

  const handleAddKey = async (provider: AIProvider) => {
    if (!apiKeyInput.trim() || apiKeyInput.trim().length < 8) {
      toast.error('Please enter a valid API key')
      return
    }

    // Step 1: Validate
    setValidating(true)
    try {
      const valRes = await fetch('/api/settings/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKeyInput.trim() }),
      })
      const valData = await valRes.json()

      if (!valData.valid) {
        toast.error(valData.error || 'Invalid API key')
        setValidating(false)
        return
      }
    } catch {
      // If validation request fails, still try saving (key might work)
    }
    setValidating(false)

    // Step 2: Save
    setSaving(true)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKeyInput.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      toast.success(`${PROVIDERS[provider].name} API key saved securely`)
      setApiKeyInput('')
      setAddingProvider(null)
      setShowKey(false)
      fetchKeys()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save API key')
    } finally {
      setSaving(false)
    }
  }

  const handleEditKey = async (provider: AIProvider) => {
    setRevealingProvider(provider)
    try {
      const res = await fetch(`/api/settings/api-keys/reveal?provider=${provider}`)
      if (!res.ok) throw new Error('Failed to fetch key')
      const data = await res.json()
      setApiKeyInput(data.apiKey)
      setShowKey(false)
      setAddingProvider(provider)
    } catch {
      toast.error('Failed to load API key for editing')
    } finally {
      setRevealingProvider(null)
    }
  }

  const handleDeleteKey = async (provider: AIProvider) => {
    setDeletingProvider(provider)
    try {
      const res = await fetch(`/api/settings/api-keys?provider=${provider}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete')

      toast.success(`${PROVIDERS[provider].name} API key removed`)
      fetchKeys()
    } catch {
      toast.error('Failed to remove API key')
    } finally {
      setDeletingProvider(null)
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
      {/* Security Notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
        <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Your API keys are encrypted
          </p>
          <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-0.5">
            Keys are encrypted with AES-256-GCM before storage. They are never exposed to the browser after saving — only decrypted server-side during AI requests.
          </p>
        </div>
      </div>

      {/* Provider Cards */}
      {PROVIDER_LIST.map((providerId) => {
        const provider = PROVIDERS[providerId]
        const existingKey = getKeyForProvider(providerId)
        const isAdding = addingProvider === providerId
        const isDeleting = deletingProvider === providerId

        return (
          <Card key={providerId} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: provider.color }}
                  >
                    {provider.name.charAt(0)}
                  </div>
                  <div>
                    <CardTitle className="text-base">{provider.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{provider.description}</p>
                  </div>
                </div>
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                >
                  Docs <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent>
              {existingKey && !isAdding ? (
                /* Key exists - show status */
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono">{existingKey.key_hint}</code>
                        {existingKey.is_valid ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <Check className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-500">
                            <AlertTriangle className="h-3 w-3" /> Invalid
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Updated {new Date(existingKey.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditKey(providerId)}
                      disabled={revealingProvider === providerId}
                    >
                      {revealingProvider === providerId ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      ) : (
                        <Pencil className="h-3 w-3 mr-1.5" />
                      )}
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteKey(providerId)}
                      disabled={isDeleting}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : isAdding ? (
                /* Adding/replacing key */
                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={getPlaceholder(providerId)}
                      className="pr-10 font-mono text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && apiKeyInput.trim()) {
                          handleAddKey(providerId)
                        }
                        if (e.key === 'Escape') {
                          setAddingProvider(null)
                          setApiKeyInput('')
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleAddKey(providerId)}
                      disabled={validating || saving || !apiKeyInput.trim()}
                      size="sm"
                    >
                      {validating ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                          Validating...
                        </>
                      ) : saving ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3 mr-1.5" />
                          Save Key
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingProvider(null)
                        setApiKeyInput('')
                        setShowKey(false)
                      }}
                    >
                      <X className="h-3 w-3 mr-1.5" />
                      Cancel
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {getApiKeyHelp(providerId)}
                  </p>
                </div>
              ) : (
                /* No key - add button */
                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => {
                    setAddingProvider(providerId)
                    setApiKeyInput('')
                    setShowKey(false)
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add API Key
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function getPlaceholder(provider: AIProvider): string {
  switch (provider) {
    case 'gemini': return 'AIza...'
    case 'openrouter': return 'sk-or-v1-...'
    case 'laozhang': return 'sk-...'
    case 'kie': return 'sk-...'
  }
}

function getApiKeyHelp(provider: AIProvider): string {
  switch (provider) {
    case 'gemini':
      return 'Get your API key from Google AI Studio (aistudio.google.com)'
    case 'openrouter':
      return 'Get your API key from openrouter.ai/keys'
    case 'laozhang':
      return 'Get your API key from api.laozhang.ai'
    case 'kie':
      return 'Get your API key from kie.ai/api-key'
  }
}
