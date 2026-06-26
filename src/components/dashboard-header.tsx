'use client'

import * as React from 'react'
import { useUser } from '@/hooks/use-user'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { Flame, Brain } from 'lucide-react'

export function DashboardHeader() {
  const { profile, user, loading } = useUser()
  const { totalDue, stats } = useActiveRecallStore()

  const fullName = profile?.full_name?.trim()
  const displayName = fullName?.split(/\s+/)[0] || user?.email?.split('@')[0] || 'there'

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="px-8 pt-7 pb-5 flex items-start justify-between gap-4 flex-wrap">
      <div>
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-7 w-52 bg-muted rounded-md" />
            <div className="h-4 w-36 bg-muted rounded-md" />
          </div>
        ) : (
          <>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground leading-tight">
              Hey {displayName}, let&apos;s get studying
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{today}</p>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        {(stats?.currentStreak ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
              {stats!.currentStreak}
            </span>
            <span className="text-xs text-orange-500/80 dark:text-orange-400/70">day streak</span>
          </div>
        )}
        {totalDue > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
            <Brain className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
              {totalDue}
            </span>
            <span className="text-xs text-violet-500/80 dark:text-violet-400/70">cards due</span>
          </div>
        )}
      </div>
    </div>
  )
}
