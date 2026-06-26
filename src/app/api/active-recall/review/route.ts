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
    const { cardId, rating, responseTimeMs, sessionId, undo, previousState } = body

    if (!cardId || rating === undefined || !sessionId || responseTimeMs === undefined) {
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

    if (undo) {
      if (!previousState) {
        return NextResponse.json({ error: 'Missing previous card state for undo' }, { status: 400 })
      }

      const { data: restoredCard, error: restoreError } = await supabase
        .from('review_cards')
        .update({
          ease_factor: previousState.ease_factor,
          interval_days: previousState.interval_days,
          repetitions: previousState.repetitions,
          next_review_at: previousState.next_review_at,
          last_reviewed_at: previousState.last_reviewed_at,
          recall_layer: previousState.recall_layer,
          total_reviews: previousState.total_reviews,
          correct_reviews: previousState.correct_reviews,
          consecutive_correct: previousState.consecutive_correct,
          average_response_time_ms: previousState.average_response_time_ms,
          lapse_count: previousState.lapse_count,
        })
        .eq('id', cardId)
        .eq('user_id', user.id)
        .select()
        .single()

      if (restoreError) {
        console.error('[ActiveRecall] Undo card restore error:', restoreError)
        return NextResponse.json({ error: 'Failed to undo card rating' }, { status: 500 })
      }

      const { data: session } = await supabase
        .from('review_sessions')
        .select('results, cards_reviewed, cards_correct, cards_incorrect')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single()

      if (session) {
        const results = ((session.results || []) as ReviewSessionResult[])
        const removeIndex = [...results]
          .reverse()
          .findIndex((result) => result.card_id === cardId && result.rating === rating)
        const actualIndex = removeIndex >= 0 ? results.length - 1 - removeIndex : -1
        const removed = actualIndex >= 0 ? results[actualIndex] : null
        const updatedResults = actualIndex >= 0
          ? results.filter((_, index) => index !== actualIndex)
          : results
        const removedWasCorrect = removed ? removed.rating >= 3 : rating >= 3

        await supabase
          .from('review_sessions')
          .update({
            results: updatedResults,
            cards_reviewed: Math.max(0, (session.cards_reviewed || 0) - (removed ? 1 : 0)),
            cards_correct: Math.max(0, (session.cards_correct || 0) - (removedWasCorrect && removed ? 1 : 0)),
            cards_incorrect: Math.max(0, (session.cards_incorrect || 0) - (!removedWasCorrect && removed ? 1 : 0)),
          })
          .eq('id', sessionId)
          .eq('user_id', user.id)
      }

      const { data: streak } = await supabase
        .from('user_streaks')
        .select('total_cards_reviewed')
        .eq('user_id', user.id)
        .single()

      if (streak) {
        await supabase
          .from('user_streaks')
          .update({
            total_cards_reviewed: Math.max(0, (streak.total_cards_reviewed || 0) - 1),
          })
          .eq('user_id', user.id)
      }

      const response: ReviewResponse = {
        updatedCard: restoredCard,
        newInterval: formatInterval(previousState.interval_days),
        layerChange: previousState.recall_layer !== card.recall_layer
          ? { from: card.recall_layer, to: previousState.recall_layer }
          : null,
      }

      return NextResponse.json(response)
    }

    // Run SM-2 algorithm
    const sm2Result = sm2({
      quality: rating,
      repetitions: card.repetitions,
      easeFactor: card.ease_factor,
      intervalDays: card.interval_days,
      aiMultiplier: card.ai_interval_multiplier,
      avgResponseTimeMs: card.average_response_time_ms,
      difficulty: card.difficulty,
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
      const results = [...((session.results || []) as ReviewSessionResult[]), sessionResult]
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

    // Update user streaks — use user's timezone for date calculation
    let userTimezone = 'UTC'
    const { data: notifPrefs } = await supabase
      .from('notification_preferences')
      .select('timezone')
      .eq('user_id', user.id)
      .single()
    if (notifPrefs?.timezone) {
      userTimezone = notifPrefs.timezone
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone }) // YYYY-MM-DD
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
        // Compare dates as strings (YYYY-MM-DD) for timezone-safe day diff
        const lastParts = lastReview.split('-').map(Number)
        const todayParts = today.split('-').map(Number)
        const lastMs = Date.UTC(lastParts[0], lastParts[1] - 1, lastParts[2])
        const todayMs = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2])
        const diffDays = Math.round((todayMs - lastMs) / (1000 * 60 * 60 * 24))
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

    // Trigger AI interval adjustment every 50 reviews (fire-and-forget)
    const totalReviewed = streak
      ? (streak.total_cards_reviewed || 0) + 1
      : 1
    if (totalReviewed % 50 === 0) {
      fetch(new URL('/api/active-recall/adjust-intervals', req.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: req.headers.get('cookie') || '',
        },
      }).catch(() => {})
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
