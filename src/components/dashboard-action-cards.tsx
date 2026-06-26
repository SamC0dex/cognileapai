'use client'

import * as React from 'react'
import { BookOpen, PenTool, Zap, HelpCircle, Network, Brain, ArrowRight } from 'lucide-react'
import { FlashcardsStackIcon } from '@/components/icons/flashcards-stack-icon'
import { useStudyToolsStore, type StudyToolType } from '@/lib/study-tools-store'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

const TOOLS = [
  {
    type: 'study-guide' as StudyToolType,
    label: 'Study Guide',
    description: 'Structured overview',
    icon: BookOpen,
    iconBg: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    type: 'flashcards' as StudyToolType,
    label: 'Flashcards',
    description: 'Q&A for memorization',
    icon: null,
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    type: 'quiz' as StudyToolType,
    label: 'Quiz',
    description: 'Test your knowledge',
    icon: HelpCircle,
    iconBg: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    type: 'mind-map' as StudyToolType,
    label: 'Mind Map',
    description: 'Visual connections',
    icon: Network,
    iconBg: 'bg-pink-50 dark:bg-pink-900/20',
    iconColor: 'text-pink-600 dark:text-pink-400',
  },
  {
    type: 'smart-notes' as StudyToolType,
    label: 'Smart Notes',
    description: 'Organized highlights',
    icon: PenTool,
    iconBg: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    type: 'smart-summary' as StudyToolType,
    label: 'Summary',
    description: 'Key insights fast',
    icon: Zap,
    iconBg: 'bg-rose-50 dark:bg-rose-900/20',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
]

export function DashboardActionCards() {
  const router = useRouter()
  const { expandPanel, setHighlightedTool } = useStudyToolsStore()
  const { totalDue, stats, fetchDueCards, fetchStats } = useActiveRecallStore()

  React.useEffect(() => {
    void fetchDueCards()
    void fetchStats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToolClick = (toolType: StudyToolType) => {
    setHighlightedTool(toolType)
    expandPanel()
    router.push('/chat')
  }

  return (
    <div className="px-8 pb-6 space-y-6">
      {/* Tool grid */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
          Generate
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {TOOLS.map((tool) => {
            const IconComp = tool.icon
            return (
              <button
                key={tool.type}
                onClick={() => handleToolClick(tool.type)}
                className="group flex flex-col items-center gap-2.5 px-3 py-4 rounded-xl border border-border bg-card hover:border-primary/25 hover:shadow-sm hover:bg-muted/30 transition-all duration-150 cursor-pointer"
              >
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', tool.iconBg)}>
                  {IconComp ? (
                    <IconComp className={cn('w-[18px] h-[18px]', tool.iconColor)} />
                  ) : (
                    <FlashcardsStackIcon size={18} className={tool.iconColor} />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-medium text-foreground leading-tight">{tool.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">
                    {tool.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Recall banner — only shown when cards are due */}
      {totalDue > 0 && (
        <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-800/40 flex items-center justify-center flex-shrink-0">
              <Brain className="w-[18px] h-[18px] text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                {totalDue} card{totalDue !== 1 ? 's' : ''} due for review
              </p>
              <p className="text-xs text-violet-600/80 dark:text-violet-400/80 mt-0.5">
                {(stats?.currentStreak ?? 0) > 0
                  ? `${stats!.currentStreak}-day streak · ${stats?.totalCards ?? 0} total cards`
                  : `${stats?.totalCards ?? 0} total cards · keep the momentum going`}
              </p>
            </div>
          </div>
          <Button
            onClick={() => router.push('/active-recall/review')}
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white h-8 px-3 text-xs gap-1.5 flex-shrink-0"
          >
            Start review
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
