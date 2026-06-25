'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { RecallLayer } from '@/types/active-recall'
import type { ReviewSession } from '@/types/active-recall'
import { AIGreetingCard } from './v2/ai-greeting-card'
import { QuickStatsRow } from './v2/quick-stats-row'
import { TodaysFocusCard } from './v2/todays-focus-card'
import { EmptyStateOnboarding } from './v2/empty-state-onboarding'
import { ActivePlanCard } from './v2/active-plan-card'

interface ActiveRecallDashboardProps {
  className?: string
  onOpenChat?: () => void
}

interface ActivePlan {
  id: string
  title: string
  status: string
  current_day: number
  total_activities: number
  completed_activities: number
}

export function ActiveRecallDashboard({ className, onOpenChat }: ActiveRecallDashboardProps) {
  const router = useRouter()
  const {
    isLoading,
    stats,
    nudgeMessage,
    fetchStats,
    fetchDueCards,
    fetchNudgeMessage,
  } = useActiveRecallStore()

  const [activePlans, setActivePlans] = useState<ActivePlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)

  const fetchActivePlans = useCallback(async () => {
    setPlansLoading(true)
    try {
      const res = await fetch('/api/active-recall/agent/plans')
      if (res.ok) {
        const data = await res.json()
        setActivePlans(data.plans || [])
      }
    } catch {
      // ignore
    } finally {
      setPlansLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchDueCards()
    fetchActivePlans()
    fetchNudgeMessage()
  }, [fetchStats, fetchDueCards, fetchActivePlans, fetchNudgeMessage])

  // Listen for agent events to auto-refresh
  const refreshAll = useCallback(() => {
    fetchActivePlans()
    fetchStats()
    fetchDueCards()
  }, [fetchActivePlans, fetchStats, fetchDueCards])

  useEffect(() => {
    const handleAgentAction = (e: Event) => {
      refreshAll()
      // For plan/tool generation, do a second refresh after a delay for DB consistency
      const detail = (e as CustomEvent).detail
      if (detail?.type === 'CREATE_PLAN' || detail?.type === 'GENERATE_TOOLS') {
        setTimeout(refreshAll, 1000)
      }
    }
    const handleToolsRefresh = () => refreshAll()
    const handleFocus = () => refreshAll()

    window.addEventListener('agent-action-completed', handleAgentAction)
    window.addEventListener('study-tools-refresh', handleToolsRefresh)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('agent-action-completed', handleAgentAction)
      window.removeEventListener('study-tools-refresh', handleToolsRefresh)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refreshAll])

  const dueToday = stats?.totalDue ?? 0

  // Daily goal from today's sessions
  const dailyGoalTarget = 20
  const dailyGoalCompleted = (() => {
    if (!stats?.recentSessions) return 0
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return stats.recentSessions
      .filter((s) => new Date(s.started_at) >= todayStart)
      .reduce((sum, s) => sum + (s.cards_reviewed || 0), 0)
  })()

  const handleStartReview = () => {
    router.push('/active-recall/review')
  }

  // Loading skeleton
  if ((isLoading || plansLoading) && activePlans.length === 0) {
    return (
      <div className={cn('space-y-4 p-6', className)}>
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-28 rounded-2xl bg-muted animate-pulse" />
      </div>
    )
  }

  // Empty state — no plans and no cards at all
  if (activePlans.length === 0 && !plansLoading && (!stats || stats.totalReviews === 0)) {
    return (
      <div className={cn('p-6', className)}>
        <EmptyStateOnboarding onOpenChat={onOpenChat} />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6 p-6 max-w-5xl', className)}>
      {/* AI Greeting + Start Review */}
      <AIGreetingCard
        nudgeMessage={nudgeMessage}
        totalDue={dueToday}
        isLoading={isLoading}
        onStartReview={handleStartReview}
      />

      {/* Today's Focus — Smart Scheduling */}
      <TodaysFocusCard totalDue={dueToday} />

      {/* Quick Stats Pills */}
      <QuickStatsRow
        dueToday={dueToday}
        streak={stats?.reviewStreak ?? 0}
        mastery={stats?.masteryPct ?? 0}
        dailyGoalCompleted={dailyGoalCompleted}
        dailyGoalTarget={dailyGoalTarget}
      />

      {/* Active Study Plans */}
      {activePlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Your Study Plans
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePlans.map((plan) => (
              <ActivePlanCard key={plan.id} plan={plan} onDeleted={fetchActivePlans} />
            ))}
          </div>
        </div>
      )}

      {/* Learning Progress + Recent Sessions side by side */}
      {stats && stats.totalCards > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Learning Progress — cards by layer */}
          <LearningProgress
            cardsByLayer={stats.cardsByLayer}
            totalCards={stats.totalCards}
            averageAccuracy={stats.averageAccuracy}
          />

          {/* Recent Sessions — meaningful detail */}
          {stats.recentSessions && stats.recentSessions.length > 0 && (
            <RecentSessionsCard sessions={stats.recentSessions} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Learning Progress: stacked layer bar + breakdown ───

function LearningProgress({
  cardsByLayer,
  totalCards,
  averageAccuracy,
}: {
  cardsByLayer: Record<RecallLayer, number>
  totalCards: number
  averageAccuracy: number
}) {
  const layers = [
    { key: RecallLayer.MASTERED, label: 'Mastered', color: 'bg-green-400', textColor: 'text-green-500' },
    { key: RecallLayer.RETRIEVE, label: 'Retrieving', color: 'bg-blue-400', textColor: 'text-blue-500' },
    { key: RecallLayer.RECOGNIZE, label: 'Recognizing', color: 'bg-yellow-400', textColor: 'text-yellow-500' },
    { key: RecallLayer.ABSORB, label: 'New', color: 'bg-gray-400', textColor: 'text-muted-foreground' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Learning Progress</h3>
        <span className="text-xs text-muted-foreground">{totalCards} cards total</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-muted/50 mb-4">
        {layers.map(({ key, color }) => {
          const count = cardsByLayer[key] || 0
          const pct = totalCards > 0 ? (count / totalCards) * 100 : 0
          if (pct === 0) return null
          return (
            <motion.div
              key={key}
              className={cn('h-full', color)}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, delay: 0.1 }}
            />
          )
        })}
      </div>

      {/* Layer breakdown */}
      <div className="grid grid-cols-2 gap-2">
        {layers.map(({ key, label, color, textColor }) => {
          const count = cardsByLayer[key] || 0
          if (count === 0) return null
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <div className={cn('h-2.5 w-2.5 rounded-full', color)} />
              <span className="text-muted-foreground">{label}</span>
              <span className={cn('font-semibold ml-auto', textColor)}>{count}</span>
            </div>
          )
        })}
      </div>

      {/* Accuracy */}
      <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Overall Accuracy</span>
        <span className={cn(
          'font-semibold',
          averageAccuracy >= 80 ? 'text-green-500' : averageAccuracy >= 50 ? 'text-yellow-500' : 'text-red-500'
        )}>
          {Math.round(averageAccuracy)}%
        </span>
      </div>
    </motion.div>
  )
}

// ─── Recent Sessions: with time, layer transitions, accuracy ───

function RecentSessionsCard({ sessions }: { sessions: ReviewSession[] }) {
  const recentSessions = sessions.slice(0, 4)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-xl border bg-card p-5"
    >
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        Recent Sessions
      </h3>
      <div className="space-y-2.5">
        {recentSessions.map((session) => {
          const accuracy = session.cards_reviewed > 0
            ? Math.round((session.cards_correct / session.cards_reviewed) * 100)
            : 0
          const timeAgo = getTimeAgo(session.started_at)
          const timeSpent = session.total_time_ms
            ? formatDuration(session.total_time_ms)
            : null

          // Count layer promotions and demotions from results
          let promoted = 0
          let demoted = 0
          if (session.results) {
            for (const r of session.results) {
              if (r.new_layer > r.previous_layer) promoted++
              else if (r.new_layer < r.previous_layer) demoted++
            }
          }

          return (
            <div
              key={session.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              {/* Accuracy indicator */}
              <div className={cn(
                'flex items-center justify-center h-9 w-9 rounded-lg text-xs font-bold shrink-0',
                accuracy >= 80 ? 'bg-green-500/10 text-green-500' :
                accuracy >= 50 ? 'bg-yellow-500/10 text-yellow-500' :
                'bg-red-500/10 text-red-500'
              )}>
                {accuracy}%
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{session.cards_reviewed} cards</span>
                  <span className="text-xs text-muted-foreground">{timeAgo}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                  {timeSpent && (
                    <span className="flex items-center gap-0.5">
                      <Timer className="h-3 w-3" />
                      {timeSpent}
                    </span>
                  )}
                  {promoted > 0 && (
                    <span className="flex items-center gap-0.5 text-green-500">
                      <ArrowUpRight className="h-3 w-3" />
                      {promoted} leveled up
                    </span>
                  )}
                  {demoted > 0 && (
                    <span className="flex items-center gap-0.5 text-red-400">
                      <ArrowDownRight className="h-3 w-3" />
                      {demoted} dropped
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

// ─── Helpers ───

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
