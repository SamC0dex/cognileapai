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

    const sourceIds = cards.map((card) => card.id)
    const { data: existingCards, error: existingFetchError } = await supabase
      .from('review_cards')
      .select('source_id')
      .eq('user_id', user.id)
      .eq('source_type', sourceType)
      .in('source_id', sourceIds)

    if (existingFetchError) {
      console.error('[ActiveRecall] Existing card lookup error:', existingFetchError)
      return NextResponse.json({ error: 'Failed to check existing cards' }, { status: 500 })
    }

    const existingIds = new Set((existingCards || []).map((card) => card.source_id))
    const newCards = cards.filter((card) => !existingIds.has(card.id))
    let synced = 0

    // Insert only new cards. Existing cards preserve their SM-2 state and content.
    for (const card of newCards) {
      const { error } = await supabase
        .from('review_cards')
        .insert({
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
        })

      if (error) {
        console.error('[ActiveRecall] Insert error for card:', card.id, error)
      } else {
        synced++
      }
    }

    // Ensure plan_id is set on all cards for this source set, including pre-existing ones.
    if (planId) {
      await supabase
        .from('review_cards')
        .update({ plan_id: planId })
        .eq('user_id', user.id)
        .eq('source_set_id', sourceSetId)
        .is('plan_id', null)
    }

    const { count } = await supabase
      .from('review_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_set_id', sourceSetId)

    const response: SyncResponse = {
      synced,
      existing: existingIds.size,
      total: count || synced,
    }

    console.log('[ActiveRecall] Sync complete:', response)

    return NextResponse.json(response)
  } catch (error) {
    console.error('[ActiveRecall] Sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
