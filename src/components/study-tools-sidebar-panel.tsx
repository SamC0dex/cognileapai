'use client'

import * as React from 'react'
import { lazy, Suspense, useState, useCallback, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, BookOpen, PenTool, Zap, X, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui'
import { FlashcardsStackIcon } from '@/components/icons/flashcards-stack-icon'
import { ErrorBoundary } from '@/components/error-management'
import { translateError } from '@/lib/errors/translator'
import { ActionableErrorPanel } from '@/components/error-management/actionable-error-panel'
import { useDocuments } from '@/contexts/documents-context'

// Lazy load the heavy study tools panel
const StudyToolsPanel = lazy(async () => {
  const mod = await import('./study-tools/study-tools-panel')
  return { default: mod.StudyToolsPanel }
})

const panelSpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 40,
  mass: 0.8
}

const PANEL_WIDTH_KEY = 'cognileap-study-tools-panel-width'
const DEFAULT_PANEL_WIDTH = 500
const MIN_PANEL_WIDTH = 360
const MAX_PANEL_WIDTH = 900

function loadPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_PANEL_WIDTH
  try {
    const stored = window.localStorage.getItem(PANEL_WIDTH_KEY)
    if (stored) {
      const val = parseInt(stored, 10)
      if (val >= MIN_PANEL_WIDTH && val <= MAX_PANEL_WIDTH) return val
    }
  } catch { /* ignore */ }
  return DEFAULT_PANEL_WIDTH
}

// Skeleton for lazy loading
function StudyToolsSkeleton() {
  return (
    <div className="h-full flex flex-col p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        {[
          { icon: BookOpen, color: 'text-blue-500' },
          { icon: FlashcardsStackIcon, color: 'text-teal-500' },
          { icon: PenTool, color: 'text-purple-500' },
          { icon: Zap, color: 'text-amber-500' }
        ].map((item, index) => (
          <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <item.icon className={`w-4 h-4 ${item.color}`} />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              <div className="h-2 w-32 bg-muted rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Error fallback
const ErrorFallback: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => {
  const translated = React.useMemo(() => translateError(error, {
    source: 'study-tools',
    operation: 'render',
    rawMessage: error.message,
    payload: { component: 'StudyToolsSidebarPanel' }
  }), [error])

  return (
    <div className="p-4">
      <ActionableErrorPanel error={translated.userError} onAction={() => retry()} />
    </div>
  )
}

interface StudyToolsSidebarPanelProps {
  isOpen: boolean
  onClose: () => void
  sidebarCollapsed?: boolean
  onWidthChange?: (width: number) => void
  onResizing?: (active: boolean) => void
  extraLeftOffset?: number
}

export const StudyToolsSidebarPanel = React.forwardRef<HTMLDivElement, StudyToolsSidebarPanelProps>(function StudyToolsSidebarPanel({ isOpen, onClose, sidebarCollapsed = true, onWidthChange, onResizing, extraLeftOffset = 0 }, forwardedRef) {
  const { selectedDocuments, primaryDocument } = useDocuments()
  const pathname = usePathname()

  // Extract conversationId from URL path like /chat/[conversationId]
  const conversationId = React.useMemo(() => {
    if (!pathname) return undefined
    const match = pathname.match(/^\/chat\/([^/]+)/)
    return match ? match[1] : undefined
  }, [pathname])

  const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth())
  const [isActivelyResizing, setIsActivelyResizing] = useState(false)
  const [justFinishedResizing, setJustFinishedResizing] = useState(false)
  const currentWidth = useRef(panelWidth)
  const panelRef = useRef<HTMLDivElement>(null)

  // Merge forwarded ref with local ref
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [forwardedRef])

  if (!isActivelyResizing) currentWidth.current = panelWidth

  // Notify parent of width changes
  useEffect(() => {
    if (isOpen) onWidthChange?.(panelWidth)
  }, [panelWidth, isOpen, onWidthChange])

  useEffect(() => {
    if (!isOpen) onWidthChange?.(0)
  }, [isOpen, onWidthChange])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startW = currentWidth.current
    let rafId = 0

    setIsActivelyResizing(true)
    onResizing?.(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize;'
    document.body.appendChild(overlay)

    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const delta = ev.clientX - startX
        const w = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startW + delta))
        currentWidth.current = w

        // Direct DOM writes for zero-lag resizing
        if (panelRef.current) {
          panelRef.current.style.width = `${w}px`
        }
        onWidthChange?.(w)
      })
    }

    const onUp = () => {
      cancelAnimationFrame(rafId)
      overlay.remove()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)

      const finalWidth = currentWidth.current
      setPanelWidth(finalWidth)
      setIsActivelyResizing(false)
      setJustFinishedResizing(true)
      requestAnimationFrame(() => {
        setJustFinishedResizing(false)
      })
      onResizing?.(false)
      onWidthChange?.(finalWidth)
      try { window.localStorage.setItem(PANEL_WIDTH_KEY, String(finalWidth)) } catch { /* ignore */ }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onWidthChange, onResizing])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[300] md:hidden"
          />

          {/* Panel */}
          <motion.div
            ref={setRefs}
            initial={{ width: 0, opacity: 0 }}
            animate={{
              width: panelWidth,
              opacity: 1
            }}
            exit={{ width: 0, opacity: 0 }}
            transition={(isActivelyResizing || justFinishedResizing) ? { duration: 0 } : panelSpring}
            className="fixed top-0 h-full bg-background border-r border-border shadow-2xl z-[400] flex flex-col overflow-hidden"
            style={{
              transformOrigin: 'left center',
              left: (sidebarCollapsed ? 64 : 256) + extraLeftOffset,
              transition: 'left 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)'
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-brand-teal-50 to-transparent dark:from-brand-teal-900/20">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand-teal-600" />
                <h2 className="text-lg font-semibold bg-gradient-to-r from-brand-teal-700 to-brand-teal-500 bg-clip-text text-transparent">Study Tools</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-muted">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Study Tools Content - embedded mode */}
            <div className="flex-1 overflow-hidden">
              <ErrorBoundary fallback={ErrorFallback}>
                <Suspense fallback={<StudyToolsSkeleton />}>
                  <StudyToolsPanel
                    documentId={primaryDocument?.id}
                    conversationId={conversationId}
                    selectedDocuments={selectedDocuments}
                    primaryDocument={primaryDocument}
                    hasMessages={false}
                    embedded={true}
                    onClose={onClose}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>

            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 -right-[3px] w-[7px] h-full cursor-col-resize z-50 group/resize"
            >
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover/resize:bg-primary/50 group-active/resize:bg-primary transition-colors duration-200" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[6px] h-8 rounded-full bg-muted-foreground/20 group-hover/resize:bg-primary/50 group-active/resize:bg-primary/70 transition-all duration-200 flex items-center justify-center opacity-0 group-hover/resize:opacity-100">
                <GripVertical className="h-3 w-3 text-muted-foreground/60 group-hover/resize:text-primary-foreground/80" />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
})
