'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Flame, Clock, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserCourseProgress, UserStreak } from '@/lib/course-store'

interface ProgressStatsCardProps {
  progress: UserCourseProgress
  streak?: UserStreak | null
  totalLessons: number
  className?: string
}

export function ProgressStatsCard({
  progress,
  streak,
  totalLessons,
  className
}: ProgressStatsCardProps) {
  const completionPercentage = progress.completionPercentage || 0
  const lessonsCompleted = progress.lessonsCompleted || 0
  const totalTimeSeconds = progress.totalTimeSeconds || 0
  const currentStreak = streak?.currentStreak || 0

  // Convert seconds to hours and minutes
  const hours = Math.floor(totalTimeSeconds / 3600)
  const minutes = Math.floor((totalTimeSeconds % 3600) / 60)
  const timeDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

  // Calculate stroke dash offset for circular progress
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (completionPercentage / 100) * circumference

  return (
    <motion.div
      className={cn(
        "relative overflow-hidden rounded-3xl",
        "bg-gradient-to-br from-teal-50/80 via-purple-50/60 to-blue-50/80",
        "dark:from-teal-950/40 dark:via-purple-950/30 dark:to-blue-950/40",
        "border border-white/40 dark:border-white/10",
        "shadow-2xl backdrop-blur-xl",
        "p-8",
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Glassmorphic overlay effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent dark:from-white/10 dark:via-white/5 dark:to-transparent pointer-events-none" />

      {/* Content */}
      <div className="relative z-10">
        {/* Circular Progress */}
        <div className="flex items-center justify-center mb-8">
          <div className="relative">
            {/* Background circle */}
            <svg className="transform -rotate-90" width="180" height="180">
              <circle
                cx="90"
                cy="90"
                r={radius}
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                className="text-gray-200 dark:text-gray-700/50"
              />
              {/* Progress circle */}
              <motion.circle
                cx="90"
                cy="90"
                r={radius}
                stroke="url(#gradient)"
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#14B8A6" />
                  <stop offset="50%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
            </svg>

            {/* Percentage text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.div
                className="text-5xl font-bold bg-gradient-to-br from-teal-600 via-purple-600 to-blue-600 dark:from-teal-400 dark:via-purple-400 dark:to-blue-400 bg-clip-text text-transparent"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
              >
                {completionPercentage}%
              </motion.div>
              <div className="text-sm text-muted-foreground font-medium">
                Complete
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* Streak */}
          <motion.div
            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/50 dark:bg-black/20 backdrop-blur-sm border border-white/60 dark:border-white/10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.05 }}
          >
            <Flame className={cn(
              "h-6 w-6 mb-2",
              currentStreak > 0 ? "text-orange-500" : "text-gray-400"
            )} />
            <div className="text-2xl font-bold text-foreground">
              {currentStreak}
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              Day Streak
            </div>
          </motion.div>

          {/* Study Time */}
          <motion.div
            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/50 dark:bg-black/20 backdrop-blur-sm border border-white/60 dark:border-white/10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.05 }}
          >
            <Clock className="h-6 w-6 mb-2 text-blue-500" />
            <div className="text-2xl font-bold text-foreground">
              {timeDisplay}
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              Study Time
            </div>
          </motion.div>

          {/* Lessons Completed */}
          <motion.div
            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/50 dark:bg-black/20 backdrop-blur-sm border border-white/60 dark:border-white/10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.05 }}
          >
            <CheckCircle2 className="h-6 w-6 mb-2 text-green-500" />
            <div className="text-2xl font-bold text-foreground">
              {lessonsCompleted}/{totalLessons}
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              Lessons
            </div>
          </motion.div>
        </div>

        {/* Motivational message */}
        <motion.div
          className="mt-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p className="text-sm text-muted-foreground">
            {completionPercentage === 0 && "Start your learning journey!"}
            {completionPercentage > 0 && completionPercentage < 25 && "Great start! Keep going!"}
            {completionPercentage >= 25 && completionPercentage < 50 && "You're making progress!"}
            {completionPercentage >= 50 && completionPercentage < 75 && "Halfway there! You're doing amazing!"}
            {completionPercentage >= 75 && completionPercentage < 100 && "Almost done! You got this!"}
            {completionPercentage === 100 && "🎉 Congratulations! Course completed!"}
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}
