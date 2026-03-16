import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_PROVIDERS = ['gemini', 'openrouter', 'laozhang', 'kie'] as const

/**
 * GET /api/settings/preferences - Get user's AI preferences
 */
export async function GET() {
  const supabase = await createAuthClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: prefs } = await supabaseAdmin
    .from('user_ai_preferences')
    .select('default_provider, default_model')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    preferences: prefs || { default_provider: 'gemini', default_model: 'gemini-2.5-flash' },
  })
}

/**
 * PUT /api/settings/preferences - Update AI preferences
 */
export async function PUT(req: NextRequest) {
  const supabase = await createAuthClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { default_provider, default_model } = body

  if (default_provider && !VALID_PROVIDERS.includes(default_provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  if (!default_model || typeof default_model !== 'string') {
    return NextResponse.json({ error: 'Model is required' }, { status: 400 })
  }

  // Verify user has an API key for the chosen provider
  if (default_provider) {
    const { data: keyExists } = await supabaseAdmin
      .from('user_api_keys')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', default_provider)
      .eq('is_valid', true)
      .single()

    if (!keyExists) {
      return NextResponse.json(
        { error: `Please add an API key for ${default_provider} first` },
        { status: 400 }
      )
    }
  }

  const { data, error } = await supabaseAdmin
    .from('user_ai_preferences')
    .upsert(
      {
        user_id: user.id,
        default_provider: default_provider || 'gemini',
        default_model,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('default_provider, default_model')
    .single()

  if (error) {
    console.error('[Preferences] Upsert error:', error)
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 })
  }

  return NextResponse.json({ preferences: data })
}
