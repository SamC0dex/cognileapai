import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getModelsForProvider, searchModels, getAllProviders, type AIProvider } from '@/lib/model-registry'

const VALID_PROVIDERS = ['gemini', 'openrouter', 'laozhang', 'kie'] as const

/**
 * GET /api/settings/models - Get available models (optionally filtered)
 */
export async function GET(req: NextRequest) {
  const supabase = await createAuthClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const provider = searchParams.get('provider') as AIProvider | null
  const query = searchParams.get('q')

  if (query) {
    const results = searchModels(query, provider || undefined)
    return NextResponse.json({ models: results })
  }

  if (provider) {
    if (!VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }
    const models = getModelsForProvider(provider)
    return NextResponse.json({ models })
  }

  // Return all providers and their models
  const providers = getAllProviders()
  const allModels: Record<string, ReturnType<typeof getModelsForProvider>> = {}
  for (const p of providers) {
    allModels[p.id] = getModelsForProvider(p.id)
  }

  return NextResponse.json({ providers, models: allModels })
}
