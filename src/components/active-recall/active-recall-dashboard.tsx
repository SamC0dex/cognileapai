'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { AIGreetingCard } from './v2/ai-greeting-card'
import { QuickStatsRow } from './v2/quick-stats-row'
import { ReadinessSection } from './v2/readiness-card'
import { DailyGoalRing } from './v2/daily-goal-ring'
import { RecentActivity } from './v2/recent-activity'
import { EmptyStateOnboarding } from './v2/empty-state-onboarding'

interface ActiveRecallDashboardProps {
  className?: string
}

export function ActiveRecallDashboard({ className }: ActiveRecallDashboardProps) {
  const {
    dueCards,
    totalDue,
    isLoading,
    stats,
    masteryByDocument,
    nudgeMessage,
    fetchDueCards,
    fetchStats,
    fetchNudgeMessage,
  } = useActiveRecallStore()

  React.useEffect(() => {
    fetchDueCards()
    fetchStats()
    fetchNudgeMessage()
  }, [fetchDueCards, fetchStats, fetchNudgeMessage])

  const handleStartReview = () => {
    window.location.href = '/active-recall/review'
  }

  // Loading skeleton
  if (isLoading && !stats && !dueCards.length) {
    return (
      <div className={cn('space-y-4 p-6', className)}>
        <div className="h-28 rounded-2xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if ((!stats || stats.totalCards === 0) && !isLoading) {
    return (
      <div className={cn('p-6', className)}>
        <EmptyStateOnboarding />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6 p-6 max-w-5xl', className)}>
      {/* AI Greeting + Start Review CTA */}
      <AIGreetingCard
        nudgeMessage={nudgeMessage}
        totalDue={totalDue}
        isLoading={isLoading}
        onStartReview={handleStartReview}
      />

      {/* Quick Stats */}
      {stats && (
        <QuickStatsRow
          dueToday={totalDue}
          streak={stats.reviewStreak}
          mastery={stats.masteryPct}
          dailyGoalCompleted={stats.totalReviews}
          dailyGoalTarget={20}
        />
      )}

      {/* Daily Goal + Recent Activity row */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-5">
            <DailyGoalRing
              completed={Math.min(stats.totalReviews, 20)}
              target={20}
            />
          </div>
          <RecentActivity sessions={stats.recentSessions || []} />
        </div>
      )}

      {/* Document Readiness */}
      <ReadinessSection documents={masteryByDocument} />
    </div>
  )
}
