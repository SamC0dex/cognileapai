import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildActiveRecallLearningContext } from '@/lib/active-recall-learning-context'
import { buildActiveRecallReadiness } from '@/lib/active-recall-readiness'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const context = await buildActiveRecallLearningContext(supabase, user.id, {
      planId: searchParams.get('plan_id'),
      documentId: searchParams.get('document_id'),
    })

    return NextResponse.json({
      readiness: buildActiveRecallReadiness(context),
      scope: context.scope,
      plan: context.plan,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Plan not found') {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    console.error('[Readiness] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
