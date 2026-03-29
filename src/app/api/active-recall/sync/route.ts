import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SyncRequest, SyncResponse } from '@/types/active-recall'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SyncRequest & { planId?: string } = await req.json()
    const { sourceType, sourceSetId, documentId, cards, planId } = body

    if (!sourceType || !sourceSetId || !cards?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log(`[ActiveRecall] Syncing ${cards.length} ${sourceType} cards for user ${user.id}`)

    let synced = 0
    let existing = 0

    // Upsert cards — ON CONFLICT do nothing (preserve existing SM-2 state)
    for (const card of cards) {
      const { error } = await supabase
        .from('review_cards')
        .upsert(
          {
            user_id: user.id,
            source_type: sourceType,
            source_id: card.id,
            source_set_id: sourceSetId,
            document_id: documentId || null,
            plan_id: planId || null,
            question: card.question,
            answer: card.answer,
            options: card.options || null,
            correct_answer: card.correctAnswer ?? null,
            topic: card.topic || null,
            difficulty: card.difficulty || null,
          },
          {
            onConflict: 'user_id,source_type,source_id',
            ignoreDuplicates: true,
          }
        )

      if (error) {
        console.error('[ActiveRecall] Upsert error for card:', card.id, error)
        existing++
      } else {
        synced++
      }
    }

    // If some were ignored due to conflict, count them as existing
    // Check how many actually exist now
    const { count } = await supabase
      .from('review_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_set_id', sourceSetId)

    // Ensure plan_id is set on all cards for this source set (including pre-existing ones)
    if (planId) {
      await supabase
        .from('review_cards')
        .update({ plan_id: planId })
        .eq('user_id', user.id)
        .eq('source_set_id', sourceSetId)
        .is('plan_id', null)
    }

    existing = (count || 0) - synced
    if (existing < 0) existing = 0

    const response: SyncResponse = {
      synced,
      existing: Math.max(0, existing),
      total: count || synced,
    }

    console.log(`[ActiveRecall] Sync complete:`, response)

    return NextResponse.json(response)
  } catch (error) {
    console.error('[ActiveRecall] Sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
