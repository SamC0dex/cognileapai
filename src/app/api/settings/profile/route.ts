import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/settings/profile - Get user profile
 */
export async function GET() {
  const supabase = await createAuthClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, avatar_url')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    profile: profile || {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      avatar_url: null,
    },
  })
}

/**
 * PUT /api/settings/profile - Update user profile (name)
 */
export async function PUT(req: NextRequest) {
  const supabase = await createAuthClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { full_name } = body

  if (typeof full_name !== 'string' || full_name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  if (full_name.trim().length > 100) {
    return NextResponse.json({ error: 'Name is too long' }, { status: 400 })
  }

  const trimmedName = full_name.trim()

  // Update profile table
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email || '',
        full_name: trimmedName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    console.error('[Profile] Update error:', profileError)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  // Also update auth metadata
  await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, full_name: trimmedName },
  })

  return NextResponse.json({ success: true, full_name: trimmedName })
}
