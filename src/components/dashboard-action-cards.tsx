'use client'

import * as React from 'react'
import { BookOpen, PenTool, Zap, GraduationCap } from 'lucide-react'
import { ActionCard, Badge } from '@/components/ui'
import { FlashcardsStackIcon } from '@/components/icons/flashcards-stack-icon'
import { useStudyToolsStore, type StudyToolType } from '@/lib/study-tools-store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface DashboardActionCardsProps {
  className?: string
}

type CardItem = {
  title: string
  description: string
  icon: React.ReactNode
  variant: 'default' | 'purple' | 'teal'
  onClick?: () => void
  href?: string
  badge?: React.ReactNode
}

export function DashboardActionCards({}: DashboardActionCardsProps) {
  const router = useRouter()
  const { expandPanel, setHighlightedTool } = useStudyToolsStore()

  // Handle navigation to study tools
  const handleStudyToolNavigation = (toolType: StudyToolType) => {
    // Set up highlighting and panel state
    setHighlightedTool(toolType)
    expandPanel()

    // Navigate to chat page
    router.push('/chat')
  }

  const actionCards: CardItem[] = [
    {
      title: "Generate Course",
      description: "5-min lessons with quizzes",
      icon: <GraduationCap className="h-6 w-6" />,
      variant: "teal" as const,
      href: '/courses/create',
      badge: <Badge variant="new" className="absolute top-2 right-2 text-xs px-2 py-0.5">NEW</Badge>
    },
    {
      title: "Generate Study Guide",
      description: "Structured learning materials",
      icon: <BookOpen className="h-6 w-6" />,
      variant: "purple" as const,
      onClick: () => handleStudyToolNavigation('study-guide')
    },
    {
      title: "Create Flashcards",
      description: "Interactive Q&A cards",
      icon: <FlashcardsStackIcon size={24} />,
      variant: "teal" as const,
      onClick: () => handleStudyToolNavigation('flashcards')
    },
    {
      title: "Make Smart Notes",
      description: "Organized notes with highlights",
      icon: <PenTool className="h-6 w-6" />,
      variant: "default" as const,
      onClick: () => handleStudyToolNavigation('smart-notes')
    },
    {
      title: "Get Smart Summary",
      description: "Key insights and main points",
      icon: <Zap className="h-6 w-6" />,
      variant: "purple" as const,
      onClick: () => handleStudyToolNavigation('smart-summary')
    }
  ]

  return (
    <div className="px-8 py-4">
      <div className="space-y-6">
        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 max-w-7xl">
          {actionCards.map((card) => {
            const content = (
              <div key={card.title} className="relative">
                <ActionCard
                  title={card.title}
                  description={card.description}
                  icon={card.icon}
                  variant={card.variant}
                  onClick={card.href ? undefined : card.onClick}
                  className="h-24 hover:shadow-glow"
                />
                {card.badge}
              </div>
            )
            return card.href ? (
              <Link key={card.title} href={card.href} prefetch>
                {content}
              </Link>
            ) : content
          })}
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 max-w-6xl pt-4 mx-auto">
          {/* Courses */}
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500/20 to-teal-500/10 flex items-center justify-center mx-auto border border-teal-500/20">
              <GraduationCap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1">Courses</h3>
              <p className="text-sm text-muted-foreground">
                AI-generated micro-courses with lessons, quizzes, and progress tracking
              </p>
            </div>
          </div>

          {/* Study Guides */}
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 flex items-center justify-center mx-auto border border-blue-500/20">
              <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1">Study Guides</h3>
              <p className="text-sm text-muted-foreground">
                Generate structured study materials and practice questions
              </p>
            </div>
          </div>

          {/* Flashcards */}
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-green-500/10 flex items-center justify-center mx-auto border border-green-500/20">
              <FlashcardsStackIcon size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1">Flashcards</h3>
              <p className="text-sm text-muted-foreground">
                Interactive Q&A cards for memorization and review
              </p>
            </div>
          </div>

          {/* Smart Notes */}
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-500/10 flex items-center justify-center mx-auto border border-purple-500/20">
              <PenTool className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1">Smart Notes</h3>
              <p className="text-sm text-muted-foreground">
                Create organized notes with key concepts highlighted
              </p>
            </div>
          </div>

          {/* Smart Summary */}
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/10 flex items-center justify-center mx-auto border border-amber-500/20">
              <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1">Smart Summary</h3>
              <p className="text-sm text-muted-foreground">
                Extract key insights and main points from your documents automatically
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
