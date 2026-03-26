import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import type { ChatMessage } from '@/lib/ai-providers'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { accuracy, cardsReviewed, avgResponseTimeMs, promotions, demotions } = await req.json()

    // Get topic performance context
    const { data: cards } = await supabase
      .from('review_cards')
      .select('topic, correct_reviews, total_reviews')
      .eq('user_id', user.id)

    const topicStats = new Map<string, { correct: number; total: number }>()
    ;(cards || []).forEach((c) => {
      const topic = c.topic || 'General'
      const existing = topicStats.get(topic) || { correct: 0, total: 0 }
      existing.correct += c.correct_reviews
      existing.total += c.total_reviews
      topicStats.set(topic, existing)
    })

    const weakTopics: string[] = []
    const strongTopics: string[] = []
    topicStats.forEach((s, topic) => {
      if (s.total < 3) return
      const acc = (s.correct / s.total) * 100
      if (acc < 60) weakTopics.push(topic)
      else if (acc > 85) strongTopics.push(topic)
    })

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a supportive study coach giving brief post-session feedback. Be specific, warm, and actionable. Keep it to 2-3 sentences. No emojis.`
      },
      {
        role: 'user',
        content: `Session results:
- Cards reviewed: ${cardsReviewed}
- Accuracy: ${accuracy}%
- Avg response time: ${Math.round(avgResponseTimeMs / 1000)}s per card
- Cards promoted: ${promotions}
- Cards needing more work: ${demotions}
- Weak topics overall: ${weakTopics.slice(0, 3).join(', ') || 'none'}
- Strong topics overall: ${strongTopics.slice(0, 3).join(', ') || 'none'}

Give a brief, personalized coaching message about this session.`
      }
    ]

    const { text } = await routedCompletion(user.id, {
      messages,
      maxTokens: 200,
      temperature: 0.8,
    })

    return NextResponse.json({ feedback: text.trim() })
  } catch (error) {
    console.error('[SessionFeedback] Error:', error)
    return NextResponse.json({
      feedback: 'Great session! Keep up the consistent practice — every review strengthens your memory.'
    })
  }
}
