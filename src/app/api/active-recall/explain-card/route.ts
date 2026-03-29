import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildCardExplanationPrompt } from '@/lib/active-recall-prompts'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { cardId, question, answer, userAttempt } = await req.json()

    if (!cardId || !question || !answer) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check cache first
    const { data: cached } = await supabase
      .from('card_explanations')
      .select('explanation')
      .eq('card_id', cardId)
      .eq('user_id', user.id)
      .single()

    if (cached) {
      return NextResponse.json({ explanation: cached.explanation, cached: true })
    }

    // Generate explanation
    const messages = buildCardExplanationPrompt(question, answer, userAttempt)

    const { text, config, usage } = await routedCompletion(user.id, {
      messages,
      maxTokens: 500,
      temperature: 0.7,
    })

    if (usage) {
      recordUsage({ userId: user.id, provider: config.provider, model: config.model, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, totalTokens: usage.totalTokens, source: 'active-recall', sourceId: cardId })
    }

    const explanation = text.trim()

    // Cache it (ignore errors — table may not exist yet)
    try {
      await supabase
        .from('card_explanations')
        .upsert({
          card_id: cardId,
          user_id: user.id,
          explanation,
        }, { onConflict: 'card_id,user_id' })
        .select()
        .single()
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({ explanation, cached: false })
  } catch (error) {
    console.error('[ExplainCard] Error:', error)
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 })
  }
}
