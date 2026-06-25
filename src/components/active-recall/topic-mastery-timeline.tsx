'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { TopicMasteryTimeline as TopicMasteryData } from '@/types/active-recall'
import { RECALL_LAYER_LABELS } from '@/types/active-recall'

interface TopicMasteryTimelineProps {
  timelines: TopicMasteryData[]
  className?: string
}

const LAYER_COLORS = [
  { bg: 'bg-gray-400', text: 'text-gray-500', fill: '#9ca3af' },     // layer 0 fallback
  { bg: 'bg-gray-400', text: 'text-gray-500', fill: '#9ca3af' },     // ABSORB
  { bg: 'bg-yellow-400', text: 'text-yellow-600', fill: '#facc15' },  // RECOGNIZE
  { bg: 'bg-blue-400', text: 'text-blue-600', fill: '#60a5fa' },     // RETRIEVE
  { bg: 'bg-green-400', text: 'text-green-600', fill: '#4ade80' },   // MASTERED
]

export function TopicMasteryTimeline({ timelines, className }: TopicMasteryTimelineProps) {
  if (timelines.length === 0) return null

  // Show at most 8 topics
  const displayed = timelines.slice(0, 8)
  const maxReviews = Math.max(...displayed.map((t) => t.reviewsRemaining), 1)

  return (
    <div className={cn('space-y-3', className)}>
      {displayed.map((topic, idx) => {
        const layer = Math.min(Math.max(topic.currentLayer, 1), 4)
        const layerPct = (layer / 4) * 100
        const color = LAYER_COLORS[layer]
        const masteryDate = new Date(topic.estimatedMasteryDate)
        const daysLeft = Math.max(0, Math.round((masteryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        const layerLabel = RECALL_LAYER_LABELS[layer as keyof typeof RECALL_LAYER_LABELS] || 'Unknown'

        return (
          <motion.div
            key={topic.topic}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="group"
          >
            {/* Topic header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', color.bg)} />
                <span className="text-sm font-medium truncate">{topic.topic}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                <span className={cn('font-medium', color.text)}>{layerLabel}</span>
                {layer < 4 && (
                  <span>~{daysLeft}d to mastery</span>
                )}
                {layer >= 4 && (
                  <span className="text-green-600 font-medium">Mastered</span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative h-3 rounded-full bg-muted/60 overflow-hidden">
              {/* Layer markers */}
              {[1, 2, 3].map((l) => (
                <div
                  key={l}
                  className="absolute top-0 bottom-0 w-px bg-border/50"
                  style={{ left: `${(l / 4) * 100}%` }}
                />
              ))}

              {/* Current progress */}
              <motion.div
                className={cn('h-full rounded-full', color.bg)}
                initial={{ width: 0 }}
                animate={{ width: `${layerPct}%` }}
                transition={{ duration: 0.8, delay: idx * 0.1, ease: 'easeOut' }}
              />
            </div>

            {/* Details row */}
            <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
              <span>{topic.currentAccuracy}% accuracy</span>
              {topic.reviewsRemaining > 0 && (
                <span>{topic.reviewsRemaining} reviews left</span>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
