'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Clock,
  Target,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Activity,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { RecallLayer, RECALL_LAYER_LABELS } from '@/types/active-recall'
import type { DocumentMastery, ReviewSession, PredictiveAnalytics } from '@/types/active-recall'
import { ForgettingCurveChart } from '@/components/active-recall/forgetting-curve-chart'
import { RetentionForecastChart } from '@/components/active-recall/retention-forecast-chart'
import { TopicMasteryTimeline } from '@/components/active-recall/topic-mastery-timeline'
import { StuckCardsAlert } from '@/components/active-recall/stuck-cards-alert'
import { WeeklyReportCard } from '@/components/active-recall/weekly-report-card'
import { generateCurvePoints } from '@/lib/forgetting-curve'

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899']

type Period = '7d' | '30d' | '90d'

export default function InsightsPage() {
  const { stats, masteryByDocument, fetchStats } = useActiveRecallStore()
  const [period, setPeriod] = useState<Period>('30d')
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [predictive, setPredictive] = useState<PredictiveAnalytics | null>(null)
  const [predictiveLoading, setPredictiveLoading] = useState(true)

  const fetchPredictive = useCallback(async () => {
    setPredictiveLoading(true)
    try {
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
      const res = await fetch(`/api/active-recall/predictive-analytics?period=${days}`)
      if (res.ok) {
        const data: PredictiveAnalytics = await res.json()
        setPredictive(data)
      }
    } catch { /* ignore */ }
    setPredictiveLoading(false)
  }, [period])

  useEffect(() => {
    fetchStats(period)
    fetchPredictive()
  }, [fetchStats, fetchPredictive, period])

  if (!stats) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (stats.totalCards === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-2">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <h2 className="text-lg font-semibold">No data yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Start reviewing cards to see your learning insights here.
          </p>
        </div>
      </div>
    )
  }

  // Build forgetting curve data
  const chartCurves = masteryByDocument.slice(0, 5).map((doc, idx) => {
    const avgInterval = doc.masteredCards > 0 ? 14 : doc.reviewingCards > 0 ? 5 : 1
    const now = new Date()
    const lastReview = doc.nextDueDate ? new Date(doc.nextDueDate) : now
    return {
      label: doc.documentTitle,
      color: CHART_COLORS[idx % CHART_COLORS.length],
      points: generateCurvePoints(lastReview, avgInterval, 2.5, 30),
      currentRetention: doc.currentRetention,
    }
  })

  // Topic strength data from cards
  const topicMap = new Map<string, { mastered: number; total: number; correct: number; reviews: number }>()
  // We approximate from masteryByDocument since we don't have per-topic from the store
  // This will be enhanced when we add the dedicated insights API

  const toggleSession = (id: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Learning Insights</h2>
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill icon={Target} label="Accuracy" value={`${Math.round(stats.averageAccuracy)}%`} color="text-green-500" />
        <StatPill icon={Brain} label="Total Reviews" value={stats.totalReviews.toLocaleString()} color="text-blue-500" />
        <StatPill icon={TrendingUp} label="Mastery" value={`${Math.round(stats.masteryPct)}%`} color="text-purple-500" />
        <StatPill icon={BarChart3} label="Cards" value={stats.totalCards.toString()} color="text-orange-500" />
        {predictive && (
          <StatPill
            icon={Activity}
            label="Velocity"
            value={`${predictive.learningVelocity.cardsPerDay}/day`}
            color={
              predictive.learningVelocity.trend === 'improving' ? 'text-green-500' :
              predictive.learningVelocity.trend === 'declining' ? 'text-red-500' :
              'text-muted-foreground'
            }
            suffix={
              predictive.learningVelocity.trend === 'improving' ? <TrendingUp className="h-3 w-3 text-green-500" /> :
              predictive.learningVelocity.trend === 'declining' ? <TrendingDown className="h-3 w-3 text-red-500" /> :
              <Minus className="h-3 w-3 text-muted-foreground" />
            }
          />
        )}
      </div>

      {/* Predictive: Retention Forecast */}
      {predictive && predictive.retentionForecast.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border bg-card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              Retention Forecast
            </h3>
            {predictiveLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Predicted average memory retention across all cards over the next {period === '7d' ? '7' : period === '90d' ? '90' : '30'} days
          </p>
          <div className="overflow-x-auto">
            <RetentionForecastChart data={predictive.retentionForecast} />
          </div>
        </motion.div>
      )}

      {/* Predictive: Topic Mastery Timelines */}
      {predictive && predictive.topicMasteryTimelines.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border bg-card p-5"
        >
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Brain className="h-4 w-4 text-blue-500" />
            Topic Mastery Timeline
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Estimated time to reach mastery for each topic based on your learning pace
          </p>
          <TopicMasteryTimeline timelines={predictive.topicMasteryTimelines} />
        </motion.div>
      )}

      {/* Predictive: Stuck Cards */}
      {predictive && predictive.stuckCards.length > 0 && (
        <StuckCardsAlert cards={predictive.stuckCards} />
      )}

      {/* Forgetting Curves */}
      {chartCurves.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Memory Retention Forecast
          </h3>
          <div className="overflow-x-auto">
            <ForgettingCurveChart
              curves={chartCurves}
              width={700}
              height={300}
            />
          </div>
        </div>
      )}

      {/* Topic Strength Map */}
      {masteryByDocument.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Material Strength
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {masteryByDocument.map((doc) => {
              const strength = doc.masteryPct
              return (
                <motion.div
                  key={doc.documentId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    'relative rounded-lg p-3 border overflow-hidden',
                    'hover:border-primary/30 transition-colors cursor-default'
                  )}
                >
                  {/* Strength fill background */}
                  <div
                    className={cn(
                      'absolute inset-0 opacity-10',
                      strength >= 80 ? 'bg-green-500' :
                      strength >= 50 ? 'bg-yellow-500' :
                      'bg-red-500'
                    )}
                    style={{ width: `${Math.min(strength, 100)}%` }}
                  />
                  <div className="relative">
                    <p className="text-xs font-medium truncate" title={doc.documentTitle}>
                      {doc.documentTitle}
                    </p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={cn(
                        'text-lg font-bold',
                        strength >= 80 ? 'text-green-500' :
                        strength >= 50 ? 'text-yellow-500' :
                        'text-red-500'
                      )}>
                        {Math.round(strength)}%
                      </span>
                      <span className="text-xs text-muted-foreground">{doc.totalCards} cards</span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* Learning Progress by Layer */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Card Distribution
        </h3>
        <div className="space-y-3">
          {([RecallLayer.MASTERED, RecallLayer.RETRIEVE, RecallLayer.RECOGNIZE, RecallLayer.ABSORB] as RecallLayer[]).map(
            (layer) => {
              const count = stats.cardsByLayer[layer] || 0
              const pct = stats.totalCards > 0 ? (count / stats.totalCards) * 100 : 0
              return (
                <div key={layer} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-20 text-right text-muted-foreground">
                    {RECALL_LAYER_LABELS[layer]}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className={cn(
                        'h-full rounded-full',
                        layer === RecallLayer.MASTERED && 'bg-green-400',
                        layer === RecallLayer.RETRIEVE && 'bg-blue-400',
                        layer === RecallLayer.RECOGNIZE && 'bg-yellow-400',
                        layer === RecallLayer.ABSORB && 'bg-gray-400',
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.05 * layer }}
                    />
                  </div>
                  <span className="text-sm font-medium w-12 text-right">{count}</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {Math.round(pct)}%
                  </span>
                </div>
              )
            }
          )}
        </div>
      </div>

      {/* Session History */}
      {stats.recentSessions.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Session History
          </h3>
          <div className="space-y-2">
            {stats.recentSessions.map((session) => {
              const accuracy = session.cards_reviewed > 0
                ? Math.round((session.cards_correct / session.cards_reviewed) * 100)
                : 0
              const isExpanded = expandedSessions.has(session.id)
              const date = new Date(session.started_at)
              const duration = session.total_time_ms
                ? formatDuration(session.total_time_ms)
                : null

              return (
                <div key={session.id} className="rounded-lg border overflow-hidden">
                  <button
                    onClick={() => toggleSession(session.id)}
                    className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex items-center justify-center h-8 w-8 rounded-lg',
                        accuracy >= 80 ? 'bg-green-500/10' : accuracy >= 50 ? 'bg-yellow-500/10' : 'bg-red-500/10'
                      )}>
                        {accuracy >= 80 ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {session.cards_reviewed} cards reviewed
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {' at '}
                          {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {duration && ` · ${duration}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'text-sm font-semibold',
                        accuracy >= 80 ? 'text-green-500' : accuracy >= 50 ? 'text-yellow-500' : 'text-red-500'
                      )}>
                        {accuracy}%
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Expanded per-card detail */}
                  {isExpanded && session.results && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="border-t bg-muted/30 px-4 py-3 overflow-hidden"
                    >
                      <div className="grid grid-cols-3 gap-3 text-center text-xs mb-3">
                        <div>
                          <p className="text-muted-foreground">Correct</p>
                          <p className="font-semibold text-green-500">{session.cards_correct}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Incorrect</p>
                          <p className="font-semibold text-red-500">{session.cards_incorrect}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total</p>
                          <p className="font-semibold">{session.cards_reviewed}</p>
                        </div>
                      </div>
                      {session.results.length > 0 && (
                        <div className="space-y-1.5">
                          {session.results.slice(0, 10).map((r, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className={cn(
                                'w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold',
                                r.rating >= 3 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                              )}>
                                {r.rating}
                              </span>
                              <span className="text-muted-foreground truncate flex-1">
                                Card #{idx + 1}
                              </span>
                              <span className="text-muted-foreground">
                                {r.response_time_ms ? `${(r.response_time_ms / 1000).toFixed(1)}s` : '-'}
                              </span>
                            </div>
                          ))}
                          {session.results.length > 10 && (
                            <p className="text-xs text-muted-foreground text-center pt-1">
                              +{session.results.length - 10} more
                            </p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Weekly Report */}
      <WeeklyReportCard />
    </div>
  )
}

function StatPill({
  icon: Icon,
  label,
  value,
  color,
  suffix,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  color: string
  suffix?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <Icon className={cn('h-5 w-5', color)} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1.5">
          <p className="text-lg font-semibold leading-tight">{value}</p>
          {suffix}
        </div>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}
