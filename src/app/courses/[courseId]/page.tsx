'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { BookOpen } from 'lucide-react'
import { Button, LoadingSpinner, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Input } from '@/components/ui'
import { CourseGeneratingView } from '@/components/course/course-generating-view'
import { CourseRoadmap } from '@/components/course/course-roadmap'
import { CourseHeader } from '@/components/course/course-header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useCourseStore } from '@/lib/course-store'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'

export default function CourseOverviewPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.courseId as string

  const {
    activeCourse,
    activeChapters,
    userProgress,
    userStreak,
    completedLessons,
    fetchCourseDetails,
    fetchUserProgress
  } = useCourseStore()

  const [loading, setLoading] = React.useState(true)
  const [renameDialog, setRenameDialog] = React.useState(false)
  const [deleteDialog, setDeleteDialog] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [isRenaming, setIsRenaming] = React.useState(false)

  React.useEffect(() => {
    const loadCourse = async () => {
      try {
        setLoading(true)
        await Promise.all([
          fetchCourseDetails(courseId),
          fetchUserProgress(courseId)
        ])
      } catch (error) {
        console.error('Failed to load course:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCourse()
  }, [courseId, fetchCourseDetails, fetchUserProgress])

  // Poll for updates if course is generating
  React.useEffect(() => {
    if (!activeCourse || activeCourse.status !== 'generating') {
      return
    }

    const pollInterval = setInterval(async () => {
      try {
        await fetchCourseDetails(courseId)
      } catch (error) {
        console.error('[CoursePage] Failed to poll course status:', error)
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [activeCourse?.status, courseId, fetchCourseDetails])

  const handleRename = () => {
    setNewTitle(activeCourse?.title || '')
    setRenameDialog(true)
  }

  const handleRenameConfirm = async () => {
    if (!newTitle.trim() || !activeCourse) return

    setIsRenaming(true)
    try {
      const response = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      })

      if (!response.ok) throw new Error('Failed to rename course')

      toast.success('Course renamed successfully')
      await fetchCourseDetails(courseId)
      setRenameDialog(false)
    } catch (error) {
      console.error('Failed to rename course:', error)
      toast.error('Failed to rename course')
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDelete = () => {
    setDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/courses/${courseId}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete course')

      toast.success('Course deleted successfully')
      router.push('/courses')
    } catch (error) {
      console.error('Failed to delete course:', error)
      toast.error('Failed to delete course')
      setIsDeleting(false)
    }
  }

  const handleLessonClick = (lessonId: string) => {
    router.push(`/courses/${courseId}/lessons/${lessonId}`)
  }

  if (loading || !activeCourse) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center space-y-4">
            <LoadingSpinner className="h-12 w-12 mx-auto" />
            <p className="text-muted-foreground">Loading course...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Show generation progress if course is still being generated
  if (activeCourse.status === 'generating' && activeCourse.generationProgress) {
    return (
      <DashboardLayout>
        <CourseGeneratingView
          course={activeCourse}
          chapters={activeChapters}
          progress={activeCourse.generationProgress}
          onRefresh={() => fetchCourseDetails(courseId)}
        />
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <CourseHeader
          title={activeCourse.title}
          description={activeCourse.description}
          difficulty={activeCourse.difficulty}
          totalUnits={activeCourse.totalChapters}
          totalLessons={activeCourse.totalLessons}
          estimatedHours={activeCourse.estimatedHours}
          onBack={() => router.push('/courses')}
          onRename={handleRename}
          onDelete={handleDelete}
        />

        {/* Main Content - Roadmap */}
        <div className="py-12 px-6">
          {activeChapters.length > 0 ? (
            <CourseRoadmap
              chapters={activeChapters}
              completedLessons={completedLessons}
              currentLessonId={userProgress?.currentLessonId}
              onLessonClick={handleLessonClick}
              courseName={activeCourse.title}
            />
          ) : (
            <div className="max-w-md mx-auto text-center p-12 rounded-2xl bg-card border shadow-lg">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-violet-500" />
              <h3 className="text-lg font-semibold mb-2">No Content Yet</h3>
              <p className="text-muted-foreground">
                Course content is being prepared...
              </p>
            </div>
          )}
        </div>

      {/* Rename Dialog */}
      <AlertDialog open={renameDialog} onOpenChange={setRenameDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Course</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for your course.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Course title"
            className="mb-4"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isRenaming) {
                handleRenameConfirm()
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRenaming}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRenameConfirm} disabled={isRenaming || !newTitle.trim()}>
              {isRenaming ? 'Renaming...' : 'Rename'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{activeCourse?.title}&rdquo;? This action cannot be undone.
              All lessons, chapters, and progress will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm} 
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </DashboardLayout>
  )
}
