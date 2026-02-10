'use client'

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Target, Clock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Lesson } from '@/lib/course-store'

interface LessonViewerProps {
  lesson: Lesson
  onContinueToQuiz: () => void
  onBackToCourse: () => void
  hasScrolledToBottom: boolean
  className?: string
}

export function LessonViewer({
  lesson,
  onContinueToQuiz,
  onBackToCourse,
  hasScrolledToBottom,
  className
}: LessonViewerProps) {
  const contentRef = React.useRef<HTMLDivElement>(null)

  // Render Mermaid diagrams after content loads
  React.useEffect(() => {
    const renderMermaidDiagrams = async () => {
      if (!contentRef.current) return

      try {
        // Dynamic import to avoid SSR issues
        const mermaid = (await import('mermaid')).default

        // Initialize Mermaid with interactive config
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#14b8a6',
            primaryTextColor: '#fff',
            primaryBorderColor: '#0d9488',
            lineColor: '#64748b',
            secondaryColor: '#8b5cf6',
            tertiaryColor: '#f59e0b',
            background: '#ffffff',
            mainBkg: '#e0f2fe',
            secondBkg: '#ddd6fe',
            fontSize: '16px',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
          securityLevel: 'loose',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis'
          }
        })

        const mermaidDivs = contentRef.current.querySelectorAll('.mermaid')

        if (mermaidDivs.length > 0) {
          for (let i = 0; i < mermaidDivs.length; i++) {
            const div = mermaidDivs[i] as HTMLElement

            if (div.getAttribute('data-processed') === 'true') continue

            const code = div.textContent || ''
            const id = `mermaid-${Date.now()}-${i}`

            try {
              const { svg } = await mermaid.render(id, code)

              div.innerHTML = `
                <div class="mermaid-container my-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg">
                  <div class="mermaid-diagram flex justify-center overflow-x-auto">
                    ${svg}
                  </div>
                  <p class="text-center text-sm text-muted-foreground mt-4">Click on diagram elements to explore</p>
                </div>
              `

              div.setAttribute('data-processed', 'true')
            } catch (renderError) {
              console.error('Mermaid rendering error:', renderError)
              div.innerHTML = `
                <div class="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <div class="flex items-center gap-3 mb-3">
                    <span class="font-semibold text-red-900 dark:text-red-100">Diagram Error</span>
                  </div>
                  <pre class="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded-lg overflow-x-auto">${code}</pre>
                </div>
              `
              div.setAttribute('data-processed', 'true')
            }
          }
        }
      } catch (error) {
        console.error('Mermaid initialization error:', error)
      }
    }

    // Delay to ensure DOM is ready
    setTimeout(renderMermaidDiagrams, 100)
  }, [lesson.contentMarkdown])

  return (
    <div className={cn("max-w-5xl mx-auto px-6 py-8", className)}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/40 mb-8 -mx-6 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToCourse}
              className="hover:bg-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  {lesson.lessonNumber}
                </span>
                <h1 className="text-2xl font-bold">{lesson.title}</h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{lesson.estimatedMinutes} min</span>
          </div>
        </div>
      </div>

      {/* Learning Objective Banner */}
      <div className="mb-12 p-6 rounded-2xl bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border border-teal-500/20">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-2 rounded-full bg-teal-500/10">
            <Target className="h-6 w-6 text-teal-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wide mb-2">
              Learning Objective
            </h2>
            <p className="text-base leading-relaxed text-foreground">
              {lesson.learningObjective}
            </p>
          </div>
        </div>
      </div>

      {/* Lesson Content */}
      <div
        ref={contentRef}
        className="prose prose-lg dark:prose-invert max-w-none"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom heading renderers
            h1: ({ node, ...props }) => (
              <h1 className="text-3xl font-bold mt-12 mb-6 text-foreground" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-2xl font-semibold mt-10 mb-5 text-foreground" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-xl font-semibold mt-8 mb-4 text-foreground" {...props} />
            ),
            
            // Custom paragraph renderer (generous spacing)
            p: ({ node, ...props }) => (
              <p className="text-lg leading-relaxed mb-6 text-foreground/90" {...props} />
            ),

            // Custom list renderers
            ul: ({ node, ...props }) => (
              <ul className="space-y-2 mb-6 ml-6" {...props} />
            ),
            ol: ({ node, ...props }) => (
              <ol className="space-y-2 mb-6 ml-6" {...props} />
            ),
            li: ({ node, ...props }) => (
              <li className="text-lg leading-relaxed" {...props} />
            ),

            // Custom blockquote renderer (callout boxes)
            blockquote: ({ node, children, ...props }) => (
              <blockquote className="border-l-4 border-purple-500 bg-purple-500/10 pl-6 pr-4 py-4 my-6 rounded-r-lg" {...props}>
                <div className="text-base font-medium text-foreground">
                  {children}
                </div>
              </blockquote>
            ),

            // Custom code block renderer
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            code: ({ inline, className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '')
              const language = match ? match[1] : ''

              // Check if it's a Mermaid diagram
              if (language === 'mermaid') {
                return (
                  <div className="mermaid my-8 flex justify-center">
                    {String(children).replace(/\n$/, '')}
                  </div>
                )
              }

              // Inline code
              if (inline) {
                return (
                  <code
                    className="px-2 py-1 rounded bg-muted text-sm font-mono text-foreground"
                    {...props}
                  >
                    {children}
                  </code>
                )
              }

              // Code block
              return (
                <pre className="p-4 rounded-lg bg-muted overflow-x-auto my-6">
                  <code className={`text-sm font-mono ${className}`} {...props}>
                    {children}
                  </code>
                </pre>
              )
            },

            // Custom table renderer
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-8">
                <table className="min-w-full border border-border rounded-lg" {...props} />
              </div>
            ),

            // Custom horizontal rule
            hr: ({ node, ...props }) => (
              <hr className="my-12 border-border" {...props} />
            ),

            // Custom strong/bold
            strong: ({ node, ...props }) => (
              <strong className="font-semibold text-foreground" {...props} />
            ),

            // Custom emphasis/italic
            em: ({ node, ...props }) => (
              <em className="italic text-foreground/90" {...props} />
            ),
          }}
        >
          {lesson.contentMarkdown}
        </ReactMarkdown>
      </div>

      {/* Continue to Quiz Button (Fixed Bottom) */}
      <div className="sticky bottom-0 left-0 right-0 mt-12 -mx-6 px-6 py-4 bg-background/95 backdrop-blur-sm border-t border-border/40">
        <div className="max-w-5xl mx-auto">
          <Button
            onClick={onContinueToQuiz}
            disabled={!hasScrolledToBottom}
            size="lg"
            className={cn(
              "w-full",
              "bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700",
              "text-white font-medium",
              "shadow-lg hover:shadow-xl",
              "transition-all duration-300",
              !hasScrolledToBottom && "opacity-50 cursor-not-allowed"
            )}
          >
            Continue to Quiz
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          {!hasScrolledToBottom && (
            <p className="text-center text-sm text-muted-foreground mt-2">
              Scroll to the bottom to continue
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
