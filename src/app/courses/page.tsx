'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Clock, TrendingUp, Flame, Target, Plus, Award, Zap, MoreVertical, Edit3, Trash2 } from 'lucide-react'
import { Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Input } from '@/components/ui'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useCourseStore } from '@/lib/course-store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function CoursesPage() {
  const router = useRouter()
  const { courses, userStreak, fetchCourses } = useCourseStore()
  const [loading, setLoading] = React.useState(true)
  const [renameDialog, setRenameDialog] = React.useState(false)
  const [deleteDialog, setDeleteDialog] = React.useState(false)
  const [selectedCourse, setSelectedCourse] = React.useState<string | null>(null)
  const [newTitle, setNewTitle] = React.useState('')
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [isRenaming, setIsRenaming] = React.useState(false)

  React.useEffect(() => {
    const loadCourses = async () => {
      try {
        await fetchCourses()
      } catch (error) {
        console.error('Failed to fetch courses:', error)
        toast.error('Failed to load courses. Please refresh the page.')
      } finally {
        setLoading(false)
      }
    }

    loadCourses()
  }, [fetchCourses])

  const handleRename = (courseId: string, currentTitle: string) => {
    setSelectedCourse(courseId)
    setNewTitle(currentTitle)
    setRenameDialog(true)
  }

  const handleRenameConfirm = async () => {
    if (!newTitle.trim() || !selectedCourse) return

    setIsRenaming(true)
    try {
      const response = await fetch(`/api/courses/${selectedCourse}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      })

      if (!response.ok) throw new Error('Failed to rename course')

      toast.success('Course renamed successfully')
      await fetchCourses()
      setRenameDialog(false)
      setSelectedCourse(null)
    } catch (error) {
      console.error('Failed to rename course:', error)
      toast.error('Failed to rename course')
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDelete = (courseId: string) => {
    setSelectedCourse(courseId)
    setDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedCourse) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/courses/${selectedCourse}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete course')

      toast.success('Course deleted successfully')
      await fetchCourses()
      setDeleteDialog(false)
      setSelectedCourse(null)
    } catch (error) {
      console.error('Failed to delete course:', error)
      toast.error('Failed to delete course')
    } finally {
      setIsDeleting(false)
    }
  }

  // Calculate stats (exclude generating courses)
  const readyCourses = courses.filter(c => c.status === 'ready')
  const totalCourses = readyCourses.length
  const totalLessons = readyCourses.reduce((sum, c) => sum + (c.totalLessons || 0), 0)
  const totalHours = readyCourses.reduce((sum, c) => sum + (c.estimatedHours || 0), 0)
  const currentStreak = userStreak?.currentStreak || 0
  const completionRate = totalCourses > 0
    ? Math.round(readyCourses.reduce((sum, c) => sum + (c.progress?.completionPercentage || 0), 0) / totalCourses)
    : 0

  return (
    <DashboardLayout>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 py-6 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div>
              <motion.h1
                className="text-3xl font-bold mb-2"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                My Courses
              </motion.h1>
              <p className="text-muted-foreground">
                Track your learning journey and progress
              </p>
            </div>

            <Button
              variant="purple"
              onClick={() => router.push('/courses/create')}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create New Course
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-8 py-8 space-y-8">
          {/* Stats Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Courses */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-500/10 flex items-center justify-center">
                    <BookOpen className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Courses</p>
                  <p className="text-3xl font-bold">{totalCourses}</p>
                </div>
              </Card>
            </motion.div>

            {/* Study Streak */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/10 flex items-center justify-center">
                    <Flame className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <Zap className="h-5 w-5 text-orange-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Current Streak</p>
                  <p className="text-3xl font-bold">{currentStreak} days</p>
                </div>
              </Card>
            </motion.div>

            {/* Total Lessons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/10 flex items-center justify-center">
                    <Target className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <Award className="h-5 w-5 text-purple-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Lessons</p>
                  <p className="text-3xl font-bold">{totalLessons}</p>
                </div>
              </Card>
            </motion.div>

            {/* Study Hours */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/10 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Hours</p>
                  <p className="text-3xl font-bold">{totalHours}h</p>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Progress Overview Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Overall Progress</h2>
                  <p className="text-muted-foreground">Your learning statistics at a glance</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Completion Rate */}
                <div className="text-center">
                  <div className="relative inline-block mb-4">
                    <svg className="transform -rotate-90" width="120" height="120">
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        stroke="currentColor"
                        strokeWidth="10"
                        fill="none"
                        className="text-muted"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        stroke="url(#gradient-completion)"
                        strokeWidth="10"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${completionRate * 3.14} 314`}
                      />
                      <defs>
                        <linearGradient id="gradient-completion" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#14B8A6" />
                          <stop offset="100%" stopColor="#8B5CF6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold">{completionRate}%</span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Completion Rate</p>
                </div>

                {/* Active Courses */}
                <div className="text-center">
                  <div className="mb-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-teal-500/20 to-purple-500/20 mb-2">
                      <BookOpen className="h-10 w-10 text-teal-600 dark:text-teal-400" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold mb-2">{totalCourses}</p>
                  <p className="text-sm font-medium text-muted-foreground">Active Courses</p>
                </div>

                {/* Study Streak */}
                <div className="text-center">
                  <div className="mb-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 mb-2">
                      <Flame className="h-10 w-10 text-orange-600 dark:text-orange-400" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold mb-2">{currentStreak}</p>
                  <p className="text-sm font-medium text-muted-foreground">Day Streak</p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Courses Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Your Courses</h2>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-64 rounded-2xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : totalCourses === 0 ? (
              <Card className="p-12">
                <div className="text-center max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-teal-500/20 to-purple-500/20 flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-teal-600 dark:text-teal-400" />
                  </div>
                  <h3 className="text-xl font-bold">No courses yet</h3>
                  <p className="text-muted-foreground">
                    Start your learning journey by creating your first AI-powered course from any PDF document
                  </p>
                  <Button
                    variant="purple"
                    onClick={() => router.push('/dashboard')}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Your First Course
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses
                  .filter((course, index, self) =>
                    // Remove any duplicates by ID (defensive programming)
                    index === self.findIndex((c) => c.id === course.id)
                  )
                  .map((course, index) => (
                    <motion.div
                      key={course.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                    >
                    <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 relative">
                      <div className="relative h-32 bg-gradient-to-br from-teal-500/20 via-purple-500/20 to-blue-500/20">
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
                        <div className="absolute bottom-4 left-6">
                          <div className="w-14 h-14 rounded-xl bg-background/90 backdrop-blur flex items-center justify-center shadow-lg">
                            <BookOpen className="h-7 w-7 text-teal-600 dark:text-teal-400" />
                          </div>
                        </div>

                        {/* Three-dot menu */}
                        <div className="absolute top-4 right-4 z-10">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full bg-background/80 backdrop-blur hover:bg-background"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRename(course.id, course.title)
                                }}
                                className="cursor-pointer"
                              >
                                <Edit3 className="h-4 w-4 mr-2" />
                                Rename Course
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(course.id)
                                }}
                                className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Course
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <Link href={`/courses/${course.id}`} className="block">
                        <div className="p-6 pt-4">
                          <h3 className="font-bold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                            {course.title}
                          </h3>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-4 w-4" />
                              {course.totalLessons}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {course.estimatedHours}h
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Progress</span>
                              <span>{course.progress?.completionPercentage || 0}%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-teal-500 to-purple-500 transition-all duration-500"
                                style={{ width: `${course.progress?.completionPercentage || 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </Link>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
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
              Are you sure you want to delete this course? This action cannot be undone.
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
    </DashboardLayout>
  )
}
