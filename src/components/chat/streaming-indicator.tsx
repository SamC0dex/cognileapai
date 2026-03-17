'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThinkingPhrases } from './thinking-phrases'
import { GeminiLogo } from '@/components/icons/gemini-logo'
import type { StreamingIndicatorProps } from './types'

export const StreamingIndicator: React.FC<StreamingIndicatorProps> = React.memo(({
  isVisible,
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex justify-start mb-4"
        >
          <div className="flex items-start gap-3 max-w-[85%]">
            {/* AI Avatar */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-muted to-muted/80 border border-border/50 flex items-center justify-center">
              <GeminiLogo size={18} />
            </div>

            {/* Thinking Bubble */}
            <div className="bg-muted rounded-2xl rounded-bl-sm border border-border px-4 py-3 min-w-[220px]">
              <ThinkingPhrases />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})

StreamingIndicator.displayName = 'StreamingIndicator'
