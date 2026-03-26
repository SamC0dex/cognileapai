'use client'

import { motion } from 'framer-motion'
import { Clock, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReviewSession } from '@/types/active-recall'

interface RecentActivityProps {
  sessions: ReviewSession[]
  className?: string
}

export function RecentActivity({ sessions, className }: RecentActivityProps) {
  if (!sessions.length) return null

  const recentSessions = sessions.slice(0, 3)

  return (
    <div className={cn('rounded-xl border bg-card p-5', className)}>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        Recent Sessions
      </h3>
      <div className="space-y-2">
        {recentSessions.map((session, i) => {
          const accuracy = session.cards_reviewed > 0
            ? Math.round((session.cards_correct / session.cards_reviewed) * 100)
            : 0
          const timeAgo = getTimeAgo(session.started_at)

          return (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
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
                  <p className="text-xs text-muted-foreground">{timeAgo}</p>
                </div>
              </div>
              <span className={cn(
                'text-sm font-semibold',
                accuracy >= 80 ? 'text-green-500' : accuracy >= 50 ? 'text-yellow-500' : 'text-red-500'
              )}>
                {accuracy}%
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
