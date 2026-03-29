import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — Start or complete a review session
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, sessionId, documentId, planId, totalTimeMs } = body

    if (action === 'start') {
      // Create a new session
      const insertData: Record<string, unknown> = {
        user_id: user.id,
        document_id: documentId || null,
      }
      if (planId) {
        insertData.plan_id = planId
        insertData.session_type = 'plan'
      }

      const { data: session, error } = await supabase
        .from('review_sessions')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        console.error('[ActiveRecall] Session start error:', error)
        return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
      }

      return NextResponse.json({ session })
    }

    if (action === 'complete' && sessionId) {
      // Complete an existing session
      const { data: session, error } = await supabase
        .from('review_sessions')
        .update({
          completed_at: new Date().toISOString(),
          total_time_ms: totalTimeMs || null,
        })
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) {
        console.error('[ActiveRecall] Session complete error:', error)
        return NextResponse.json({ error: 'Failed to complete session' }, { status: 500 })
      }

      return NextResponse.json({ session })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[ActiveRecall] Session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET — Fetch recent sessions
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    const { data: sessions, error } = await supabase
      .from('review_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[ActiveRecall] Sessions fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (error) {
    console.error('[ActiveRecall] Sessions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
