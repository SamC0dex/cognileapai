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

    // Fetch due cards (next_review_at <= now)
    let query = supabase
      .from('review_cards')
      .select('*')
      .eq('user_id', user.id)
      .lte('next_review_at', new Date().toISOString())
      .order('next_review_at', { ascending: true })
      .limit(limit)

    if (documentId) {
      query = query.eq('document_id', documentId)
    }
    if (layer) {
      query = query.eq('recall_layer', parseInt(layer, 10))
    }

    const { data: cards, error } = await query

    if (error) {
      console.error('[ActiveRecall] Due cards fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch due cards' }, { status: 500 })
    }

    // Get total due count (without limit)
    let countQuery = supabase
      .from('review_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .lte('next_review_at', new Date().toISOString())

    if (documentId) {
      countQuery = countQuery.eq('document_id', documentId)
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
