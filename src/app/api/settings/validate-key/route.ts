import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { validateApiKey } from '@/lib/ai-providers'

const VALID_PROVIDERS = ['gemini', 'openrouter', 'laozhang', 'kie'] as const

/**
 * POST /api/settings/validate-key - Validate an API key before saving
 */
export async function POST(req: NextRequest) {
  const supabase = await createAuthClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { provider, apiKey } = body

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return NextResponse.json({ error: 'Invalid API key format' }, { status: 400 })
  }

  const result = await validateApiKey(provider, apiKey.trim())
  return NextResponse.json(result)
}
