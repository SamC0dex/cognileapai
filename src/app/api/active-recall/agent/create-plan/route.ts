import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildMindMapSyncPayload } from '@/lib/active-recall-mindmap-sync'
import type { ChatMessage } from '@/lib/ai-providers'
import type { MindMapData } from '@/types/mindmap'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      title,
      documentIds,
      goal,
      timeline,
      durationDays,
      priorKnowledge,
      examId,
    } = await req.json()

    if (!title || !documentIds?.length) {
      return NextResponse.json({ error: 'Missing title or documentIds' }, { status: 400 })
    }

    // Fetch document titles
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title')
      .in('id', documentIds)
      .eq('user_id', user.id)

    // Auto-sync any unsynced mind maps from outputs table before counting cards
    const { data: mindMapOutputs } = await supabase
      .from('outputs')
      .select('id, payload, document_id')
      .eq('type', 'mind_map')
      .in('document_id', documentIds)

    if (mindMapOutputs && mindMapOutputs.length > 0) {
      // Check which mind maps are already synced
      const { data: syncedMindmaps } = await supabase
        .from('review_cards')
        .select('source_set_id')
        .eq('user_id', user.id)
        .eq('source_type', 'mindmap')
        .in('document_id', documentIds)

      const syncedSetIds = new Set((syncedMindmaps || []).map((c) => c.source_set_id))

      for (const mm of mindMapOutputs) {
        if (syncedSetIds.has(mm.id)) continue // Already synced

        try {
          const payload = typeof mm.payload === 'string' ? JSON.parse(mm.payload) : mm.payload
          const mindMapData: MindMapData | undefined = payload?.mindMapData
          if (!mindMapData?.branches) continue

          const syncPayload = buildMindMapSyncPayload(mm.id, mindMapData, mm.document_id)

          for (const card of syncPayload.cards) {
            await supabase
              .from('review_cards')
              .upsert(
                {
                  user_id: user.id,
                  source_type: 'mindmap',
                  source_id: card.id,
                  source_set_id: mm.id,
                  document_id: mm.document_id || null,
                  question: card.question,
                  answer: card.answer,
                  topic: card.topic || null,
                  difficulty: card.difficulty || null,
                },
                { onConflict: 'user_id,source_type,source_id', ignoreDuplicates: true }
              )
          }
          console.log(`[CreatePlan] Auto-synced ${syncPayload.cards.length} mind map cards from output ${mm.id}`)
        } catch (syncErr) {
          console.error(`[CreatePlan] Failed to auto-sync mind map ${mm.id}:`, syncErr)
        }
      }
    }

    // Fetch existing review cards per document (now includes auto-synced mind maps)
    const { data: existingCards } = await supabase
      .from('review_cards')
      .select('id, source_type, source_set_id, topic, recall_layer, correct_reviews, total_reviews')
      .eq('user_id', user.id)
      .in('document_id', documentIds)

    const totalCards = existingCards?.length || 0

    // Compute per-topic stats
    const topicStats = new Map<string, { correct: number; total: number; count: number }>()
    ;(existingCards || []).forEach((c) => {
      const topic = c.topic || 'General'
      const existing = topicStats.get(topic) || { correct: 0, total: 0, count: 0 }
      existing.correct += c.correct_reviews || 0
      existing.total += c.total_reviews || 0
      existing.count++
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

    // Count tool types
    const sourceTypes = new Map<string, Set<string>>()
    ;(existingCards || []).forEach((c) => {
      const existing = sourceTypes.get(c.source_type) || new Set()
      existing.add(c.source_set_id)
      sourceTypes.set(c.source_type, existing)
    })

    const flashcardSets = sourceTypes.get('flashcard')?.size || 0
    const quizSets = sourceTypes.get('quiz')?.size || 0
    const mindmapSets = sourceTypes.get('mindmap')?.size || 0

    // Calculate days for the plan
    let daysCount = 14
    if (durationDays && typeof durationDays === 'number' && durationDays > 0) {
      daysCount = Math.min(90, Math.max(1, Math.round(durationDays)))
    } else if (timeline) {
      const targetDate = new Date(timeline)
      if (!isNaN(targetDate.getTime())) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        daysCount = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      }
    }
    console.log(`[CreatePlan] Calculated daysCount=${daysCount} from timeline=${timeline}, durationDays=${durationDays}`)

    // Build dates for the schedule
    const today = new Date()
    const dates: string[] = []
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().split('T')[0])
    }

    // Build AI prompt for schedule generation
    const systemPrompt = `You are a study planning AI that creates multi-tool learning schedules. Create a day-by-day study plan that combines flashcards, quizzes, and mind maps using progressive learning principles.

Progressive Learning Model:
- Early days: Mind map overview (understand the big picture) + easy flashcards
- Middle days: All flashcards + start quizzes
- Later days: Quiz-heavy + spaced review of weak cards
- SM-2 handles actual spacing; you set the daily focus and recommended card counts

CRITICAL: You MUST generate EXACTLY ${daysCount} days in the schedule. Each day MUST have 2-4 activities.

Output a JSON array with EXACTLY ${daysCount} day objects:
[{
  "day": 1,
  "date": "${dates[0]}",
  "activities": [
    { "type": "mindmap_review", "topic": "...", "cardCount": 5, "notes": "..." },
    { "type": "flashcard_review", "topic": "...", "cardCount": 15, "notes": "..." },
    { "type": "quiz_session", "topic": "...", "cardCount": 10, "notes": "..." }
  ]
},
... (${daysCount} total days through day ${daysCount} on ${dates[dates.length - 1]})]

Rules:
- activity type must be one of: flashcard_review, quiz_session, mindmap_review
- Max 40 cards per day total, 25 recommended for normal pace
- ${daysCount <= 3 ? 'CRAM MODE: increase daily cards to 50, focus on weak areas, no rest days' : daysCount <= 7 ? 'SHORT timeline: be focused and efficient, cover all topics, no rest days' : 'normal pacing, include 1 rest/light day per week if > 10 days'}
- Front-load weak topics, maintain strong topics with occasional review
- Be specific about topics per activity — vary them across days
- Distribute all tool types across the schedule (mind maps early, quizzes later)
- Return ONLY valid JSON array, no other text
- The array MUST contain exactly ${daysCount} day entries`

    const userPrompt = `Create a ${daysCount}-day study plan:
- Title: ${title}
- Documents: ${(docs || []).map(d => d.title).join(', ')}
- Goal: ${goal || 'understanding'}
- Prior knowledge: ${priorKnowledge || 'some_exposure'}
- Duration: EXACTLY ${daysCount} days (${dates[0]} to ${dates[dates.length - 1]})
- Dates for each day: ${dates.map((d, i) => `Day ${i + 1}: ${d}`).join(', ')}
- Available tools: ${flashcardSets} flashcard sets, ${quizSets} quiz sets, ${mindmapSets} mind map sets
- Total review cards: ${totalCards}
- Weak topics: ${weakTopics.join(', ') || 'none identified'}
- Strong topics: ${strongTopics.join(', ') || 'none identified'}

Generate the ${daysCount}-day study schedule as JSON. Remember: EXACTLY ${daysCount} day entries.`

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    const { text, config, usage } = await routedCompletion(user.id, {
      messages,
      maxTokens: Math.min(8192, 1000 + daysCount * 600),
      temperature: 0.5,
    })

    if (usage) {
      recordUsage({ userId: user.id, provider: config.provider, model: config.model, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, totalTokens: usage.totalTokens, source: 'active-recall' })
    }

    // Parse schedule from AI
    let schedule: Array<{
      day: number
      date: string
      activities: Array<{
        type: string
        topic: string
        cardCount: number
        notes: string
      }>
    }> = []

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        schedule = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error('[CreatePlan] JSON parse error:', parseError, 'Raw text:', text.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse study plan' }, { status: 500 })
    }

    // Ensure schedule has correct dates and fill in missing days
    if (schedule.length < daysCount) {
      console.warn(`[CreatePlan] AI only generated ${schedule.length}/${daysCount} days, padding remaining days`)
      // Use last day as template for missing days
      const templateActivities = schedule.length > 0
        ? schedule[schedule.length - 1].activities.map(a => ({ ...a, notes: 'Spaced review session' }))
        : [
            { type: 'flashcard_review', topic: 'Mixed review', cardCount: 15, notes: 'Review all topics' },
            { type: 'quiz_session', topic: 'Mixed review', cardCount: 10, notes: 'Test your recall' },
          ]

      for (let i = schedule.length; i < daysCount; i++) {
        schedule.push({
          day: i + 1,
          date: dates[i],
          activities: templateActivities.map(a => ({ ...a })),
        })
      }
    }

    // Fix dates in case AI used wrong dates
    for (let i = 0; i < schedule.length; i++) {
      schedule[i].day = i + 1
      schedule[i].date = dates[i] || schedule[i].date
    }

    if (!schedule.length) {
      return NextResponse.json({ error: 'AI generated empty schedule' }, { status: 500 })
    }

    // Calculate totals
    const totalActivities = schedule.reduce((sum, day) => sum + day.activities.length, 0)

    // Save to agent_study_plans
    const { data: plan, error: insertError } = await supabase
      .from('agent_study_plans')
      .insert({
        user_id: user.id,
        title,
        document_ids: documentIds,
        exam_id: examId || null,
        onboarding_context: { goal, timeline, priorKnowledge },
        schedule: JSON.stringify(schedule),
        status: 'active',
        current_day: 1,
        total_activities: totalActivities,
        completed_activities: 0,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[CreatePlan] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 })
    }

    // Link existing review cards to this plan
    if (totalCards > 0) {
      const { data: linkedCards, error: linkError } = await supabase
        .from('review_cards')
        .update({ plan_id: plan.id })
        .eq('user_id', user.id)
        .in('document_id', documentIds)
        .is('plan_id', null)
        .select('id')

      console.log(`[CreatePlan] Linked ${linkedCards?.length || 0} of ${totalCards} cards to plan ${plan.id}`)
      if (linkError) console.error('[CreatePlan] Link error:', linkError)
    }

    return NextResponse.json({
      plan: {
        id: plan.id,
        title: plan.title,
        documentIds,
        schedule,
        totalActivities,
        status: 'active',
        weakTopics,
        strongTopics,
      },
    })
  } catch (error) {
    console.error('[CreatePlan] Error:', error)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
}
