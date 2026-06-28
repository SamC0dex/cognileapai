import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAIConfig, routedCompletionStream, type ResolvedAIConfig } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { supabase as serviceSupabase } from '@/lib/supabase'
import { generateKieDirectPdfCompletion } from '@/lib/kie-direct-pdf'
import { buildAgentSystemPrompt, buildAIChatSystemPrompt, type AgentContext, type AIChatContext, type PlanPerformance } from '@/lib/active-recall-prompts'
import { buildActiveRecallLearningContext } from '@/lib/active-recall-learning-context'
import { buildActiveRecallReadiness } from '@/lib/active-recall-readiness'
import { getCalendarPlanDay } from '@/lib/active-recall-plan-day'
import { RecallLayer } from '@/types/active-recall'
import type { ChatMessage, TokenUsage } from '@/lib/ai-providers'

const DIRECT_PDF_TEXT_THRESHOLD = 5000

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages: clientMessages, agentMode, selectedDocumentIds } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[]
      agentMode?: boolean
      selectedDocumentIds?: string[]
    }

    if (!clientMessages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    // Gather learning context for the system prompt
    const now = new Date().toISOString()

    const [cardsResult, streakResult, sessionsResult, examsResult, documentsResult, plansResult] = await Promise.all([
      supabase
        .from('review_cards')
        .select('topic, recall_layer, next_review_at, correct_reviews, total_reviews, document_id, source_type, source_set_id')
        .eq('user_id', user.id),
      supabase
        .from('user_streaks')
        .select('current_streak, longest_streak, review_streak, total_cards_reviewed')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('review_sessions')
        .select('started_at, cards_correct, cards_reviewed')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(3),
      supabase
        .from('exam_dates')
        .select('title, exam_date')
        .eq('user_id', user.id)
        .gte('exam_date', new Date().toISOString().split('T')[0])
        .order('exam_date', { ascending: true })
        .limit(5),
      // Fetch user's documents
      supabase
        .from('documents')
        .select('id, title')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      // Fetch active agent study plans
      supabase
        .from('agent_study_plans')
        .select('id, title, status, current_day, total_activities, completed_activities, created_at, schedule')
        .eq('user_id', user.id)
        .in('status', ['active', 'paused']),
    ])

    const allCards = cardsResult.data || []
    const dueCards = allCards.filter((c) => c.next_review_at <= now)
    const overdueCards = dueCards.filter((c) => {
      const dueDate = new Date(c.next_review_at)
      return (Date.now() - dueDate.getTime()) > 24 * 60 * 60 * 1000
    })

    // Topic analysis
    const topicStats = new Map<string, { correct: number; total: number }>()
    allCards.forEach((c) => {
      const topic = c.topic || 'General'
      const existing = topicStats.get(topic) || { correct: 0, total: 0 }
      existing.correct += c.correct_reviews
      existing.total += c.total_reviews
      topicStats.set(topic, existing)
    })

    const weakTopics: string[] = []
    const strongTopics: string[] = []
    topicStats.forEach((stats, topic) => {
      if (stats.total < 3) return
      const accuracy = (stats.correct / stats.total) * 100
      if (accuracy < 60) weakTopics.push(topic)
      else if (accuracy > 85) strongTopics.push(topic)
    })

    // Total accuracy
    let totalCorrect = 0
    let totalReviewCount = 0
    allCards.forEach((c) => {
      totalCorrect += c.correct_reviews
      totalReviewCount += c.total_reviews
    })
    const recentAccuracy = totalReviewCount > 0
      ? Math.round((totalCorrect / totalReviewCount) * 100)
      : 0

    const mastered = allCards.filter((c) => c.recall_layer === RecallLayer.MASTERED).length
    const masteryPct = allCards.length > 0 ? Math.round((mastered / allCards.length) * 100) : 0

    // Recent session summary
    const lastSession = sessionsResult.data?.[0]
    const recentSessionSummary = lastSession && lastSession.cards_reviewed > 0
      ? `${lastSession.cards_reviewed} cards, ${Math.round((lastSession.cards_correct / lastSession.cards_reviewed) * 100)}% accuracy`
      : null

    // Upcoming exams
    const upcomingExams = (examsResult.data || []).map((e) => ({
      title: e.title,
      daysUntil: Math.ceil((new Date(e.exam_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }))

    // Build system prompt — use agent prompt if agentMode, otherwise standard
    let systemPrompt: string

    if (agentMode !== false) {
      // Build document tool counts from review_cards
      const docToolCounts = new Map<string, { flashcardSets: Set<string>; quizSets: Set<string>; mindmapSets: Set<string> }>()
      allCards.forEach((c) => {
        if (!c.document_id) return
        const existing = docToolCounts.get(c.document_id) || {
          flashcardSets: new Set<string>(),
          quizSets: new Set<string>(),
          mindmapSets: new Set<string>(),
        }
        if (c.source_type === 'flashcard') existing.flashcardSets.add(c.source_set_id)
        else if (c.source_type === 'quiz') existing.quizSets.add(c.source_set_id)
        else if (c.source_type === 'mindmap') existing.mindmapSets.add(c.source_set_id)
        docToolCounts.set(c.document_id, existing)
      })

      const documents = (documentsResult.data || []).map((d) => {
        const tools = docToolCounts.get(d.id)
        return {
          id: d.id,
          title: d.title,
          flashcardCount: tools?.flashcardSets.size || 0,
          quizCount: tools?.quizSets.size || 0,
          mindmapCount: tools?.mindmapSets.size || 0,
        }
      })

      const activePlans = (plansResult.data || []).map((p) => {
        const schedule = typeof p.schedule === 'string'
          ? JSON.parse(p.schedule)
          : Array.isArray(p.schedule)
            ? p.schedule
            : []

        return {
          id: p.id,
          title: p.title,
          status: p.status,
          currentDay: getCalendarPlanDay(schedule, p.created_at),
          totalActivities: p.total_activities,
          completedActivities: p.completed_activities,
        }
      })

      // Compute per-plan performance from review_cards
      const planPerformance: PlanPerformance[] = []
      if (activePlans.length > 0) {
        for (const ap of activePlans.slice(0, 3)) {
          try {
            const learningContext = await buildActiveRecallLearningContext(supabase, user.id, { planId: ap.id })
            const readiness = buildActiveRecallReadiness(learningContext)
            planPerformance.push({
              planId: ap.id,
              planTitle: ap.title,
              accuracy: learningContext.summary.accuracy || 0,
              cardsReviewed: learningContext.summary.totalReviews,
              readinessScore: readiness.score,
              readinessLabel: readiness.label,
              dueCards: readiness.dueLoad.totalDue,
              nextFocus: readiness.nextFocus,
              weakTopics: readiness.weakTopics.map((topic) => topic.topic),
              strongTopics: learningContext.strongTopics.map((topic) => topic.topic),
            })
          } catch (error) {
            console.error('[AIChat] Plan readiness context error:', error)
          }
        }
      }

      const agentCtx: AgentContext = {
        totalCards: allCards.length,
        dueCards: dueCards.length,
        overdueCount: overdueCards.length,
        masteryPct,
        currentStreak: streakResult.data?.review_streak || 0,
        longestStreak: streakResult.data?.longest_streak || 0,
        weakTopics: weakTopics.slice(0, 5),
        strongTopics: strongTopics.slice(0, 5),
        recentAccuracy,
        totalReviews: streakResult.data?.total_cards_reviewed || 0,
        upcomingExams,
        recentSessionSummary,
        documents,
        activePlans,
        planPerformance: planPerformance.length > 0 ? planPerformance : undefined,
      }

      systemPrompt = buildAgentSystemPrompt(agentCtx)
    } else {
      const ctx: AIChatContext = {
        totalCards: allCards.length,
        dueCards: dueCards.length,
        overdueCount: overdueCards.length,
        masteryPct,
        currentStreak: streakResult.data?.review_streak || 0,
        longestStreak: streakResult.data?.longest_streak || 0,
        weakTopics: weakTopics.slice(0, 5),
        strongTopics: strongTopics.slice(0, 5),
        recentAccuracy,
        totalReviews: streakResult.data?.total_cards_reviewed || 0,
        upcomingExams,
        recentSessionSummary,
      }
      systemPrompt = buildAIChatSystemPrompt(ctx)
    }

    const directPdfUrls: string[] = []
    const selectedIds = Array.isArray(selectedDocumentIds) ? selectedDocumentIds.filter(Boolean).slice(0, 3) : []
    if (selectedIds.length > 0) {
      const { data: selectedDocs, error: selectedDocsError } = await supabase
        .from('documents')
        .select('id, title, document_content, storage_path, file_type')
        .in('id', selectedIds)
        .eq('user_id', user.id)

      if (selectedDocsError) {
        console.error('[AIChat] Selected document context error:', selectedDocsError)
      }

      const foundSelectedIds = new Set((selectedDocs || []).map((doc) => doc.id))
      const missingSelectedIds = selectedIds.filter((id) => !foundSelectedIds.has(id))
      if (missingSelectedIds.length > 0) {
        return NextResponse.json(
          {
            error: 'Selected document is not available for this account',
            message: 'The selected file is stale or belongs to another account. Please refresh, reselect the document, or upload it in the current account.',
          },
          { status: 403 }
        )
      }

      const textContexts: string[] = []
      for (const doc of selectedDocs || []) {
        const extractedContent = doc.document_content?.trim() || ''
        const isPdf = doc.file_type === 'pdf' || doc.storage_path?.toLowerCase().endsWith('.pdf')

        if (isPdf && extractedContent.length < DIRECT_PDF_TEXT_THRESHOLD && doc.storage_path) {
          const { data: signedUrlData, error: signedUrlError } = await serviceSupabase.storage
            .from('documents')
            .createSignedUrl(doc.storage_path, 15 * 60)

          if (!signedUrlError && signedUrlData?.signedUrl) {
            directPdfUrls.push(signedUrlData.signedUrl)
            textContexts.push(`=== ${doc.title} ===\n[Direct PDF attached because extracted text is unavailable.]`)
          }
          continue
        }

        if (extractedContent) {
          textContexts.push(`=== ${doc.title} ===\n${extractedContent.slice(0, 12000)}`)
        }
      }

      if (textContexts.length > 0) {
        systemPrompt += `\n\nSelected document context:\n${textContexts.join('\n\n')}`
      }
    }

    const aiMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...clientMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    // Stream response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let finalUsage: TokenUsage | null = null
          let finalConfig: ResolvedAIConfig | undefined

          if (directPdfUrls.length > 0) {
            const resolvedConfig = await resolveAIConfig(user.id)
            const directConfig = resolvedConfig.userConfig
            if (!directConfig?.apiKey) {
              throw new Error('No AI API key available for direct PDF reading. Add a Kie-compatible key in Settings or configure KIE_API_KEY on the server.')
            }

            const directResult = await generateKieDirectPdfCompletion({
              apiKey: directConfig.apiKey,
              model: directConfig.model || process.env.KIE_DEFAULT_MODEL || 'gemini-3-flash',
              messages: aiMessages,
              pdfUrls: directPdfUrls,
              maxTokens: 3000,
              temperature: 0.7,
            })

            finalUsage = directResult.usage
            finalConfig = {
              source: 'server',
              provider: resolvedConfig.provider,
              model: directResult.model,
              userConfig: directConfig,
            }
            controller.enqueue(encoder.encode(`0:${JSON.stringify(directResult.text)}\n`))
          } else {
            const generator = routedCompletionStream(user.id, {
              messages: aiMessages,
              maxTokens: 2000,
              temperature: 0.7,
            })

            for await (const chunk of generator) {
              if (chunk.text) {
                const data = JSON.stringify(chunk.text)
                controller.enqueue(encoder.encode(`0:${data}\n`))
              }
              if (chunk.usage) finalUsage = chunk.usage
              if (chunk.config) finalConfig = chunk.config
            }
          }

          // Record usage after stream completes
          if (finalUsage && finalConfig) {
            recordUsage({ userId: user.id, provider: finalConfig.provider, model: finalConfig.model, inputTokens: finalUsage.promptTokens, outputTokens: finalUsage.completionTokens, totalTokens: finalUsage.totalTokens, source: 'active-recall' })
          }

          controller.close()
        } catch (error) {
          console.error('[ActiveRecall] AI chat stream error:', error)
          const errMsg = error instanceof Error ? error.message : 'Chat failed'
          controller.enqueue(encoder.encode(`3:${JSON.stringify(errMsg)}\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[ActiveRecall] AI chat error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
