'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui'
import { X, Network, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MindMapOptions } from '@/types/mindmap'

interface MindMapCustomizationDialogProps {
  isOpen: boolean
  onClose: () => void
  onGenerate: (options: MindMapOptions) => void
  isGenerating?: boolean
}

const depthOptions = [
  { value: 2 as const, label: '2 Levels', description: 'Quick overview' },
  { value: 3 as const, label: '3 Levels', description: 'Balanced depth' },
  { value: 4 as const, label: '4 Levels', description: 'Comprehensive' },
]

const detailOptions = [
  { value: 'keywords' as const, label: 'Keywords Only', description: 'Minimal, scannable' },
  { value: 'brief' as const, label: 'Brief Phrases', description: 'Concise and clear' },
  { value: 'detailed' as const, label: 'Detailed', description: 'Rich explanations' },
]

const layoutOptions = [
  { value: 'radial' as const, label: 'Radial', description: 'Circular spread' },
  { value: 'tree' as const, label: 'Tree', description: 'Top-down hierarchy' },
  { value: 'organic' as const, label: 'Organic', description: 'Natural flow' },
]

export const MindMapCustomizationDialog: React.FC<MindMapCustomizationDialogProps> = ({
  isOpen,
  onClose,
  onGenerate,
  isGenerating = false,
}) => {
  const [depth, setDepth] = React.useState<2 | 3 | 4>(3)
  const [detailLevel, setDetailLevel] = React.useState<'keywords' | 'brief' | 'detailed'>('brief')
  const [visualStyle, setVisualStyle] = React.useState<'radial' | 'tree' | 'organic'>('radial')
  const [focusArea, setFocusArea] = React.useState('')
  const [customInstructions, setCustomInstructions] = React.useState('')

  // Reset on open
  React.useEffect(() => {
    if (isOpen) {
      setDepth(3)
      setDetailLevel('brief')
      setVisualStyle('radial')
      setFocusArea('')
      setCustomInstructions('')
    }
  }, [isOpen])

  const handleGenerate = () => {
    onGenerate({
      depth,
      detailLevel,
      visualStyle,
      focusArea: focusArea.trim() || undefined,
      customInstructions: customInstructions.trim() || undefined,
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="w-full max-w-md bg-background rounded-2xl shadow-2xl border border-border overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-teal-50 to-transparent dark:from-teal-900/20">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="p-2 rounded-xl bg-teal-100 dark:bg-teal-900/30"
                >
                  <Network className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </motion.div>
                <div>
                  <h2 className="font-semibold text-base">Mind Map Generator</h2>
                  <p className="text-xs text-muted-foreground">Customize your mind map</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                disabled={isGenerating}
                className="w-8 h-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Depth */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Depth
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {depthOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDepth(opt.value)}
                      disabled={isGenerating}
                      className={cn(
                        'p-2.5 rounded-lg border text-center transition-all',
                        depth === opt.value
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 ring-1 ring-teal-500/30'
                          : 'border-border hover:border-teal-300 hover:bg-teal-50/50 dark:hover:bg-teal-900/10'
                      )}
                    >
                      <div className={cn(
                        'text-sm font-semibold',
                        depth === opt.value ? 'text-teal-700 dark:text-teal-300' : 'text-foreground'
                      )}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail Level */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Detail Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {detailOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDetailLevel(opt.value)}
                      disabled={isGenerating}
                      className={cn(
                        'p-2.5 rounded-lg border text-center transition-all',
                        detailLevel === opt.value
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 ring-1 ring-teal-500/30'
                          : 'border-border hover:border-teal-300 hover:bg-teal-50/50 dark:hover:bg-teal-900/10'
                      )}
                    >
                      <div className={cn(
                        'text-sm font-semibold',
                        detailLevel === opt.value ? 'text-teal-700 dark:text-teal-300' : 'text-foreground'
                      )}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Layout Style */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Layout Style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {layoutOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setVisualStyle(opt.value)}
                      disabled={isGenerating}
                      className={cn(
                        'p-2.5 rounded-lg border text-center transition-all',
                        visualStyle === opt.value
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 ring-1 ring-teal-500/30'
                          : 'border-border hover:border-teal-300 hover:bg-teal-50/50 dark:hover:bg-teal-900/10'
                      )}
                    >
                      <div className={cn(
                        'text-sm font-semibold',
                        visualStyle === opt.value ? 'text-teal-700 dark:text-teal-300' : 'text-foreground'
                      )}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Focus Area */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Focus Area <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={focusArea}
                  onChange={(e) => setFocusArea(e.target.value)}
                  disabled={isGenerating}
                  placeholder="Enter a specific topic, chapter, or concept"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Custom Instructions <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value.slice(0, 500))}
                  disabled={isGenerating}
                  placeholder="Any specific instructions for the AI..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 placeholder:text-muted-foreground/50 resize-none"
                />
                <div className="text-right text-[10px] text-muted-foreground mt-1">
                  {customInstructions.length}/500
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border bg-muted/30">
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white shadow-lg shadow-teal-500/20"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Mind Map
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
