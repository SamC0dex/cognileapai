import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RecallLayer } from '@/types/active-recall'
import type { ActiveRecallStats, DocumentMastery } from '@/types/active-recall'
import { aggregateDocumentRetention } from '@/lib/forgetting-curve'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const documentId = searchParams.get('document_id')
    const planId = searchParams.get('plan_id')
    const includeUnplanned = searchParams.get('include_unplanned') === 'true'

    // Fetch all user's review cards
    let cardsQuery = supabase
      .from('review_cards')
      .select('*')
      .eq('user_id', user.id)

    if (documentId) {
      cardsQuery = cardsQuery.eq('document_id', documentId)
    }
    if (planId) {
      cardsQuery = cardsQuery.eq('plan_id', planId)
    } else if (!includeUnplanned) {
      cardsQuery = cardsQuery.not('plan_id', 'is', null)
    }

    const { data: cards, error: cardsError } = await cardsQuery

    if (cardsError) {
      console.error('[ActiveRecall] Stats cards fetch error:', cardsError)
      return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 })
    }

    const allCards = cards || []

    // Fetch streak
    const { data: streak } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Fetch recent sessions
    const { data: sessions } = await supabase
      .from('review_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(10)

    // Count due cards
    const now = new Date().toISOString()
    const dueCards = allCards.filter((c) => c.next_review_at <= now)

    // Cards by layer
    const cardsByLayer: Record<number, number> = {
      [RecallLayer.ABSORB]: 0,
      [RecallLayer.RECOGNIZE]: 0,
      [RecallLayer.RETRIEVE]: 0,
      [RecallLayer.MASTERED]: 0,
    }
    allCards.forEach((c) => {
      cardsByLayer[c.recall_layer] = (cardsByLayer[c.recall_layer] || 0) + 1
    })

    // Average accuracy
    const totalReviews = allCards.reduce((sum, c) => sum + c.total_reviews, 0)
    const totalCorrect = allCards.reduce((sum, c) => sum + c.correct_reviews, 0)
    const averageAccuracy = totalReviews > 0 ? (totalCorrect / totalReviews) * 100 : 0

    // Mastery % (cards at MASTERED layer)
    const masteryPct = allCards.length > 0
      ? ((cardsByLayer[RecallLayer.MASTERED] || 0) / allCards.length) * 100
      : 0

    const stats: ActiveRecallStats = {
      totalCards: allCards.length,
      totalDue: dueCards.length,
      overdueCount: dueCards.filter((c) => {
        const dueDate = new Date(c.next_review_at)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        return dueDate < oneDayAgo
      }).length,
      currentStreak: streak?.current_streak || 0,
      longestStreak: streak?.longest_streak || 0,
      reviewStreak: streak?.review_streak || 0,
      masteryPct,
      totalReviews,
      averageAccuracy,
      cardsByLayer: cardsByLayer as Record<RecallLayer, number>,
      recentSessions: sessions || [],
    }

    // Document-level mastery
    const documentMap = new Map<string, typeof allCards>()
    allCards.forEach((card) => {
      const docId = card.document_id || 'no-document'
      if (!documentMap.has(docId)) documentMap.set(docId, [])
      documentMap.get(docId)!.push(card)
    })

    // Fetch document titles
    const documentIds = Array.from(documentMap.keys()).filter((id) => id !== 'no-document')
    const { data: documents } = documentIds.length > 0
      ? await supabase.from('documents').select('id, title').in('id', documentIds)
      : { data: [] }

    const docTitleMap = new Map<string, string>()
    documents?.forEach((doc) => docTitleMap.set(doc.id, doc.title))

    const masteryByDocument: DocumentMastery[] = Array.from(documentMap.entries()).map(
      ([docId, docCards]) => {
        const docCardsByLayer: Record<number, number> = {
          [RecallLayer.ABSORB]: 0,
          [RecallLayer.RECOGNIZE]: 0,
          [RecallLayer.RETRIEVE]: 0,
          [RecallLayer.MASTERED]: 0,
        }
        docCards.forEach((c) => {
          docCardsByLayer[c.recall_layer] = (docCardsByLayer[c.recall_layer] || 0) + 1
        })

        const { currentRetention } = aggregateDocumentRetention(docCards)

        const dueDates = docCards
          .map((c) => c.next_review_at)
          .filter((d) => d <= now)

        return {
          documentId: docId,
          documentTitle: docTitleMap.get(docId) || 'Conversation Cards',
          totalCards: docCards.length,
          masteredCards: docCardsByLayer[RecallLayer.MASTERED] || 0,
          learningCards: docCardsByLayer[RecallLayer.RECOGNIZE] || 0,
          newCards: docCardsByLayer[RecallLayer.ABSORB] || 0,
          reviewingCards: docCardsByLayer[RecallLayer.RETRIEVE] || 0,
          masteryPct: docCards.length > 0
            ? ((docCardsByLayer[RecallLayer.MASTERED] || 0) / docCards.length) * 100
            : 0,
          currentRetention,
          nextDueDate: dueDates.length > 0 ? dueDates.sort()[0] : null,
          cardsByLayer: docCardsByLayer as Record<RecallLayer, number>,
        }
      }
    )

    return NextResponse.json({ stats, masteryByDocument })
  } catch (error) {
    console.error('[ActiveRecall] Stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
