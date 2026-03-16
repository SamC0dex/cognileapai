import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { decryptApiKey } from '@/lib/encryption'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_PROVIDERS = ['gemini', 'openrouter', 'laozhang', 'kie'] as const

/**
 * GET /api/settings/api-keys/reveal?provider=xxx
 * Returns the decrypted API key for the authenticated user's chosen provider.
 * Only accessible by the key owner (auth-gated, never logged).
 */
export async function GET(req: NextRequest) {
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

  const { data: keyRow, error } = await supabaseAdmin
    .from('user_api_keys')
    .select('encrypted_key')
    .eq('user_id', user.id)
    .eq('provider', provider)
    .single()

  if (error || !keyRow) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 })
  }

  try {
    const plaintext = await decryptApiKey(keyRow.encrypted_key)
    return NextResponse.json({ apiKey: plaintext })
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt key' }, { status: 500 })
  }
}
