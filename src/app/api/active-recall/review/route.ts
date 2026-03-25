import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sm2, computeLayerTransition, formatInterval } from '@/lib/sm2'
import type { ReviewRequest, ReviewResponse, ReviewSessionResult } from '@/types/active-recall'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: ReviewRequest = await req.json()
    const { cardId, rating, responseTimeMs, sessionId } = body

    if (!cardId || rating === undefined || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch current card state
    const { data: card, error: fetchError } = await supabase
      .from('review_cards')
      .select('*')
      .eq('id', cardId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    // Run SM-2 algorithm
    const sm2Result = sm2({
      quality: rating,
      repetitions: card.repetitions,
      easeFactor: card.ease_factor,
      intervalDays: card.interval_days,
      aiMultiplier: card.ai_interval_multiplier,
    })

    // Compute layer transition
    const newConsecutiveCorrect = rating >= 3 ? card.consecutive_correct + 1 : 0
    const layerTransition = computeLayerTransition(
      card.recall_layer,
      rating,
      newConsecutiveCorrect
    )

    const isCorrect = rating >= 3
    const isLapse = layerTransition.newLayer < card.recall_layer

    // Compute running average response time
    const prevAvg = card.average_response_time_ms || responseTimeMs
    const newAvgResponseTime = Math.round(
      (prevAvg * card.total_reviews + responseTimeMs) / (card.total_reviews + 1)
    )

    // Update card in database
    const { data: updatedCard, error: updateError } = await supabase
      .from('review_cards')
      .update({
        ease_factor: sm2Result.easeFactor,
        interval_days: sm2Result.intervalDays,
        repetitions: sm2Result.repetitions,
        next_review_at: sm2Result.nextReviewAt.toISOString(),
        last_reviewed_at: new Date().toISOString(),
        recall_layer: layerTransition.newLayer,
        total_reviews: card.total_reviews + 1,
        correct_reviews: card.correct_reviews + (isCorrect ? 1 : 0),
        consecutive_correct: newConsecutiveCorrect,
        average_response_time_ms: newAvgResponseTime,
        lapse_count: card.lapse_count + (isLapse ? 1 : 0),
      })
      .eq('id', cardId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('[ActiveRecall] Card update error:', updateError)
      return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
    }

    // Append result to session
    const sessionResult: ReviewSessionResult = {
      card_id: cardId,
      rating: rating,
      response_time_ms: responseTimeMs,
      previous_layer: card.recall_layer,
      new_layer: layerTransition.newLayer,
    }

    // Update session results — fetch current, append, write back
    const { data: session } = await supabase
      .from('review_sessions')
      .select('results, cards_reviewed, cards_correct, cards_incorrect')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (session) {
      const results = [...(session.results as ReviewSessionResult[]), sessionResult]
      await supabase
        .from('review_sessions')
        .update({
          results,
          cards_reviewed: session.cards_reviewed + 1,
          cards_correct: session.cards_correct + (isCorrect ? 1 : 0),
          cards_incorrect: session.cards_incorrect + (isCorrect ? 0 : 1),
        })
        .eq('id', sessionId)
        .eq('user_id', user.id)
    }

    // Update user streaks
    const today = new Date().toISOString().split('T')[0]
    const { data: streak } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (streak) {
      const lastReview = streak.last_review_date
      let newReviewStreak = streak.review_streak || 0

      if (lastReview === today) {
        // Same day, don't change streak
      } else if (lastReview) {
        const lastDate = new Date(lastReview)
        const todayDate = new Date(today)
        const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        newReviewStreak = diffDays === 1 ? newReviewStreak + 1 : 1
      } else {
        newReviewStreak = 1
      }

      await supabase
        .from('user_streaks')
        .update({
          total_cards_reviewed: (streak.total_cards_reviewed || 0) + 1,
          review_streak: newReviewStreak,
          last_review_date: today,
          current_streak: Math.max(streak.current_streak || 0, newReviewStreak),
          longest_streak: Math.max(streak.longest_streak || 0, newReviewStreak),
          last_study_date: today,
        })
        .eq('user_id', user.id)
    } else {
      // Create streak record if it doesn't exist
      await supabase
        .from('user_streaks')
        .insert({
          user_id: user.id,
          total_cards_reviewed: 1,
          review_streak: 1,
          last_review_date: today,
          current_streak: 1,
          longest_streak: 1,
          last_study_date: today,
        })
    }

    const response: ReviewResponse = {
      updatedCard: updatedCard,
      newInterval: formatInterval(sm2Result.intervalDays),
      layerChange: layerTransition.newLayer !== card.recall_layer
        ? { from: card.recall_layer, to: layerTransition.newLayer }
        : null,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[ActiveRecall] Review error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
