'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui'
import { BookOpen, Plus, ArrowRight, X, GraduationCap, Clock } from 'lucide-react'

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`
  return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`
}

interface ExistingCourse {
  id: string
  title: string
  status: string
  createdAt: string
  totalLessons: number
  totalChapters: number
}

interface ExistingCourseDialogProps {
  isOpen: boolean
  onClose: () => void
  onGoToExisting: (courseId: string) => void
  onCreateNew: () => void
  onViewAllCourses?: () => void
  existingCourse: ExistingCourse | null
  totalExisting: number
  documentTitle: string
  isLoading?: boolean
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 }
  }
}

const dialogVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: -10
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 30,
      mass: 0.8
    }
  }
}

export const ExistingCourseDialog: React.FC<ExistingCourseDialogProps> = ({
  isOpen,
  onClose,
  onGoToExisting,
  onCreateNew,
  onViewAllCourses,
  existingCourse,
  totalExisting,
  documentTitle,
  isLoading = false
}) => {
  if (!existingCourse) return null

  const isGenerating = existingCourse.status === 'generating'
  const createdTimeAgo = formatTimeAgo(existingCourse.createdAt)
  const hasMultipleCourses = totalExisting > 1

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
        >
          <motion.div
            className="bg-background border border-border rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
            variants={dialogVariants}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with gradient */}
            <div className="relative bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent p-6 pb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
              
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {hasMultipleCourses 
                      ? `${totalExisting} Courses Already Exist`
                      : 'Course Already Exists'
                    }
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    for &ldquo;{documentTitle}&rdquo;
                  </p>
                </div>
              </div>
            </div>

            {/* Existing Course Info Card */}
            <div className="px-6 pb-2">
              {hasMultipleCourses && (
                <p className="text-xs text-muted-foreground mb-2">
                  Most recent course:
                </p>
              )}
              <div className="bg-muted/50 rounded-xl p-4 border border-border/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate" title={existingCourse.title}>
                      {existingCourse.title}
                    </h4>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {isGenerating ? (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          Generating...
                        </span>
                      ) : (
                        <>
                          <span>{existingCourse.totalChapters} chapters</span>
                          <span className="text-border">|</span>
                          <span>{existingCourse.totalLessons} lessons</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>Created {createdTimeAgo}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                What would you like to do?
              </p>

              {/* Primary: Go to existing course */}
              <Button
                onClick={() => onGoToExisting(existingCourse.id)}
                className="w-full justify-between gap-3 h-auto py-3.5 px-4 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-md hover:shadow-lg transition-all"
                disabled={isLoading}
              >
                <div className="flex items-center gap-3">
                  <ArrowRight className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">
                      {isGenerating 
                        ? 'View Progress' 
                        : hasMultipleCourses 
                          ? 'Go to Most Recent Course'
                          : 'Go to Existing Course'
                      }
                    </div>
                    <div className="text-xs opacity-90">
                      {isGenerating 
                        ? 'Check generation status' 
                        : 'Continue where you left off'
                      }
                    </div>
                  </div>
                </div>
              </Button>

              {/* View all courses (only if multiple exist) */}
              {hasMultipleCourses && onViewAllCourses && (
                <Button
                  onClick={onViewAllCourses}
                  variant="outline"
                  className="w-full justify-between gap-3 h-auto py-3 px-4"
                  disabled={isLoading}
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5" />
                    <div className="text-left">
                      <div className="font-medium">View All {totalExisting} Courses</div>
                      <div className="text-xs text-muted-foreground">
                        Browse all courses from this document
                      </div>
                    </div>
                  </div>
                </Button>
              )}

              {/* Create new anyway */}
              <Button
                onClick={onCreateNew}
                variant="outline"
                className="w-full justify-between gap-3 h-auto py-3.5 px-4"
                disabled={isLoading || isGenerating}
              >
                <div className="flex items-center gap-3">
                  <Plus className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">Create New Course</div>
                    <div className="text-xs text-muted-foreground">
                      Generate a fresh course from this document
                    </div>
                  </div>
                </div>
              </Button>

              {isGenerating && (
                <p className="text-xs text-center text-muted-foreground pt-2">
                  A course is currently being generated. Please wait for it to complete before creating a new one.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
