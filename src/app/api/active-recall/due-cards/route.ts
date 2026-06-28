import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RecallLayer } from '@/types/active-recall'
import type { DueCardsResponse, SmartScheduleMeta } from '@/types/active-recall'
import { computePriorityScore, interleaveByTopic, selectCardsForCapacity, categorizeByUrgency, getTopFocusTopics } from '@/lib/card-scheduler'

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
    const includeUnplanned = searchParams.get('include_unplanned') === 'true'
    const smart = searchParams.get('smart') === 'true'
    const minutes = searchParams.get('minutes') ? parseInt(searchParams.get('minutes')!, 10) : null

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
    } else if (!includeUnplanned) {
      query = query.not('plan_id', 'is', null)
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
    } else if (!includeUnplanned) {
      countQuery = countQuery.not('plan_id', 'is', null)
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

    // Smart scheduling: score → sort → interleave → capacity trim
    let smartMeta: SmartScheduleMeta | undefined
    if (smart && cards && cards.length > 0) {
      const now = new Date()
      const scored = cards.map((card) => ({
        ...card,
        priorityScore: computePriorityScore(card, now),
      }))

      // Sort by priority descending
      scored.sort((a, b) => b.priorityScore - a.priorityScore)

      // Interleave by topic
      const interleaved = interleaveByTopic(scored)

      // Capacity trim if minutes specified
      const finalCards = minutes ? selectCardsForCapacity(interleaved, minutes) : interleaved

      // Build metadata
      smartMeta = {
        topFocusTopics: getTopFocusTopics(scored),
        estimatedMinutes: Math.ceil(finalCards.length * 0.5), // ~30s per card
        cardsByUrgency: categorizeByUrgency(scored),
      }

      cards = finalCards
    }

    const response: DueCardsResponse = {
      cards: cards || [],
      totalDue: totalDue || 0,
      dueByLayer: dueByLayer as Record<RecallLayer, number>,
    }

    return NextResponse.json({ ...response, ...(smartMeta ? { smartMeta } : {}) })
  } catch (error) {
    console.error('[ActiveRecall] Due cards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
