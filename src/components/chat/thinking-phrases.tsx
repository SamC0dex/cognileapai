'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Curated phrases grouped by category for contextual variety
const THINKING_PHRASES = [
  // Analysis & Processing
  'Analyzing your question...',
  'Processing your request...',
  'Understanding the context...',
  'Breaking down the problem...',
  'Connecting the dots...',

  // Knowledge & Learning (fits CogniLeap's educational focus)
  'Gathering insights...',
  'Searching through knowledge...',
  'Synthesizing information...',
  'Building a thoughtful response...',
  'Crafting your answer...',

  // Thinking & Reasoning
  'Thinking deeply...',
  'Reasoning through this...',
  'Considering all angles...',
  'Putting it all together...',
  'Almost there...',

  // Creative & Engaging
  'Exploring possibilities...',
  'Diving into the details...',
  'Working through the logic...',
  'Formulating a clear explanation...',
  'Organizing my thoughts...',
]

interface ThinkingPhrasesProps {
  /** How fast phrases rotate in ms (default: 3000) */
  interval?: number
  /** Additional className for the container */
  className?: string
}

export const ThinkingPhrases: React.FC<ThinkingPhrasesProps> = React.memo(({
  interval = 3000,
  className = ''
}) => {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_PHRASES.length)
  )
  const usedIndices = useRef<Set<number>>(new Set([currentIndex]))

  // Pick next phrase, avoiding recent repeats
  const getNextIndex = useCallback(() => {
    // Reset if we've used most phrases
    if (usedIndices.current.size >= THINKING_PHRASES.length - 2) {
      usedIndices.current.clear()
    }

    let next: number
    do {
      next = Math.floor(Math.random() * THINKING_PHRASES.length)
    } while (usedIndices.current.has(next))

    usedIndices.current.add(next)
    return next
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex(getNextIndex())
    }, interval)

    return () => clearInterval(timer)
  }, [interval, getNextIndex])

  return (
    <div className={`flex items-center gap-2.5 py-1 ${className}`}>
      {/* Bouncing dots — pure CSS keyframes for reliable animation */}
      <div className="flex items-center gap-[3px] flex-shrink-0">
        <span className="thinking-dot thinking-dot-1" />
        <span className="thinking-dot thinking-dot-2" />
        <span className="thinking-dot thinking-dot-3" />
      </div>

      {/* Rotating phrase with crossfade */}
      <div className="relative h-5 overflow-hidden min-w-[240px]">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{
              duration: 0.4,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className="absolute inset-0 flex items-center text-[13px] font-medium text-muted-foreground/80 whitespace-nowrap select-none"
          >
            {THINKING_PHRASES[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
})

ThinkingPhrases.displayName = 'ThinkingPhrases'
