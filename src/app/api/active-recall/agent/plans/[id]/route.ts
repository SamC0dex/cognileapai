import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildMindMapSyncPayload } from '@/lib/active-recall-mindmap-sync'
import type { MindMapData } from '@/types/mindmap'

type Params = { params: Promise<{ id: string }> }

function activityMatchesCompletedTypes(activityType: string, completedTypes: string[]) {
  if (completedTypes.includes(activityType)) return true

  const equivalents: Record<string, string[]> = {
    flashcards: ['flashcard_review', 'flashcards'],
    flashcard_review: ['flashcard_review', 'flashcards'],
    quiz: ['quiz_session', 'quiz'],
    quiz_session: ['quiz_session', 'quiz'],
    mindmap: ['mindmap_review', 'mindmap'],
    mindmap_review: ['mindmap_review', 'mindmap'],
    review_due_cards: ['review_due_cards', 'flashcard_review', 'quiz_session', 'mindmap_review', 'flashcards', 'quiz', 'mindmap'],
  }

  return (equivalents[activityType] || []).some((type) => completedTypes.includes(type))
}

// GET /api/active-recall/agent/plans/[id] — full plan with schedule
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: plan, error } = await supabase
      .from('agent_study_plans')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    const schedule = typeof plan.schedule === 'string'
      ? JSON.parse(plan.schedule)
      : plan.schedule

    // Calculate current day
    const planCreated = new Date(plan.created_at)
    planCreated.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentDay = Math.max(1, Math.floor((today.getTime() - planCreated.getTime()) / (1000 * 60 * 60 * 24)) + 1)

    // Get card counts per source type for this plan
    let { data: cards } = await supabase
      .from('review_cards')
      .select('source_type, recall_layer, next_review_at')
      .eq('user_id', user.id)
      .eq('plan_id', id)

    // Auto-sync: if plan has 0 cards but documents have outputs, sync them now
    if ((!cards || cards.length === 0) && plan.document_ids?.length) {
      console.log(`[PlanDetail] Plan ${id} has 0 cards, attempting auto-sync for docs: ${plan.document_ids}`)
      try {
        // Sync mindmaps from outputs
        const { data: mmOutputs } = await supabase
          .from('outputs')
          .select('id, payload, document_id')
          .eq('type', 'mind_map')
          .in('document_id', plan.document_ids)

        for (const mm of mmOutputs || []) {
          const payload = typeof mm.payload === 'string' ? JSON.parse(mm.payload) : mm.payload
          const mindMapData: MindMapData | undefined = payload?.mindMapData
          if (!mindMapData?.branches) continue

          const syncPayload = buildMindMapSyncPayload(mm.id, mindMapData, mm.document_id)
          for (const card of syncPayload.cards) {
            await supabase.from('review_cards').upsert({
              user_id: user.id,
              source_type: 'mindmap',
              source_id: card.id,
              source_set_id: mm.id,
              document_id: mm.document_id || null,
              plan_id: id,
              question: card.question,
              answer: card.answer,
              topic: card.topic || null,
              difficulty: card.difficulty || null,
            }, { onConflict: 'user_id,source_type,source_id', ignoreDuplicates: false })
          }
        }

        // Link any unlinked cards for these documents to this plan
        await supabase
          .from('review_cards')
          .update({ plan_id: id })
          .eq('user_id', user.id)
          .in('document_id', plan.document_ids)
          .is('plan_id', null)

        // Re-fetch cards
        const { data: refreshedCards } = await supabase
          .from('review_cards')
          .select('source_type, recall_layer, next_review_at')
          .eq('user_id', user.id)
          .eq('plan_id', id)
        cards = refreshedCards

        console.log(`[PlanDetail] Auto-sync complete: ${cards?.length || 0} cards now linked`)
      } catch (syncErr) {
        console.error('[PlanDetail] Auto-sync error:', syncErr)
      }
    }

    const totalCards = cards?.length || 0
    const dueCards = cards?.filter(c => new Date(c.next_review_at) <= new Date()).length || 0
    const cardsByType: Record<string, number> = {}
    const cardsByLayer: Record<string, number> = {}
    cards?.forEach(c => {
      cardsByType[c.source_type] = (cardsByType[c.source_type] || 0) + 1
      cardsByLayer[c.recall_layer || 'ABSORB'] = (cardsByLayer[c.recall_layer || 'ABSORB'] || 0) + 1
    })

    return NextResponse.json({
      plan: {
        ...plan,
        schedule,
        currentDay,
        totalDays: schedule.length,
      },
      stats: {
        totalCards,
        dueCards,
        cardsByType,
        cardsByLayer,
      },
    })
  } catch (error) {
    console.error('[PlanDetail] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/active-recall/agent/plans/[id] — rename, toggle status, complete activity/session
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action } = body

    // Fetch the plan
    const { data: plan, error: planError } = await supabase
      .from('agent_study_plans')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (action === 'rename') {
      const { title } = body
      if (!title || typeof title !== 'string' || !title.trim()) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 })
      }
      const { error } = await supabase
        .from('agent_study_plans')
        .update({ title: title.trim(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) {
        return NextResponse.json({ error: 'Failed to rename' }, { status: 500 })
      }
      return NextResponse.json({ success: true, title: title.trim() })
    }

    if (action === 'toggle_status') {
      const newStatus = plan.status === 'active' ? 'paused' : 'active'
      const { error } = await supabase
        .from('agent_study_plans')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) {
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
      }
      return NextResponse.json({ success: true, status: newStatus })
    }

    if (action === 'complete_activity') {
      const { day, activityIndex } = body
      const schedule = typeof plan.schedule === 'string'
        ? JSON.parse(plan.schedule)
        : [...plan.schedule]

      // Find the day entry
      const dayEntry = schedule.find((d: { day: number }) => d.day === day)
      if (!dayEntry || !dayEntry.activities[activityIndex]) {
        return NextResponse.json({ error: 'Activity not found' }, { status: 400 })
      }

      const wasCompleted = !!dayEntry.activities[activityIndex].completed
      dayEntry.activities[activityIndex].completed = !wasCompleted
      dayEntry.activities[activityIndex].completionStatus = !wasCompleted ? 'completed' : 'not_started'
      dayEntry.isCompleted = dayEntry.activities.every((a: { completed?: boolean; completionStatus?: string }) =>
        a.completed || a.completionStatus === 'completed'
      )

      const completedActivities = Math.max(0, (plan.completed_activities || 0) + (wasCompleted ? -1 : 1))
      const allPlanDone = schedule.every((d: { isCompleted?: boolean }) => d.isCompleted)

      const { error } = await supabase
        .from('agent_study_plans')
        .update({
          schedule,
          completed_activities: completedActivities,
          status: allPlanDone ? 'completed' : (plan.status === 'completed' ? 'active' : plan.status),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 })
      }
      return NextResponse.json({ success: true, completedActivities, planCompleted: allPlanDone, toggled: !wasCompleted })
    }

    if (action === 'complete_session') {
      // Mark all matching activities for today as complete
      const { completedTypes } = body as { completedTypes: string[] }
      if (!completedTypes?.length) {
        return NextResponse.json({ success: true, updated: 0 })
      }

      const schedule = typeof plan.schedule === 'string'
        ? JSON.parse(plan.schedule)
        : plan.schedule.map((d: Record<string, unknown>) => ({ ...d }))

      // Calculate current day
      const planCreated = new Date(plan.created_at)
      planCreated.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const currentDay = Math.max(1, Math.floor((today.getTime() - planCreated.getTime()) / (1000 * 60 * 60 * 24)) + 1)

      const todayStr = new Date().toISOString().split('T')[0]
      const dayEntry = schedule.find((d: { date: string }) => d.date === todayStr)
        || schedule.find((d: { day: number }) => d.day === currentDay)
        || (currentDay <= schedule.length ? schedule[currentDay - 1] : null)

      if (!dayEntry) {
        return NextResponse.json({ success: true, updated: 0 })
      }

      let updated = 0
      for (const activity of dayEntry.activities) {
        if (!activity.completed && activity.completionStatus !== 'completed' && activityMatchesCompletedTypes(activity.type, completedTypes)) {
          activity.completed = true
          activity.completionStatus = 'completed'
          updated++
        }
      }

      if (updated === 0) {
        return NextResponse.json({ success: true, updated: 0 })
      }

      dayEntry.isCompleted = dayEntry.activities.every((a: { completed?: boolean; completionStatus?: string }) =>
        a.completed || a.completionStatus === 'completed'
      )
      const completedActivities = (plan.completed_activities || 0) + updated
      const allPlanDone = schedule.every((d: { isCompleted?: boolean }) => d.isCompleted)

      const { error } = await supabase
        .from('agent_study_plans')
        .update({
          schedule,
          completed_activities: completedActivities,
          status: allPlanDone ? 'completed' : plan.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return NextResponse.json({ error: 'Failed to complete session' }, { status: 500 })
      }
      return NextResponse.json({ success: true, updated, completedActivities, planCompleted: allPlanDone })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[PlanPatch] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/active-recall/agent/plans/[id] — delete plan and unlink cards
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Unlink review cards from this plan
    await supabase
      .from('review_cards')
      .update({ plan_id: null })
      .eq('plan_id', id)
      .eq('user_id', user.id)

    // Delete the plan
    const { error } = await supabase
      .from('agent_study_plans')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PlanDelete] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
