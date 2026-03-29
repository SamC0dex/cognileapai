import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildMindMapSyncPayload } from '@/lib/active-recall-mindmap-sync'
import type { MindMapData } from '@/types/mindmap'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mindMapSetId, planId } = await req.json()

    if (!mindMapSetId) {
      return NextResponse.json({ error: 'Missing mindMapSetId' }, { status: 400 })
    }

    // Fetch the mind map set from the mind_map_sets table
    const { data: mindMapSet, error: fetchError } = await supabase
      .from('mind_map_sets')
      .select('id, title, mind_map_data, document_id')
      .eq('id', mindMapSetId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !mindMapSet) {
      return NextResponse.json({ error: 'Mind map set not found' }, { status: 404 })
    }

    const mindMapData: MindMapData = typeof mindMapSet.mind_map_data === 'string'
      ? JSON.parse(mindMapSet.mind_map_data)
      : mindMapSet.mind_map_data

    // Build sync payload
    const payload = buildMindMapSyncPayload(
      mindMapSet.id,
      mindMapData,
      mindMapSet.document_id
    )

    // Sync cards to review_cards
    let synced = 0
    let existing = 0

    for (const card of payload.cards) {
      const { error } = await supabase
        .from('review_cards')
        .upsert(
          {
            user_id: user.id,
            source_type: 'mindmap',
            source_id: card.id,
            source_set_id: mindMapSetId,
            document_id: mindMapSet.document_id || null,
            plan_id: planId || null,
            question: card.question,
            answer: card.answer,
            options: null,
            correct_answer: null,
            topic: card.topic || null,
            difficulty: card.difficulty || null,
          },
          {
            onConflict: 'user_id,source_type,source_id',
            ignoreDuplicates: true,
          }
        )

      if (error) {
        console.error('[SyncMindMap] Upsert error:', card.id, error)
        existing++
      } else {
        synced++
      }
    }

    // Count total cards for this set
    const { count } = await supabase
      .from('review_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_set_id', mindMapSetId)

    // Ensure plan_id is set on all cards for this set (including pre-existing ones)
    if (planId) {
      await supabase
        .from('review_cards')
        .update({ plan_id: planId })
        .eq('user_id', user.id)
        .eq('source_set_id', mindMapSetId)
        .is('plan_id', null)
    }

    existing = (count || 0) - synced
    if (existing < 0) existing = 0

    return NextResponse.json({
      synced,
      existing: Math.max(0, existing),
      total: count || synced,
      cardCount: payload.cards.length,
    })
  } catch (error) {
    console.error('[SyncMindMap] Error:', error)
    return NextResponse.json({ error: 'Failed to sync mind map' }, { status: 500 })
  }
}
