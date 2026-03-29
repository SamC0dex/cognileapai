import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildStudyPlanPrompt } from '@/lib/active-recall-prompts'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { examId } = await req.json()
    if (!examId) {
      return NextResponse.json({ error: 'Missing examId' }, { status: 400 })
    }

    // Fetch exam details
    const { data: exam, error: examError } = await supabase
      .from('exam_dates')
      .select('*')
      .eq('id', examId)
      .eq('user_id', user.id)
      .single()

    if (examError || !exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    // Calculate days until exam
    const examDate = new Date(exam.exam_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysUntil = Math.max(1, Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))

    // Fetch user's cards for topic analysis
    const { data: cards } = await supabase
      .from('review_cards')
      .select('topic, recall_layer, correct_reviews, total_reviews')
      .eq('user_id', user.id)

    const totalCards = cards?.length || 0

    // Compute per-topic mastery
    const topicStats = new Map<string, { correct: number; total: number }>()
    ;(cards || []).forEach((c) => {
      const topic = c.topic || 'General'
      const existing = topicStats.get(topic) || { correct: 0, total: 0 }
      existing.correct += c.correct_reviews || 0
      existing.total += c.total_reviews || 0
      topicStats.set(topic, existing)
    })

    const weakTopics: string[] = []
    const strongTopics: string[] = []
    topicStats.forEach((s, topic) => {
      if (s.total < 2) return
      const acc = (s.correct / s.total) * 100
      if (acc < 65) weakTopics.push(topic)
      else if (acc > 85) strongTopics.push(topic)
    })

    // Overall mastery
    const masteryCards = (cards || []).filter((c) => c.recall_layer >= 3).length
    const masteryPct = totalCards > 0 ? Math.round((masteryCards / totalCards) * 100) : 0

    // Generate study plan via AI
    const messages = buildStudyPlanPrompt(
      exam.title,
      exam.exam_date,
      daysUntil,
      totalCards,
      weakTopics,
      strongTopics,
      masteryPct
    )

    const { text, config, usage } = await routedCompletion(user.id, {
      messages,
      maxTokens: 2000,
      temperature: 0.7,
    })

    if (usage) {
      recordUsage({ userId: user.id, provider: config.provider, model: config.model, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, totalTokens: usage.totalTokens, source: 'active-recall' })
    }

    // Parse JSON from AI response
    let days: Array<{ day: number; date: string; focus: string; cards: number; notes: string }> = []
    try {
      // Extract JSON array from response (handle markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        days = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error('[StudyPlan] JSON parse error:', parseError)
      return NextResponse.json({ error: 'Failed to parse study plan' }, { status: 500 })
    }

    // Save to study_plans table (ignore errors if table doesn't exist yet)
    let planId: string | null = null
    try {
      const totalPlanCards = days.reduce((sum, d) => sum + (d.cards || 0), 0)
      const estimatedHours = Math.round((totalPlanCards * 1.5) / 60 * 10) / 10 // ~1.5 min per card

      const { data: plan } = await supabase
        .from('study_plans')
        .upsert({
          user_id: user.id,
          exam_id: examId,
          days: JSON.stringify(days),
          total_cards: totalPlanCards,
          estimated_hours: estimatedHours,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'exam_id' })
        .select('id')
        .single()

      planId = plan?.id || null
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({
      plan: {
        id: planId,
        examId,
        examTitle: exam.title,
        examDate: exam.exam_date,
        daysUntil,
        days,
        totalCards: days.reduce((sum, d) => sum + (d.cards || 0), 0),
        estimatedHours: Math.round((days.reduce((sum, d) => sum + (d.cards || 0), 0) * 1.5) / 60 * 10) / 10,
        weakTopics,
        strongTopics,
        masteryPct,
      },
    })
  } catch (error) {
    console.error('[StudyPlan] Error:', error)
    return NextResponse.json({ error: 'Failed to generate study plan' }, { status: 500 })
  }
}
