'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocumentMastery } from '@/types/active-recall'
import { RecallLayer } from '@/types/active-recall'
import { RecallLayerBadge } from './recall-layer-badge'
import { ForgettingCurveChart } from './forgetting-curve-chart'
import { generateCurvePoints, predictRetention } from '@/lib/forgetting-curve'

interface MasteryOverviewProps {
  masteryByDocument: DocumentMastery[]
  className?: string
}

const CHART_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#ef4444', // red
  '#10b981', // emerald
  '#ec4899', // pink
]

export function MasteryOverview({ masteryByDocument, className }: MasteryOverviewProps) {
  const [showChart, setShowChart] = React.useState(false)

  if (masteryByDocument.length === 0) return null

  // Build forgetting curve data for chart
  const chartCurves = masteryByDocument.slice(0, 5).map((doc, idx) => {
    // Approximate curve using document-level stats
    const avgEaseFactor = 2.5 // default
    const avgInterval = doc.masteredCards > 0 ? 14 : doc.reviewingCards > 0 ? 5 : 1
    const now = new Date()
    const lastReview = doc.nextDueDate ? new Date(doc.nextDueDate) : now

    return {
      label: doc.documentTitle,
      color: CHART_COLORS[idx % CHART_COLORS.length],
      points: generateCurvePoints(lastReview, avgInterval, avgEaseFactor, 30),
      currentRetention: doc.currentRetention,
    }
  })

  return (
    <div className={cn('space-y-4', className)}>
      {/* Document mastery cards */}
      <div className="space-y-3">
        {masteryByDocument.map((doc) => (
          <DocumentMasteryCard key={doc.documentId} doc={doc} />
        ))}
      </div>

      {/* Forgetting Curve Toggle */}
      <button
        onClick={() => setShowChart(!showChart)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2"
      >
        {showChart ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {showChart ? 'Hide' : 'Show'} Forgetting Curve
      </button>

      {/* Forgetting Curve Chart */}
      {showChart && chartCurves.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-xl border bg-card p-4 overflow-hidden"
        >
          <h4 className="text-sm font-semibold mb-3">Memory Retention Forecast</h4>
          <ForgettingCurveChart
            curves={chartCurves}
            width={560}
            height={280}
          />
        </motion.div>
      )}
    </div>
  )
}

function DocumentMasteryCard({ doc }: { doc: DocumentMastery }) {
  const totalLayers = doc.totalCards

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium truncate">{doc.documentTitle}</span>
        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
          {doc.totalCards} cards
        </span>
      </div>

      {/* Stacked progress bar */}
      <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
        {doc.masteredCards > 0 && (
          <motion.div
            className="h-full bg-green-400"
            initial={{ width: 0 }}
            animate={{ width: `${(doc.masteredCards / totalLayers) * 100}%` }}
            transition={{ duration: 0.8 }}
          />
        )}
        {doc.reviewingCards > 0 && (
          <motion.div
            className="h-full bg-blue-400"
            initial={{ width: 0 }}
            animate={{ width: `${(doc.reviewingCards / totalLayers) * 100}%` }}
            transition={{ duration: 0.8, delay: 0.1 }}
          />
        )}
        {doc.learningCards > 0 && (
          <motion.div
            className="h-full bg-yellow-400"
            initial={{ width: 0 }}
            animate={{ width: `${(doc.learningCards / totalLayers) * 100}%` }}
            transition={{ duration: 0.8, delay: 0.2 }}
          />
        )}
        {doc.newCards > 0 && (
          <motion.div
            className="h-full bg-gray-300 dark:bg-gray-600"
            initial={{ width: 0 }}
            animate={{ width: `${(doc.newCards / totalLayers) * 100}%` }}
            transition={{ duration: 0.8, delay: 0.3 }}
          />
        )}
      </div>

      {/* Layer breakdown */}
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        {doc.masteredCards > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            {doc.masteredCards} mastered
          </span>
        )}
        {doc.reviewingCards > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            {doc.reviewingCards} reviewing
          </span>
        )}
        {doc.learningCards > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            {doc.learningCards} learning
          </span>
        )}
        {doc.newCards > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
            {doc.newCards} new
          </span>
        )}
      </div>

      {/* Retention indicator */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted-foreground">
          Retention: {Math.round(doc.currentRetention * 100)}%
        </span>
        <span className="text-xs text-muted-foreground">
          Mastery: {Math.round(doc.masteryPct)}%
        </span>
      </div>
    </div>
  )
}
