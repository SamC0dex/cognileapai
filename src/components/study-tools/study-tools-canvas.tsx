'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui'
import { useStudyToolsStore, STUDY_TOOLS, type StudyToolContent, normalizeStudyToolMarkdown } from '@/lib/study-tools-store'
import { FlashcardViewer } from './flashcard-viewer'
import {
  X,
  Copy,
  Download,
  FileText,
  Check,
  Calendar,
  Sparkles,
  BookOpen,
  PenTool,
  Zap,
  ExternalLink,
  Maximize2,
  Minimize2,
  HelpCircle,
  Network
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FlashcardEntry } from '@/types/flashcards'

// Enhanced canvas animation variants with proper width
const canvasVariants = {
  hidden: {
    width: 0,
    opacity: 0,
    x: 20
  },
  visible: {
    width: '40%',
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 40,
      mass: 0.5,
      duration: 0.3
    }
  },
  exit: {
    width: 0,
    opacity: 0,
    x: 20,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 45,
      mass: 0.4,
      duration: 0.25
    }
  }
}

const headerVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.05,
      duration: 0.2,
      ease: 'easeOut'
    }
  }
}

const contentVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delay: 0.1,
      duration: 0.2,
      ease: 'easeOut'
    }
  }
}

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  'study-guide': BookOpen,
  'flashcards': Sparkles,
  'smart-notes': PenTool,
  'smart-summary': Zap,
  'quiz': HelpCircle,
  'mind-map': Network
}

interface CanvasHeaderProps {
  content: StudyToolContent
  onClose: () => void
  onCopy: () => void
  onDownloadPDF: () => void
  onDownloadDOCX: () => void
  onToggleFullscreen: () => void
  isFullscreen: boolean
  isCopied: boolean
}

const CanvasHeader: React.FC<CanvasHeaderProps> = ({
  content,
  onClose,
  onCopy,
  onDownloadPDF,
  onDownloadDOCX,
  onToggleFullscreen,
  isFullscreen,
  isCopied
}) => {
  const tool = STUDY_TOOLS[content.type]
  const IconComponent = iconMap[content.type]
  const [showExportMenu, setShowExportMenu] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      variants={headerVariants}
      initial="hidden"
      animate="visible"
      className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-background/95 to-background/90 backdrop-blur-md sticky top-0 z-10 shadow-sm"
    >
      {/* Title and metadata */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <motion.div
          className={cn(
            "p-2 rounded-xl shadow-sm",
            tool.color,
            tool.borderColor,
            "border-2"
          )}
          whileHover={!prefersReducedMotion ? { scale: 1.05, rotate: 1 } : undefined}
          transition={{ duration: 0.2 }}
        >
          <IconComponent className={cn("w-6 h-6", tool.textColor)} />
        </motion.div>
        <div className="flex-1 min-w-0">
          <motion.h1
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="font-semibold text-lg truncate bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent"
          >
            {content.title}
          </motion.h1>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-4 text-sm text-muted-foreground"
          >
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {content.createdAt.toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Sparkles className="w-3 h-3" />
              </motion.div>
              {tool.name}
            </span>
          </motion.div>
        </div>
      </div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-2"
      >
        {/* Copy button - Icon only */}
        <motion.div
          whileHover={!prefersReducedMotion ? { scale: 1.05 } : undefined}
          whileTap={!prefersReducedMotion ? { scale: 0.95 } : undefined}
        >
          <Button
            variant="outline"
            size="icon"
            onClick={onCopy}
            className={cn(
              "w-9 h-9 transition-all duration-200",
              isCopied && "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
            )}
            title={isCopied ? "Copied!" : "Copy to clipboard"}
          >
            <AnimatePresence mode="wait">
              {isCopied ? (
                <motion.div
                  key="copied"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                >
                  <Check className="w-4 h-4" />
                </motion.div>
              ) : (
                <motion.div
                  key="copy"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                >
                  <Copy className="w-4 h-4" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>

        {/* Fullscreen toggle - Icon only */}
        <motion.div
          whileHover={!prefersReducedMotion ? { scale: 1.05 } : undefined}
          whileTap={!prefersReducedMotion ? { scale: 0.95 } : undefined}
        >
          <Button
            variant="outline"
            size="icon"
            onClick={onToggleFullscreen}
            className="w-9 h-9"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
        </motion.div>

        {/* Export menu - Icon only */}
        <div className="relative">
          <motion.div
            whileHover={!prefersReducedMotion ? { scale: 1.05 } : undefined}
            whileTap={!prefersReducedMotion ? { scale: 0.95 } : undefined}
          >
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="w-9 h-9"
              title="Export options"
            >
              <Download className="w-4 h-4" />
            </Button>
          </motion.div>

          <AnimatePresence>
            {showExportMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-xl shadow-xl z-[500] overflow-hidden"
                onMouseEnter={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
              >
                <div className="p-1">
                  <motion.button
                    whileHover={{ backgroundColor: 'hsl(var(--accent))' }}
                    onClick={() => {
                      onDownloadPDF()
                      setShowExportMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
                  >
                    <FileText className="w-4 h-4 text-red-500" />
                    Download as PDF
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </motion.button>
                  <motion.button
                    whileHover={{ backgroundColor: 'hsl(var(--accent))' }}
                    onClick={() => {
                      onDownloadDOCX()
                      setShowExportMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-500" />
                    Download as DOCX
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Close button */}
        <motion.div
          whileHover={!prefersReducedMotion ? { scale: 1.05, rotate: 90 } : undefined}
          whileTap={!prefersReducedMotion ? { scale: 0.95 } : undefined}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

interface ContentRendererProps {
  content: StudyToolContent
  isFullscreen: boolean
}

const ContentRenderer: React.FC<ContentRendererProps> = ({ content, isFullscreen }) => {

  const renderedMarkdown = useMemo(() => normalizeStudyToolMarkdown(content.content), [content.content])

  // Handle flashcards specifically
  if (content.type === 'flashcards') {
    try {
      console.log('[FlashcardViewer] Raw flashcard content:', content.content.substring(0, 200) + '...')

      let parsedContent: FlashcardEntry[] = []

      // Try to parse as JSON directly first (for database-stored content)
      try {
        parsedContent = JSON.parse(content.content)
        console.log('[FlashcardViewer] Parsed as direct JSON:', parsedContent.length, 'cards')
      } catch {
        // If direct parse fails, try cleaning markdown code block markers
        const cleanedContent = content.content
          .trim()
          .replace(/^```json\n?/, '')
          .replace(/\n?```$/, '')
          .trim()

        console.log('[FlashcardViewer] Cleaned content:', cleanedContent.substring(0, 200) + '...')
        parsedContent = JSON.parse(cleanedContent)
        console.log('[FlashcardViewer] Parsed after cleaning:', parsedContent.length, 'cards')
      }

      if (Array.isArray(parsedContent) && parsedContent.length > 0) {
        return (
          <div className={cn(
            "flex flex-col h-full",
            isFullscreen && "fixed inset-0 z-50 bg-muted/30"
          )}>
            {/* Flashcard-specific toolbar */}
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-4 border-b border-border bg-muted/30 backdrop-blur-sm sticky top-0 z-10"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-muted-foreground">
                  Interactive Flashcards • {parsedContent.length} cards
                </span>
              </div>

              {/* Fullscreen status indicator */}
              <div className="flex items-center gap-2 text-muted-foreground">
                {isFullscreen ? (
                  <><Minimize2 className="w-4 h-4" /> Fullscreen Mode</>
                ) : (
                  <><Maximize2 className="w-4 h-4" /> Standard View</>
                )}
              </div>
            </motion.div>

            {/* Flashcard viewer */}
            <div className="flex-1 overflow-hidden">
              <FlashcardViewer
                flashcards={parsedContent}
                title={content.title}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => {}} // Disabled - controlled by canvas header
                className="h-full"
              />
            </div>
          </div>
        )
      }
    } catch (error) {
      console.error('Failed to parse flashcard content:', error)
      // Fall back to showing error message instead of raw JSON
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="text-red-500 mb-4">
            <FileText className="w-12 h-12 mx-auto mb-2" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Invalid Flashcard Format</h3>
          <p className="text-muted-foreground mb-4">
            The flashcard data appears to be corrupted. Please try generating new flashcards.
          </p>
        </div>
      )
    }
  }

  // Type definitions for markdown components
  interface MarkdownComponentProps {
    children?: React.ReactNode
  }

  interface CodeComponentProps extends MarkdownComponentProps {
    inline?: boolean
  }

  const markdownComponents = {
    // Enhanced heading styles with better typography
    h1: ({ children }: MarkdownComponentProps) => (
      <h1 className="text-2xl font-bold text-foreground border-b border-border pb-2 mb-4 mt-8 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }: MarkdownComponentProps) => (
      <h2 className="text-xl font-semibold text-foreground mb-3 mt-6 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }: MarkdownComponentProps) => (
      <h3 className="text-lg font-semibold text-foreground mb-2 mt-4">
        {children}
      </h3>
    ),
    h4: ({ children }: MarkdownComponentProps) => (
      <h4 className="text-base font-semibold text-foreground mb-2 mt-3">
        {children}
      </h4>
    ),
    // Enhanced list styles
    ul: ({ children }: MarkdownComponentProps) => (
      <ul className="list-disc list-inside space-y-1 mb-4 text-foreground">
        {children}
      </ul>
    ),
    ol: ({ children }: MarkdownComponentProps) => (
      <ol className="list-decimal list-inside space-y-1 mb-4 text-foreground">
        {children}
      </ol>
    ),
    // Enhanced paragraph spacing
    p: ({ children }: MarkdownComponentProps) => (
      <p className="mb-4 text-foreground leading-relaxed last:mb-0">
        {children}
      </p>
    ),
    // Enhanced blockquote styling
    blockquote: ({ children }: MarkdownComponentProps) => (
      <blockquote className="border-l-4 border-blue-500 pl-4 italic bg-muted/30 py-2 mb-4 text-muted-foreground">
        {children}
      </blockquote>
    ),
    // Code block styling
    pre: ({ children }: MarkdownComponentProps) => (
      <pre className="bg-muted/80 p-4 rounded-lg overflow-x-auto mb-4 text-sm border border-border text-foreground">
        {children}
      </pre>
    ),
    // Inline code styling
    code: ({ children, inline }: CodeComponentProps) => {
      if (inline) {
        return (
          <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">
            {children}
          </code>
        )
      }
      return <code className="font-mono text-sm">{children}</code>
    },
    // Enhanced table styling
    table: ({ children }: MarkdownComponentProps) => (
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full border-collapse border border-border">
          {children}
        </table>
      </div>
    ),
    th: ({ children }: MarkdownComponentProps) => (
      <th className="border border-border bg-muted/50 px-4 py-2 text-left font-semibold text-foreground">
        {children}
      </th>
    ),
    td: ({ children }: MarkdownComponentProps) => (
      <td className="border border-border px-4 py-2">
        {children}
      </td>
    ),
    // Strong and emphasis
    strong: ({ children }: MarkdownComponentProps) => (
      <strong className="font-semibold text-foreground">
        {children}
      </strong>
    ),
    em: ({ children }: MarkdownComponentProps) => (
      <em className="italic text-muted-foreground">
        {children}
      </em>
    )
  }

  const renderTypeSpecificHeader = () => {
    const headers = {
      'flashcards': {
        text: '📚 Interactive flashcards - Click to reveal answers',
        bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
        text_color: 'text-blue-700 dark:text-blue-300'
      },
      'smart-notes': {
        text: '📝 Organized notes with highlights and key insights',
        bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
        text_color: 'text-purple-700 dark:text-purple-300'
      },
      'smart-summary': {
        text: '⚡ Concise overview with essential takeaways',
        bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        text_color: 'text-amber-700 dark:text-amber-300'
      },
      'study-guide': {
        text: '📖 Comprehensive study guide with structured learning path',
        bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
        text_color: 'text-green-700 dark:text-green-300'
      }
    }

    const header = headers[content.type as keyof typeof headers]
    if (!header) return null

    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "p-4 rounded-lg border mb-6 backdrop-blur-sm",
          header.bg
        )}
      >
        <p className={cn("text-sm font-medium m-0", header.text_color)}>
          {header.text}
        </p>
      </motion.div>
    )
  }


  return (
    <div className="flex flex-col h-full">
      {/* Enhanced toolbar */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex items-center gap-3 border-b border-border bg-muted/30 backdrop-blur-sm sticky top-0 z-10",
          isFullscreen ? "px-8 py-4" : "p-4"
        )}
      >
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-muted-foreground">
            {content.type === 'flashcards' ? 'Interactive Content' : 'Study Material'}
          </span>
        </div>
        {isFullscreen && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Maximize2 className="w-3 h-3" />
            Fullscreen Reading Mode
          </div>
        )}
      </motion.div>

      {/* Content area with enhanced scrolling */}
      <div className="flex-1 overflow-y-auto">
        <div className={cn(
          "max-w-none pb-12",
          isFullscreen
            ? "px-12 py-8 mx-auto max-w-4xl" // Centered, paper-like layout for fullscreen
            : "p-6" // Standard padding for normal view
        )}>
          {renderTypeSpecificHeader()}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className={cn(
              "study-tools-prose prose prose-base max-w-none dark:prose-invert prose-headings:scroll-m-4",
              isFullscreen && [
                "bg-muted/50 rounded-lg border border-border/50 shadow-lg",
                "px-8 py-6 backdrop-blur-sm",
                "prose-lg" // Larger text for fullscreen reading
              ]
            )}
            style={{
              '--tw-prose-body': 'hsl(var(--foreground))',
              '--tw-prose-headings': 'hsl(var(--foreground))',
              '--tw-prose-lead': 'hsl(var(--muted-foreground))',
              '--tw-prose-links': 'hsl(var(--primary))',
              '--tw-prose-bold': 'hsl(var(--foreground))',
              '--tw-prose-counters': 'hsl(var(--muted-foreground))',
              '--tw-prose-bullets': 'hsl(var(--muted-foreground))',
              '--tw-prose-hr': 'hsl(var(--border))',
              '--tw-prose-quotes': 'hsl(var(--muted-foreground))',
              '--tw-prose-quote-borders': 'hsl(var(--border))',
              '--tw-prose-captions': 'hsl(var(--muted-foreground))',
              '--tw-prose-code': 'hsl(var(--foreground))',
              '--tw-prose-pre-code': 'hsl(var(--foreground))',
              '--tw-prose-pre-bg': 'hsl(var(--muted))',
              '--tw-prose-th-borders': 'hsl(var(--border))',
              '--tw-prose-td-borders': 'hsl(var(--border))',
              '--tw-prose-thead': 'hsl(var(--foreground))',
              '--tw-prose-tbody': 'hsl(var(--foreground))'
            } as React.CSSProperties}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {renderedMarkdown}
            </ReactMarkdown>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export const StudyToolsCanvas: React.FC = React.memo(() => {
  const {
    isCanvasOpen,
    isCanvasFullscreen,
    canvasContent,
    closeCanvas,
    toggleCanvasFullscreen,
    copyToClipboard,
    downloadAsPDF,
    downloadAsDOCX,
  } = useStudyToolsStore()

  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!canvasContent) return

    const success = await copyToClipboard(canvasContent.content)
    if (success) {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }
  }, [canvasContent, copyToClipboard])

  const handleDownloadPDF = useCallback(async () => {
    if (!canvasContent) return

    try {
      await downloadAsPDF(canvasContent)
    } catch (error) {
      console.error('PDF download failed:', error)
      // TODO: Show error toast
    }
  }, [canvasContent, downloadAsPDF])

  const handleDownloadDOCX = useCallback(async () => {
    if (!canvasContent) return

    try {
      await downloadAsDOCX(canvasContent)
    } catch (error) {
      console.error('DOCX download failed:', error)
      // TODO: Show error toast
    }
  }, [canvasContent, downloadAsDOCX])

  const handleToggleFullscreen = useCallback(() => {
    toggleCanvasFullscreen()
  }, [toggleCanvasFullscreen])

  return (
    <AnimatePresence mode="wait">
      {isCanvasOpen && canvasContent && (
        <motion.div
          key="canvas"
          variants={canvasVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            "h-full bg-background/95 backdrop-blur-sm border-l border-border flex flex-col",
            isCanvasFullscreen
              ? "shadow-2xl border-2 border-primary/20 bg-card"
              : "shadow-xl"
          )}
        >
          <CanvasHeader
            content={canvasContent}
            onClose={closeCanvas}
            onCopy={handleCopy}
            onDownloadPDF={handleDownloadPDF}
            onDownloadDOCX={handleDownloadDOCX}
            onToggleFullscreen={handleToggleFullscreen}
            isFullscreen={isCanvasFullscreen}
            isCopied={isCopied}
          />
          <motion.div
            variants={contentVariants}
            initial="hidden"
            animate="visible"
            className="flex-1 overflow-hidden"
          >
            <ContentRenderer content={canvasContent} isFullscreen={isCanvasFullscreen} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})

StudyToolsCanvas.displayName = 'StudyToolsCanvas'