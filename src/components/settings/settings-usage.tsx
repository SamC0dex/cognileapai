'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui'
import {
  Loader2,
  TrendingUp,
  Coins,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  Activity,
  Layers,
  MessageSquare,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PROVIDERS } from '@/lib/model-registry'
import { motion } from 'framer-motion'

interface UsageData {
  totals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    requests: number
  }
  byProvider: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    requests: number
  }>
  byModel: Record<string, {
    provider: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    requests: number
  }>
  byDay: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    requests: number
  }>
  bySource: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cost: number
    requests: number
  }>
  days: number
}

type TimeRange = '7' | '30' | '90'

export function SettingsUsage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('30')

  const fetchUsage = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/usage?days=${timeRange}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Failed to load usage data
      </div>
    )
  }

  const isEmpty = data.totals.requests === 0

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Usage Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Track your AI token usage and costs
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {(['7', '30', '90'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                timeRange === range
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="py-16">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No usage data yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Start chatting or generating study tools to see your usage analytics here
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              icon={Zap}
              label="Total Tokens"
              value={formatNumber(data.totals.totalTokens)}
              sublabel={`${formatNumber(data.totals.requests)} requests`}
              color="text-blue-500"
              bgColor="bg-blue-500/10"
            />
            <SummaryCard
              icon={Coins}
              label="Total Cost"
              value={formatCost(data.totals.cost)}
              sublabel={`~${formatCost(data.totals.cost / Math.max(data.totals.requests, 1))}/req`}
              color="text-emerald-500"
              bgColor="bg-emerald-500/10"
            />
            <SummaryCard
              icon={ArrowUpRight}
              label="Input Tokens"
              value={formatNumber(data.totals.inputTokens)}
              sublabel={`${Math.round((data.totals.inputTokens / Math.max(data.totals.totalTokens, 1)) * 100)}% of total`}
              color="text-violet-500"
              bgColor="bg-violet-500/10"
            />
            <SummaryCard
              icon={ArrowDownLeft}
              label="Output Tokens"
              value={formatNumber(data.totals.outputTokens)}
              sublabel={`${Math.round((data.totals.outputTokens / Math.max(data.totals.totalTokens, 1)) * 100)}% of total`}
              color="text-amber-500"
              bgColor="bg-amber-500/10"
            />
          </div>

          {/* Activity Chart */}
          <DailyActivityChart data={data.byDay} days={parseInt(timeRange)} />

          {/* Source Breakdown */}
          {Object.keys(data.bySource).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  By Source
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(data.bySource).map(([source, stats]) => (
                    <div
                      key={source}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/20"
                    >
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center',
                        source === 'chat' ? 'bg-blue-500/10' : 'bg-purple-500/10'
                      )}>
                        {source === 'chat'
                          ? <MessageSquare className="h-4 w-4 text-blue-500" />
                          : <BookOpen className="h-4 w-4 text-purple-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium capitalize">{source === 'study-tool' ? 'Study Tools' : 'Chat'}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatNumber(stats.totalTokens)} tokens &middot; {formatCost(stats.cost)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium">{stats.requests}</div>
                        <div className="text-[10px] text-muted-foreground">requests</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Provider Breakdown */}
          {Object.keys(data.byProvider).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  By Provider
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(data.byProvider)
                  .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
                  .map(([provider, stats]) => {
                    const providerInfo = PROVIDERS[provider as keyof typeof PROVIDERS]
                    const pct = Math.round((stats.totalTokens / data.totals.totalTokens) * 100)
                    return (
                      <div key={provider} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: providerInfo?.color || '#888' }}
                            />
                            <span className="text-sm font-medium">
                              {providerInfo?.name || provider}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {stats.requests} req
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatNumber(stats.totalTokens)} tokens</span>
                            <span className="font-medium text-foreground">{formatCost(stats.cost)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: providerInfo?.color || '#888' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
          )}

          {/* Model Breakdown */}
          {Object.keys(data.byModel).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  By Model
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {Object.entries(data.byModel)
                    .sort(([, a], [, b]) => b.cost - a.cost)
                    .map(([model, stats]) => {
                      const providerInfo = PROVIDERS[stats.provider as keyof typeof PROVIDERS]
                      return (
                        <div
                          key={model}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <div
                            className="w-1.5 h-8 rounded-full shrink-0"
                            style={{ backgroundColor: providerInfo?.color || '#888' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{model}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {stats.requests} req
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1">
                                <ArrowUpRight className="h-3 w-3 text-violet-400" />
                                {formatNumber(stats.inputTokens)}
                              </span>
                              <span className="flex items-center gap-1">
                                <ArrowDownLeft className="h-3 w-3 text-amber-400" />
                                {formatNumber(stats.outputTokens)}
                              </span>
                              <span>{formatNumber(stats.totalTokens)} total</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-foreground">{formatCost(stats.cost)}</div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
  bgColor,
}: {
  icon: typeof Zap
  label: string
  value: string
  sublabel: string
  color: string
  bgColor: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', bgColor)}>
              <Icon className={cn('h-3.5 w-3.5', color)} />
            </div>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
          <div className="text-xl font-bold text-foreground tracking-tight">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

const CHART_HEIGHT = 128 // px — matches h-32

function DailyActivityChart({
  data,
  days,
}: {
  data: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; cost: number; requests: number }>
  days: number
}) {
  // Build array of all days in range
  const dayEntries: { date: string; label: string; input: number; output: number; total: number; cost: number; requests: number }[] = []
  const now = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const entry = data[dateStr]
    dayEntries.push({
      date: dateStr,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      input: entry?.inputTokens || 0,
      output: entry?.outputTokens || 0,
      total: (entry?.inputTokens || 0) + (entry?.outputTokens || 0),
      cost: entry?.cost || 0,
      requests: entry?.requests || 0,
    })
  }

  const maxTokens = Math.max(...dayEntries.map(d => d.total), 1)
  const hasData = dayEntries.some(d => d.total > 0)

  if (!hasData) return null

  // For readability, show fewer bars on larger ranges
  const showEvery = days > 30 ? 3 : days > 14 ? 2 : 1
  const visibleEntries = dayEntries.filter((_, i) => i % showEvery === 0 || i === dayEntries.length - 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Daily Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-[3px]" style={{ height: CHART_HEIGHT }}>
          {visibleEntries.map((day, i) => {
            // Calculate pixel heights directly
            const inputPx = maxTokens > 0 ? (day.input / maxTokens) * CHART_HEIGHT : 0
            const outputPx = maxTokens > 0 ? (day.output / maxTokens) * CHART_HEIGHT : 0
            const totalPx = inputPx + outputPx
            const minPx = day.total > 0 ? Math.max(totalPx, 3) : 0

            return (
              <div
                key={day.date}
                className="flex-1 relative group"
                style={{ height: CHART_HEIGHT }}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
                  <div className="bg-popover border border-border rounded-lg shadow-lg p-2.5 text-xs whitespace-nowrap">
                    <div className="font-medium text-foreground mb-1">{day.label}</div>
                    <div className="space-y-0.5 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-violet-500" />
                        Input: {formatNumber(day.input)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        Output: {formatNumber(day.output)}
                      </div>
                      <div className="border-t border-border pt-0.5 mt-0.5 font-medium text-foreground">
                        {formatCost(day.cost)} &middot; {day.requests} req
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stacked bar — positioned at bottom */}
                <div className="absolute bottom-0 left-0 right-0 flex flex-col justify-end overflow-hidden rounded-t-sm">
                  <motion.div
                    className="w-full bg-violet-500/70 rounded-t-sm"
                    initial={{ height: 0 }}
                    animate={{ height: minPx > 0 ? (inputPx / totalPx) * minPx : 0 }}
                    transition={{ duration: 0.5, delay: i * 0.03 }}
                  />
                  <motion.div
                    className="w-full bg-amber-500/70"
                    initial={{ height: 0 }}
                    animate={{ height: minPx > 0 ? (outputPx / totalPx) * minPx : 0 }}
                    transition={{ duration: 0.5, delay: i * 0.03 + 0.1 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        {/* X-axis labels */}
        <div className="flex items-center gap-[3px] mt-1.5">
          {visibleEntries.map((day, i) => (
            <div key={day.date} className="flex-1 text-center">
              {(i === 0 || i === visibleEntries.length - 1 || i === Math.floor(visibleEntries.length / 2))
                ? <span className="text-[9px] text-muted-foreground">{day.label}</span>
                : null
              }
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-violet-500/70" />
            Input tokens
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500/70" />
            Output tokens
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  if (cost < 1) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}
