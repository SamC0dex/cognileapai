'use client'

import { motion } from 'framer-motion'
import { FileText, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RecallLayerBadge } from '../recall-layer-badge'
import type { DocumentMastery } from '@/types/active-recall'
import { RecallLayer } from '@/types/active-recall'

interface ReadinessSectionProps {
  documents: DocumentMastery[]
  className?: string
}

export function ReadinessSection({ documents, className }: ReadinessSectionProps) {
  if (!documents.length) return null

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold flex items-center gap-2 px-1">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Your Materials
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {documents.map((doc, i) => (
          <motion.div
            key={doc.documentId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors group cursor-default"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.documentTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {doc.totalCards} cards
                </p>
              </div>
              <MasteryBadge pct={doc.masteryPct} />
            </div>

            {/* Mini layer bars */}
            <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-muted/50">
              {[RecallLayer.MASTERED, RecallLayer.RETRIEVE, RecallLayer.RECOGNIZE, RecallLayer.ABSORB].map((layer) => {
                const count = doc.cardsByLayer[layer] || 0
                const pct = doc.totalCards > 0 ? (count / doc.totalCards) * 100 : 0
                if (pct === 0) return null
                return (
                  <div
                    key={layer}
                    className={cn(
                      'h-full transition-all',
                      layer === RecallLayer.MASTERED && 'bg-green-400',
                      layer === RecallLayer.RETRIEVE && 'bg-blue-400',
                      layer === RecallLayer.RECOGNIZE && 'bg-yellow-400',
                      layer === RecallLayer.ABSORB && 'bg-gray-400',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                )
              })}
            </div>

            {/* Due info */}
            {doc.nextDueDate && (
              <p className="text-xs text-muted-foreground mt-2">
                Next review: {formatDueDate(doc.nextDueDate)}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function MasteryBadge({ pct }: { pct: number }) {
  const rounded = Math.round(pct)
  return (
    <span className={cn(
      'text-xs font-semibold px-2 py-0.5 rounded-full',
      rounded >= 80 ? 'bg-green-500/10 text-green-600' :
      rounded >= 50 ? 'bg-yellow-500/10 text-yellow-600' :
      'bg-red-500/10 text-red-600'
    )}>
      {rounded}%
    </span>
  )
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'Now'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 7) return `In ${diffDays} days`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
