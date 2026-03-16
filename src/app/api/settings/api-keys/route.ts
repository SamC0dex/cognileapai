import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { encryptApiKey, generateKeyHint } from '@/lib/encryption'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_PROVIDERS = ['gemini', 'openrouter', 'laozhang', 'kie'] as const

/**
 * GET /api/settings/api-keys - List user's API keys (masked)
 */
export async function GET() {
  const supabase = await createAuthClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: keys, error } = await supabaseAdmin
    .from('user_api_keys')
    .select('id, provider, key_hint, is_valid, created_at, updated_at')
    .eq('user_id', user.id)
    .order('provider')

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
  }

  return NextResponse.json({ keys: keys || [] })
}

/**
 * POST /api/settings/api-keys - Add or update an API key
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
    return NextResponse.json({ error: 'Invalid API key' }, { status: 400 })
  }

  const trimmedKey = apiKey.trim()

  try {
    const encryptedKey = await encryptApiKey(trimmedKey)
    const keyHint = generateKeyHint(trimmedKey)

    // Upsert (update if exists, insert if not)
    const { data, error } = await supabaseAdmin
      .from('user_api_keys')
      .upsert(
        {
          user_id: user.id,
          provider,
          encrypted_key: encryptedKey,
          key_hint: keyHint,
          is_valid: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      )
      .select('id, provider, key_hint, is_valid, updated_at')
      .single()

    if (error) {
      console.error('[API Keys] Upsert error:', error)
      return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
    }

    return NextResponse.json({ key: data })
  } catch (err) {
    console.error('[API Keys] Encryption error:', err)
    return NextResponse.json({ error: 'Failed to encrypt API key' }, { status: 500 })
  }
}

/**
 * DELETE /api/settings/api-keys - Remove an API key
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createAuthClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const provider = searchParams.get('provider')

  if (!provider || !VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('user_api_keys')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
