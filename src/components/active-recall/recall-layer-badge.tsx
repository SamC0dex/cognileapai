'use client'

import { cn } from '@/lib/utils'
import { RecallLayer, RECALL_LAYER_LABELS } from '@/types/active-recall'

interface RecallLayerBadgeProps {
  layer: RecallLayer
  size?: 'sm' | 'md'
  className?: string
}

const layerStyles: Record<RecallLayer, string> = {
  [RecallLayer.ABSORB]: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  [RecallLayer.RECOGNIZE]: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  [RecallLayer.RETRIEVE]: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  [RecallLayer.MASTERED]: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

export function RecallLayerBadge({ layer, size = 'sm', className }: RecallLayerBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        layerStyles[layer],
        className
      )}
    >
      {RECALL_LAYER_LABELS[layer]}
    </span>
  )
}
