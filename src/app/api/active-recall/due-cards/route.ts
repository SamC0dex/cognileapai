import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RecallLayer } from '@/types/active-recall'
import type { DueCardsResponse } from '@/types/active-recall'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const documentId = searchParams.get('document_id')
    const layer = searchParams.get('layer')
    const planId = searchParams.get('plan_id')
    const sourceType = searchParams.get('source_type')
    const progressive = searchParams.get('progressive') === 'true'
    const includeAll = searchParams.get('include_all') === 'true'

    // Fetch due cards (next_review_at <= now), or all cards if include_all
    let query = supabase
      .from('review_cards')
      .select('*')
      .eq('user_id', user.id)
      .order('next_review_at', { ascending: true })
      .limit(limit)

    if (!includeAll) {
      query = query.lte('next_review_at', new Date().toISOString())
    }

    if (documentId) {
      query = query.eq('document_id', documentId)
    }
    if (layer) {
      query = query.eq('recall_layer', parseInt(layer, 10))
    }
    if (planId) {
      query = query.eq('plan_id', planId)
    }
    if (sourceType) {
      query = query.eq('source_type', sourceType)
    }

    const { data: rawCards, error } = await query

    // Progressive ordering: mindmap (ABSORB) → flashcard (RECOGNIZE) → quiz (RETRIEVE)
    // Within each group: most overdue first (already sorted by next_review_at)
    let cards = rawCards
    if (progressive && cards) {
      const sourceOrder: Record<string, number> = { mindmap: 0, flashcard: 1, quiz: 2 }
      cards = [...cards].sort((a, b) => {
        const aOrder = sourceOrder[a.source_type] ?? 1
        const bOrder = sourceOrder[b.source_type] ?? 1
        if (aOrder !== bOrder) return aOrder - bOrder
        // Within same type, keep overdue-first order
        return new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime()
      })
    }

    if (error) {
      console.error('[ActiveRecall] Due cards fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch due cards' }, { status: 500 })
    }

    // Get total due count (without limit)
    let countQuery = supabase
      .from('review_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (!includeAll) {
      countQuery = countQuery.lte('next_review_at', new Date().toISOString())
    }

    if (documentId) {
      countQuery = countQuery.eq('document_id', documentId)
    }
    if (planId) {
      countQuery = countQuery.eq('plan_id', planId)
    }
    if (sourceType) {
      countQuery = countQuery.eq('source_type', sourceType)
    }

    const { count: totalDue } = await countQuery

    // Get due count by layer
    const dueByLayer: Record<number, number> = {
      [RecallLayer.ABSORB]: 0,
      [RecallLayer.RECOGNIZE]: 0,
      [RecallLayer.RETRIEVE]: 0,
      [RecallLayer.MASTERED]: 0,
    }

    for (const card of cards || []) {
      dueByLayer[card.recall_layer] = (dueByLayer[card.recall_layer] || 0) + 1
    }

    const response: DueCardsResponse = {
      cards: cards || [],
      totalDue: totalDue || 0,
      dueByLayer: dueByLayer as Record<RecallLayer, number>,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[ActiveRecall] Due cards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
