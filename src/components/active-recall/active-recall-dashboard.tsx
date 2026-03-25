'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Brain, BarChart3, BookOpen, Flame, Target, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { RecallLayer } from '@/types/active-recall'
import { DueCardNudge } from './due-card-nudge'
import { ReviewSession } from './review-session'
import { RecallLayerBadge } from './recall-layer-badge'
import { MasteryOverview } from './mastery-overview'
import { WeeklyReportCard } from './weekly-report-card'
import { NotificationPreferencesPanel } from './notification-preferences-panel'
import { ExamDatePicker } from './exam-date-picker'

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
    currentSession,
    fetchDueCards,
    fetchStats,
    fetchNudgeMessage,
    startSession,
  } = useActiveRecallStore()

  const [showReview, setShowReview] = React.useState(false)

  // Fetch data on mount
  React.useEffect(() => {
    fetchDueCards()
    fetchStats()
    fetchNudgeMessage()
  }, [fetchDueCards, fetchStats, fetchNudgeMessage])

  const handleStartReview = async () => {
    await startSession()
    setShowReview(true)
  }

  const handleCloseReview = () => {
    setShowReview(false)
    // Refresh data after session
    fetchDueCards()
    fetchStats()
  }

  if (isLoading && !stats && !dueCards.length) {
    return (
      <div className={cn('space-y-4 p-4', className)}>
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Review Session Overlay */}
      {showReview && currentSession && (
        <ReviewSession onClose={handleCloseReview} />
      )}

      <div className={cn('space-y-6 p-4', className)}>
        {/* Hero Nudge Card */}
        <DueCardNudge
          totalDue={totalDue}
          streak={stats?.reviewStreak || 0}
          nudgeMessage={nudgeMessage}
          onStartReview={handleStartReview}
        />

        {/* Quick Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Target className="w-5 h-5 text-green-500" />}
              label="Mastery"
              value={`${Math.round(stats.masteryPct)}%`}
            />
            <StatCard
              icon={<BarChart3 className="w-5 h-5 text-blue-500" />}
              label="Total Cards"
              value={stats.totalCards.toString()}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-purple-500" />}
              label="Avg Accuracy"
              value={`${Math.round(stats.averageAccuracy)}%`}
            />
            <StatCard
              icon={<Flame className="w-5 h-5 text-orange-500" />}
              label="Longest Streak"
              value={`${stats.longestStreak}d`}
            />
          </div>
        )}

        {/* Cards by Layer */}
        {stats && stats.totalCards > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Learning Progress
            </h3>
            <div className="space-y-3">
              {([RecallLayer.ABSORB, RecallLayer.RECOGNIZE, RecallLayer.RETRIEVE, RecallLayer.MASTERED] as RecallLayer[]).map(
                (layer) => {
                  const count = stats.cardsByLayer[layer] || 0
                  const pct = stats.totalCards > 0 ? (count / stats.totalCards) * 100 : 0

                  return (
                    <div key={layer} className="flex items-center gap-3">
                      <RecallLayerBadge layer={layer} size="sm" className="w-24 justify-center" />
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className={cn(
                            'h-full rounded-full',
                            layer === RecallLayer.ABSORB && 'bg-gray-400',
                            layer === RecallLayer.RECOGNIZE && 'bg-yellow-400',
                            layer === RecallLayer.RETRIEVE && 'bg-blue-400',
                            layer === RecallLayer.MASTERED && 'bg-green-400'
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.1 * layer }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-10 text-right">
                        {count}
                      </span>
                    </div>
                  )
                }
              )}
            </div>
          </div>
        )}

        {/* Document Mastery + Forgetting Curve */}
        {masteryByDocument.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Document Mastery
            </h3>
            <MasteryOverview masteryByDocument={masteryByDocument} />
          </div>
        )}

        {/* Weekly Report + Notification Settings */}
        {stats && stats.totalCards > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WeeklyReportCard />
            <NotificationPreferencesPanel />
          </div>
        )}

        {/* Exam Dates */}
        <ExamDatePicker />

        {/* Empty State */}
        {(!stats || stats.totalCards === 0) && !isLoading && (
          <div className="rounded-xl border bg-card p-8 text-center">
            <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold mb-2">No cards yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Generate flashcards or quizzes from your study materials. They&apos;ll automatically
              appear here for spaced repetition review.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

// Small stat card component
function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}
