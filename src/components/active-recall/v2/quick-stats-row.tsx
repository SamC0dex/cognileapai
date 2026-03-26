'use client'

import { motion } from 'framer-motion'
import { Target, Flame, Zap, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickStatsRowProps {
  dueToday: number
  streak: number
  mastery: number
  dailyGoalCompleted: number
  dailyGoalTarget: number
  className?: string
}

export function QuickStatsRow({
  dueToday,
  streak,
  mastery,
  dailyGoalCompleted,
  dailyGoalTarget,
  className,
}: QuickStatsRowProps) {
  const pills = [
    {
      icon: Clock,
      label: 'Due Today',
      value: dueToday.toString(),
      color: dueToday > 0 ? 'text-orange-500' : 'text-green-500',
      bg: dueToday > 0 ? 'bg-orange-500/10' : 'bg-green-500/10',
    },
    {
      icon: Flame,
      label: 'Streak',
      value: `${streak}d`,
      color: streak > 0 ? 'text-orange-500' : 'text-muted-foreground',
      bg: streak > 0 ? 'bg-orange-500/10' : 'bg-muted',
    },
    {
      icon: Target,
      label: 'Mastery',
      value: `${Math.round(mastery)}%`,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      icon: Zap,
      label: 'Daily Goal',
      value: `${dailyGoalCompleted}/${dailyGoalTarget}`,
      color: dailyGoalCompleted >= dailyGoalTarget ? 'text-green-500' : 'text-blue-500',
      bg: dailyGoalCompleted >= dailyGoalTarget ? 'bg-green-500/10' : 'bg-blue-500/10',
    },
  ]

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-3', className)}>
      {pills.map((pill, i) => {
        const Icon = pill.icon
        return (
          <motion.div
            key={pill.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3 border',
              'bg-card'
            )}
          >
            <div className={cn('flex items-center justify-center h-9 w-9 rounded-lg', pill.bg)}>
              <Icon className={cn('h-4.5 w-4.5', pill.color)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{pill.label}</p>
              <p className="text-lg font-semibold leading-tight">{pill.value}</p>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
