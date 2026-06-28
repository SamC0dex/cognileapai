'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FlashcardSet } from '@/types/flashcards'
import type { QuizSet } from '@/types/quiz'
import type { MindMapSet } from '@/types/mindmap'
import {
  FileText,
  BookOpen,
  Search,
  Plus,
  Grid3x3,
  List,
  CreditCard,
  Clock,
  ExternalLink,
  PenTool,
  Zap,
  X,
  ChevronLeft,
  HelpCircle,
  Network
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Input
} from '@/components/ui'
import { useStudyToolsStore, STUDY_TOOLS, type StudyToolContent } from '@/lib/study-tools-store'
import { useFlashcardStore } from '@/lib/flashcard-store'
import { useQuizStore } from '@/lib/quiz-store'
import { useMindMapStore } from '@/lib/mindmap-store'
import { FlashcardsStackIcon } from '@/components/icons/flashcards-stack-icon'
import { useAuth } from '@/contexts/auth-context'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'

interface DashboardTabsProps {
  onViewModeChange?: (mode: 'grid' | 'list') => void
  onSearch?: (query: string) => void
  onUpload?: () => void
}

// Icon mapping for study tools
const iconMap: Record<string, React.FC<{ className?: string }>> = {
  'study-guide': BookOpen,
  'flashcards': FlashcardsStackIcon,
  'smart-notes': PenTool,
  'smart-summary': Zap,
  'quiz': HelpCircle,
  'mind-map': Network
}

// Study Tool Card Component
interface StudyToolCardProps {
  content: StudyToolContent
  onClick: () => void
}

const StudyToolCard: React.FC<StudyToolCardProps> = ({ content, onClick }) => {
  const tool = STUDY_TOOLS[content.type]
  const IconComponent = iconMap[content.type]

  return (
    <div
      onClick={onClick}
      className="group p-4 rounded-xl border border-border bg-card cursor-pointer transition-all duration-150 hover:shadow-sm hover:border-border-strong hover:bg-muted/20"
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg flex-shrink-0", tool.color)}>
          <IconComponent className={cn("w-4 h-4", tool.textColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate mb-1 text-foreground">
            {content.title}
          </h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{new Date(content.createdAt).toLocaleDateString()}</span>
            <span className="bg-muted px-1.5 py-0.5 rounded-md">
              {Math.round(content.content.length / 1000)}k chars
            </span>
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
      </div>
    </div>
  )
}

// Flashcard Set Card Component
interface FlashcardCardProps {
  flashcardSet: FlashcardSet
  onClick: () => void
}

const FlashcardCard: React.FC<FlashcardCardProps> = ({ flashcardSet, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="group p-4 rounded-xl border border-border bg-card cursor-pointer transition-all duration-150 hover:shadow-sm hover:border-border-strong hover:bg-muted/20"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex-shrink-0">
          <FlashcardsStackIcon size={16} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate mb-1 text-foreground">
            {flashcardSet.title}
          </h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{new Date(flashcardSet.createdAt).toLocaleDateString()}</span>
            <span className="bg-muted px-1.5 py-0.5 rounded-md">
              {flashcardSet.cards.length} cards
            </span>
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
      </div>
    </div>
  )
}

// Study Tool List Item Component
interface StudyToolListItemProps {
  content: StudyToolContent
  onClick: () => void
}

const StudyToolListItem: React.FC<StudyToolListItemProps> = ({ content, onClick }) => {
  const tool = STUDY_TOOLS[content.type]
  const IconComponent = iconMap[content.type]

  return (
    <div
      onClick={onClick}
      className="group p-3 rounded-lg border border-border bg-card cursor-pointer transition-all duration-150 hover:bg-muted/20 hover:border-border-strong"
    >
      <div className="flex items-center gap-3">
        <div className={cn("p-1.5 rounded-lg flex-shrink-0", tool.color)}>
          <IconComponent className={cn("w-3.5 h-3.5", tool.textColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate text-foreground">
            {content.title}
          </h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <Clock className="w-3 h-3" />
            <span>
              {new Date(content.createdAt).toLocaleDateString()} at {new Date(content.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
            <span className="bg-muted px-1.5 py-0.5 rounded-md">
              {Math.round(content.content.length / 1000)}k chars
            </span>
          </div>
        </div>
        <ExternalLink className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
    </div>
  )
}

// Flashcard Set List Item Component
interface FlashcardListItemProps {
  flashcardSet: FlashcardSet
  onClick: () => void
}

const FlashcardListItem: React.FC<FlashcardListItemProps> = ({ flashcardSet, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="group p-3 rounded-lg border border-border bg-card cursor-pointer transition-all duration-150 hover:bg-muted/20 hover:border-border-strong"
    >
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex-shrink-0">
          <FlashcardsStackIcon size={14} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate text-foreground">
            {flashcardSet.title}
          </h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <Clock className="w-3 h-3" />
            <span>
              {new Date(flashcardSet.createdAt).toLocaleDateString()} at {new Date(flashcardSet.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
            <span className="bg-muted px-1.5 py-0.5 rounded-md">
              {flashcardSet.cards.length} cards
            </span>
          </div>
        </div>
        <ExternalLink className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
    </div>
  )
}

interface QuizCardProps {
  quizSet: QuizSet
  onClick: () => void
}

const QuizCard: React.FC<QuizCardProps> = ({ quizSet, onClick }) => (
  <LibraryCard
    title={quizSet.title}
    meta={`${quizSet.questions.length} questions`}
    icon={<HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
    iconClassName="bg-amber-50 dark:bg-amber-900/20"
    createdAt={quizSet.createdAt}
    onClick={onClick}
  />
)

interface MindMapCardProps {
  mindMapSet: MindMapSet
  onClick: () => void
}

const MindMapCard: React.FC<MindMapCardProps> = ({ mindMapSet, onClick }) => (
  <LibraryCard
    title={mindMapSet.title}
    meta={`${mindMapSet.metadata.totalNodes || mindMapSet.mindMapData.metadata?.totalNodes || 0} nodes`}
    icon={<Network className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
    iconClassName="bg-teal-50 dark:bg-teal-900/20"
    createdAt={mindMapSet.createdAt}
    onClick={onClick}
  />
)

function LibraryCard({
  title,
  meta,
  icon,
  iconClassName,
  createdAt,
  onClick,
}: {
  title: string
  meta: string
  icon: React.ReactNode
  iconClassName: string
  createdAt: Date
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="group p-4 rounded-xl border border-border bg-card cursor-pointer transition-all duration-150 hover:shadow-sm hover:border-border-strong hover:bg-muted/20"
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg flex-shrink-0', iconClassName)}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate mb-1 text-foreground">{title}</h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{new Date(createdAt).toLocaleDateString()}</span>
            <span className="bg-muted px-1.5 py-0.5 rounded-md">{meta}</span>
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
      </div>
    </div>
  )
}

export function DashboardTabs({
  onViewModeChange,
  onSearch
}: DashboardTabsProps) {
  const { user, loading: authLoading } = useAuth()

  const {
    generatedContent,
    loadStudyToolsFromDatabase,
    openCanvas,
    expandPanel,
    clearGeneratedContent,
    lastLoadedUserId,
    setLastLoadedUserId,
    _hasHydrated: studyToolsHydrated
  } = useStudyToolsStore()
  const {
    flashcardSets,
    openViewer,
    clearFlashcardSets,
    _hasHydrated: flashcardsHydrated
  } = useFlashcardStore()
  const {
    quizSets,
    openViewer: openQuizViewer,
    clearQuizSets,
    _hasHydrated: quizzesHydrated,
  } = useQuizStore()
  const {
    mindMapSets,
    openViewer: openMindMapViewer,
    clearMindMapSets,
    _hasHydrated: mindMapsHydrated,
  } = useMindMapStore()

  const [activeTab, setActiveTab] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)

  // Show loading skeleton until we've completed first data check
  // Start with true to prevent empty state flash
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Track if stores have hydrated
  const storesHydrated = studyToolsHydrated && flashcardsHydrated && quizzesHydrated && mindMapsHydrated

  // Load data on mount or when user changes
  useEffect(() => {
    if (authLoading) {
      setIsInitialLoad(true)
      return
    }

    if (!user) {
      clearGeneratedContent()
      clearFlashcardSets()
      clearQuizSets()
      clearMindMapSets()
      setLastLoadedUserId(null)
      setIsInitialLoad(false)
      return
    }

    if (!storesHydrated) {
      setIsInitialLoad(true)
      return
    }

    const hasCachedData = generatedContent.length > 0 || flashcardSets.length > 0 || quizSets.length > 0 || mindMapSets.length > 0
    const cacheBelongsToDifferentUser = lastLoadedUserId && lastLoadedUserId !== user.id
    const cacheHasUnknownOwner = hasCachedData && !lastLoadedUserId

    if (cacheBelongsToDifferentUser || cacheHasUnknownOwner) {
      clearGeneratedContent()
      clearFlashcardSets()
      clearQuizSets()
      clearMindMapSets()
      setLastLoadedUserId(null)
      setIsInitialLoad(true)
      return
    }

    if (hasCachedData) {
      setIsInitialLoad(false)
      void loadStudyToolsFromDatabase().then(() => {
        setLastLoadedUserId(user.id)
      }).catch((error) => {
        console.error('[Dashboard] Failed to refresh study tools:', error)
      })
      return
    }

    let cancelled = false

    void (async () => {
      try {
        await loadStudyToolsFromDatabase()
        if (!cancelled) {
          setLastLoadedUserId(user.id)
        }
      } catch (error) {
        console.error('[Dashboard] Failed to load study tools:', error)
      } finally {
        if (!cancelled) {
          setIsInitialLoad(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, storesHydrated])

  // Filter data based on active tab
  const getFilteredData = () => {
    let studyTools = generatedContent.filter(content => !content.isGenerating)
    let flashcards = flashcardSets.filter(set => !set.metadata?.isGenerating)
    let quizzes = quizSets.filter(set => !set.metadata?.isGenerating)
    let mindMaps = mindMapSets.filter(set => !set.metadata?.isGenerating)

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      studyTools = studyTools.filter(content =>
        content.title.toLowerCase().includes(query) ||
        content.type.toLowerCase().includes(query)
      )
      flashcards = flashcards.filter(set =>
        set.title.toLowerCase().includes(query)
      )
      quizzes = quizzes.filter(set =>
        set.title.toLowerCase().includes(query)
      )
      mindMaps = mindMaps.filter(set =>
        set.title.toLowerCase().includes(query)
      )
    }

    switch (activeTab) {
      case 'documents':
        return { studyTools, flashcards: [], quizzes: [], mindMaps: [] }
      case 'flashcards':
        return { studyTools: [], flashcards, quizzes: [], mindMaps: [] }
      case 'quizzes':
        return { studyTools: [], flashcards: [], quizzes, mindMaps: [] }
      case 'mindmaps':
        return { studyTools: [], flashcards: [], quizzes: [], mindMaps }
      case 'all':
      default:
        return { studyTools, flashcards, quizzes, mindMaps }
    }
  }

  const { studyTools, flashcards, quizzes, mindMaps } = getFilteredData()
  const totalItems = studyTools.length + flashcards.length + quizzes.length + mindMaps.length

  const openStudyToolsPanel = () => {
    expandPanel()
    window.dispatchEvent(new Event('expand-study-tools-panel'))
  }

  const handleStudyToolClick = (content: StudyToolContent) => {
    openStudyToolsPanel()
    void openCanvas(content)
  }

  const handleFlashcardClick = (flashcardSet: FlashcardSet) => {
    openStudyToolsPanel()
    openViewer(flashcardSet)
  }

  const handleQuizClick = (quizSet: QuizSet) => {
    openStudyToolsPanel()
    openQuizViewer(quizSet)
  }

  const handleMindMapClick = (mindMapSet: MindMapSet) => {
    openStudyToolsPanel()
    openMindMapViewer(mindMapSet)
  }

  const tabs = [
    {
      id: 'all',
      label: 'All',
      icon: FileText,
      count: generatedContent.filter(c => !c.isGenerating).length + flashcardSets.filter(f => !f.metadata?.isGenerating).length + quizSets.filter(q => !q.metadata?.isGenerating).length + mindMapSets.filter(m => !m.metadata?.isGenerating).length
    },
    {
      id: 'documents',
      label: 'Study Documents',
      icon: BookOpen,
      count: generatedContent.filter(c => !c.isGenerating).length
    },
    {
      id: 'flashcards',
      label: 'Flashcards',
      icon: CreditCard,
      count: flashcardSets.filter(f => !f.metadata?.isGenerating).length
    },
    {
      id: 'quizzes',
      label: 'Quizzes',
      icon: HelpCircle,
      count: quizSets.filter(q => !q.metadata?.isGenerating).length
    },
    {
      id: 'mindmaps',
      label: 'Mind Maps',
      icon: Network,
      count: mindMapSets.filter(m => !m.metadata?.isGenerating).length
    }
  ]

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    onSearch?.(value)
  }

  const toggleSearch = () => {
    if (isSearchExpanded && searchQuery) {
      // If expanded and has content, clear and collapse
      setSearchQuery('')
      handleSearch('')
      setIsSearchExpanded(false)
    } else if (isSearchExpanded) {
      // If expanded but empty, just collapse
      setIsSearchExpanded(false)
    } else {
      // If collapsed, expand
      setIsSearchExpanded(true)
    }
  }

  // Auto-collapse search when clicking outside
  const searchRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        if (isSearchExpanded && !searchQuery) {
          setIsSearchExpanded(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isSearchExpanded, searchQuery])

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    onViewModeChange?.(mode)
  }

  return (
    <div className="px-8 pb-8">
      <div className="space-y-5">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Section header */}
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Your library
              </p>
              <TabsList className="ml-3 bg-muted/60 p-0.5 h-8 gap-0.5">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="h-7 px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground rounded-md transition-all"
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="ml-1.5 text-[10px] bg-muted/80 data-[state=active]:bg-muted px-1 py-0.5 rounded-sm">
                        {tab.count}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Collapsible Search */}
              <div ref={searchRef} className="relative flex items-center">
                <AnimatePresence mode="wait">
                  {isSearchExpanded ? (
                    <motion.div
                      key="search-expanded"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="flex items-center"
                    >
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Search..."
                          value={searchQuery}
                          onChange={(e) => handleSearch(e.target.value)}
                          className="w-44 pl-9 h-8 text-sm bg-background border-border"
                          autoFocus
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSearch}
                        className="h-8 w-8 ml-1 flex-shrink-0"
                      >
                        {searchQuery ? (
                          <X className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronLeft className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="search-collapsed"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={toggleSearch}
                        className="h-8 w-8 flex-shrink-0"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center border border-border rounded-lg overflow-hidden flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleViewModeChange('grid')}
                  className={cn(
                    "h-8 w-8 rounded-none",
                    viewMode === 'grid' ? 'bg-muted text-foreground' : 'hover:bg-muted/50 text-muted-foreground'
                  )}
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleViewModeChange('list')}
                  className={cn(
                    "h-8 w-8 rounded-none",
                    viewMode === 'list' ? 'bg-muted text-foreground' : 'hover:bg-muted/50 text-muted-foreground'
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Upload Button */}
              <Button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('expand-files-panel'))
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('open-document-upload'))
                    }, 100)
                  }
                }}
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 flex-shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Upload PDF</span>
                <span className="sm:hidden">Upload</span>
              </Button>
            </div>
          </div>

          {/* Tab Content */}
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-0">
              <div className="min-h-[320px]">
                {isInitialLoad ? (
                  /* Loading State - Show beautiful skeleton */
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DashboardSkeleton count={6} viewMode={viewMode} />
                  </motion.div>
                ) : totalItems === 0 ? (
                  /* Empty State - Only show when loading is complete and no content */
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center justify-center text-center py-16"
                  >
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                      <tab.icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-semibold mb-1.5 text-foreground">
                      {tab.id === 'all' && "No study materials yet"}
                      {tab.id === 'documents' && "No documents yet"}
                      {tab.id === 'flashcards' && "No flashcard decks yet"}
                      {tab.id === 'quizzes' && "No quizzes yet"}
                      {tab.id === 'mindmaps' && "No mind maps yet"}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {tab.id === 'all' && "Upload a PDF and generate study guides, flashcards, quizzes, mind maps, and more."}
                      {tab.id === 'documents' && "Generate study guides, smart summaries, and notes from your uploaded documents."}
                      {tab.id === 'flashcards' && "Create flashcard decks from your study materials for effective review."}
                      {tab.id === 'quizzes' && "Generate quizzes from your study plan or documents to test real understanding."}
                      {tab.id === 'mindmaps' && "Generate mind maps to see concepts, relationships, and weak areas visually."}
                    </p>
                  </motion.div>
                ) : (
                  /* Content Display - Show when loading complete and has content */
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="space-y-4"
                  >
                    {viewMode === 'grid' ? (
                      /* Grid View */
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {studyTools.map((content, index) => (
                          <motion.div
                            key={`tool-${content.id}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                          >
                            <StudyToolCard
                              content={content}
                              onClick={() => handleStudyToolClick(content)}
                            />
                          </motion.div>
                        ))}
                        {flashcards.map((flashcardSet, index) => (
                          <motion.div
                            key={`flash-${flashcardSet.id}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: (studyTools.length + index) * 0.05 }}
                          >
                            <FlashcardCard
                              flashcardSet={flashcardSet}
                              onClick={() => handleFlashcardClick(flashcardSet)}
                            />
                          </motion.div>
                        ))}
                        {quizzes.map((quizSet, index) => (
                          <motion.div
                            key={`quiz-${quizSet.id}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: (studyTools.length + flashcards.length + index) * 0.05 }}
                          >
                            <QuizCard
                              quizSet={quizSet}
                              onClick={() => handleQuizClick(quizSet)}
                            />
                          </motion.div>
                        ))}
                        {mindMaps.map((mindMapSet, index) => (
                          <motion.div
                            key={`map-${mindMapSet.id}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: (studyTools.length + flashcards.length + quizzes.length + index) * 0.05 }}
                          >
                            <MindMapCard
                              mindMapSet={mindMapSet}
                              onClick={() => handleMindMapClick(mindMapSet)}
                            />
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      /* List View */
                      <div className="space-y-2">
                        {studyTools.map((content, index) => (
                          <motion.div
                            key={`tool-${content.id}`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.03 }}
                          >
                            <StudyToolListItem
                              content={content}
                              onClick={() => handleStudyToolClick(content)}
                            />
                          </motion.div>
                        ))}
                        {flashcards.map((flashcardSet, index) => (
                          <motion.div
                            key={`flash-${flashcardSet.id}`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: (studyTools.length + index) * 0.03 }}
                          >
                            <FlashcardListItem
                              flashcardSet={flashcardSet}
                              onClick={() => handleFlashcardClick(flashcardSet)}
                            />
                          </motion.div>
                        ))}
                        {quizzes.map((quizSet, index) => (
                          <motion.div
                            key={`quiz-${quizSet.id}`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: (studyTools.length + flashcards.length + index) * 0.03 }}
                          >
                            <QuizCard
                              quizSet={quizSet}
                              onClick={() => handleQuizClick(quizSet)}
                            />
                          </motion.div>
                        ))}
                        {mindMaps.map((mindMapSet, index) => (
                          <motion.div
                            key={`map-${mindMapSet.id}`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: (studyTools.length + flashcards.length + quizzes.length + index) * 0.03 }}
                          >
                            <MindMapCard
                              mindMapSet={mindMapSet}
                              onClick={() => handleMindMapClick(mindMapSet)}
                            />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}
