import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Types
export interface Course {
  id: string
  title: string
  description: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedHours: number
  totalLessons: number
  totalChapters: number
  thumbnailUrl?: string
  documentId?: string
  status?: 'generating' | 'ready' | 'error' // NEW: generation status
  generationProgress?: GenerationProgress // NEW: progress tracking
  customInstructions?: string // NEW: user customizations
  createdAt: string
  updatedAt: string
  progress?: {
    completionPercentage: number
    lessonsCompleted: number
  }
}

export interface GenerationProgress {
  phase: 'outline' | 'lessons' | 'quizzes' | 'verification' | 'finalizing' | 'complete' | 'error'
  percentage: number
  currentStep: string
  error?: string
  batchInfo?: {
    currentBatch: number
    totalBatches: number
    itemsInBatch: number
  }
  verificationResults?: {
    passed: boolean
    issues: string[]
    suggestions: string[]
  }
}

export interface Chapter {
  id: string
  courseId: string
  title: string
  description?: string
  orderIndex: number
  lessons: Lesson[]
}

export interface Lesson {
  id: string
  chapterId: string
  courseId: string
  title: string
  description?: string
  learningObjective: string
  contentMarkdown: string
  images: LessonImage[]
  interactiveElements: Record<string, unknown>
  videos: LessonVideo[]
  orderIndex: number
  lessonNumber: string
  estimatedMinutes: number
}

export interface LessonImage {
  url: string
  caption?: string
  position: number
}

export interface LessonVideo {
  url: string
  title?: string
  position: number
}

export interface QuizQuestion {
  id: string
  lessonId: string
  question: string
  questionType: 'multiple_choice' | 'true_false' | 'fill_blank'
  options: string[]
  correctAnswer: string
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
  orderIndex: number
}

export interface UserCourseProgress {
  id: string
  userId: string
  courseId: string
  enrolledAt: string
  lastAccessedAt: string
  completionPercentage: number
  currentLessonId?: string
  totalTimeSeconds: number
  lessonsCompleted: number
}

export interface LessonCompletion {
  id: string
  userId: string
  lessonId: string
  courseId: string
  completedAt: string
  quizScore?: number
  timeSpentSeconds: number
}

export interface UserStreak {
  id: string
  userId: string
  currentStreak: number
  longestStreak: number
  lastStudyDate: string
}

export interface ActiveGeneration {
  id: string
  courseTitle: string
  documentId: string
  progress: number
  startTime: number
  statusMessage: string
}

export interface ExistingCourseInfo {
  id: string
  title: string
  status: string
  createdAt: string
  totalLessons: number
  totalChapters: number
  totalExisting: number
}

// Store interface
interface CourseStore {
  // State
  courses: Course[]
  activeCourse: Course | null
  activeChapters: Chapter[]
  activeLesson: Lesson | null
  activeLessonQuiz: QuizQuestion[]
  userProgress: UserCourseProgress | null
  completedLessons: LessonCompletion[]
  userStreak: UserStreak | null
  activeGeneration: ActiveGeneration | null
  isGenerating: boolean
  pollingInterval: NodeJS.Timeout | null // NEW: polling timer

  // Actions
  setCourses: (courses: Course[]) => void
  setActiveCourse: (course: Course | null) => void
  setActiveLesson: (lesson: Lesson | null) => void
  setUserProgress: (progress: UserCourseProgress | null) => void
  setUserStreak: (streak: UserStreak | null) => void

  fetchCourses: () => Promise<void>
  fetchCourseDetails: (courseId: string) => Promise<void>
  fetchLessonContent: (lessonId: string) => Promise<void>
  fetchUserProgress: (courseId: string) => Promise<void>

  checkExistingCourse: (documentId: string) => Promise<ExistingCourseInfo | null>
  startGeneration: (documentId: string, courseTitle: string, customInstructions?: string, forceNew?: boolean) => Promise<string | null>
  pollGenerationProgress: (courseId: string) => Promise<void>
  updateGenerationProgress: (progress: number, message: string) => void
  completeGeneration: (course: Course) => void
  cancelGeneration: () => void
  stopPolling: () => void

  markLessonComplete: (lessonId: string, quizScore: number, timeSpent: number) => Promise<void>
  updateProgress: () => Promise<void>
  updateStreak: () => Promise<void>

  resetState: () => void
}

// Create store
export const useCourseStore = create<CourseStore>()(
  persist(
    (set, get) => ({
      // Initial state
      courses: [],
      activeCourse: null,
      activeChapters: [],
      activeLesson: null,
      activeLessonQuiz: [],
      userProgress: null,
      completedLessons: [],
      userStreak: null,
      activeGeneration: null,
      isGenerating: false,
      pollingInterval: null,

      // Actions
      setCourses: (courses) => set({ courses }),
      setActiveCourse: (course) => set({ activeCourse: course }),
      setActiveLesson: (lesson) => set({ activeLesson: lesson }),
      setUserProgress: (progress) => set({ userProgress: progress }),
      setUserStreak: (streak) => set({ userStreak: streak }),

      fetchCourses: async () => {
        try {
          const response = await fetch('/api/courses')
          if (!response.ok) {
            console.error('Fetch courses failed with status:', response.status)
            throw new Error('Failed to fetch courses')
          }
          const courses = await response.json()

          // Ensure courses is an array and remove any duplicates by ID
          const coursesArray = Array.isArray(courses) ? courses : []
          const uniqueCourses = coursesArray.filter((course, index, self) =>
            index === self.findIndex((c) => c.id === course.id)
          )

          set({ courses: uniqueCourses })
        } catch (error) {
          console.error('Error fetching courses:', error)
          // On error, clear courses to prevent showing stale data
          set({ courses: [] })
        }
      },

      fetchCourseDetails: async (courseId: string) => {
        try {
          const response = await fetch(`/api/courses/${courseId}`)
          if (!response.ok) throw new Error('Failed to fetch course details')
          const data = await response.json()
          set({
            activeCourse: data.course,
            activeChapters: data.chapters,
          })
        } catch (error) {
          console.error('Error fetching course details:', error)
        }
      },

      fetchLessonContent: async (lessonId: string) => {
        try {
          const response = await fetch(`/api/courses/lessons/${lessonId}`)
          if (!response.ok) throw new Error('Failed to fetch lesson')
          const data = await response.json()
          
          // Transform lesson data to match store interface
          const lesson: Lesson = {
            id: data.lesson.id,
            chapterId: data.lesson.chapterId,
            courseId: data.lesson.courseId,
            title: data.lesson.title,
            description: data.lesson.description || '',
            learningObjective: data.lesson.learningObjective,
            contentMarkdown: data.lesson.contentMarkdown,
            images: data.lesson.images || [],
            interactiveElements: data.lesson.interactiveElements || {},
            videos: data.lesson.videos || [],
            orderIndex: data.lesson.orderIndex,
            lessonNumber: data.lesson.lessonNumber,
            estimatedMinutes: data.lesson.estimatedMinutes,
          }

          // Transform quiz data
          const quiz: QuizQuestion[] = data.quiz.map((q: Record<string, unknown>) => ({
            id: q.id,
            lessonId: q.lessonId,
            question: q.question,
            questionType: q.questionType,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty,
            orderIndex: q.orderIndex,
          }))

          set({
            activeLesson: lesson,
            activeLessonQuiz: quiz,
          })
        } catch (error) {
          console.error('Error fetching lesson:', error)
          throw error
        }
      },

      fetchUserProgress: async (courseId: string) => {
        try {
          const response = await fetch(`/api/courses/${courseId}/progress`)
          if (!response.ok) throw new Error('Failed to fetch progress')
          const data = await response.json()
          set({
            userProgress: data.progress,
            completedLessons: data.completions,
            userStreak: data.streak,
          })
        } catch (error) {
          console.error('Error fetching progress:', error)
        }
      },

      checkExistingCourse: async (documentId: string) => {
        try {
          const response = await fetch('/api/courses/check-existing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId }),
          })

          if (!response.ok) {
            return null
          }

          const data = await response.json()
          
          if (data.exists && data.course) {
            return {
              ...data.course,
              totalExisting: data.totalExisting || 1
            } as ExistingCourseInfo
          }
          
          return null
        } catch (error) {
          console.error('Error checking existing course:', error)
          return null
        }
      },

      startGeneration: async (documentId: string, courseTitle: string, customInstructions?: string, forceNew?: boolean) => {
        try {
          // Set initial generating state
          set({
            isGenerating: true,
            activeGeneration: {
              id: crypto.randomUUID(),
              courseTitle,
              documentId,
              progress: 5,
              startTime: Date.now(),
              statusMessage: 'Starting generation...',
            },
          })

          // Call fast generation API (returns after outline, continues in background)
          const response = await fetch('/api/courses/generate-fast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId, customInstructions, forceNew }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to start generation')
          }

          const data = await response.json()
          const courseId = data.courseId

          // Update active generation with course ID and outline info
          const { activeGeneration } = get()
          if (activeGeneration) {
            set({
              activeGeneration: {
                ...activeGeneration,
                id: courseId,
                progress: 10,
                statusMessage: `Creating ${data.outline?.units || 0} units...`,
              },
            })
          }

          // Start polling for progress (units generate in background)
          get().pollGenerationProgress(courseId)

          return courseId
        } catch (error: unknown) {
          console.error('Error starting generation:', error)
          set({
            isGenerating: false,
            activeGeneration: null,
          })
          return null
        }
      },

      pollGenerationProgress: async (courseId: string) => {
        // Clear any existing polling interval
        const { pollingInterval } = get()
        if (pollingInterval) {
          clearInterval(pollingInterval)
        }

        console.log('[CourseStore] Starting polling for course:', courseId)

        // Start polling every 2 seconds (faster updates)
        const interval = setInterval(async () => {
          try {
            const response = await fetch(`/api/courses/${courseId}`)
            if (!response.ok) throw new Error('Failed to fetch course status')

            const data = await response.json()
            const course: Course = data.course

            console.log('[CourseStore] Polling update:', {
              status: course.status,
              phase: course.generationProgress?.phase,
              percentage: course.generationProgress?.percentage,
              step: course.generationProgress?.currentStep
            })

            // CRITICAL FIX: Update BOTH activeGeneration AND activeCourse
            if (course.generationProgress) {
              const { activeGeneration } = get()
              if (activeGeneration) {
                set({
                  activeGeneration: {
                    ...activeGeneration,
                    progress: course.generationProgress.percentage,
                    statusMessage: course.generationProgress.currentStep,
                  },
                  // IMPORTANT: Also update activeCourse so modal can read from it
                  activeCourse: course,
                })
              }
            } else {
              // Even without generationProgress, update activeCourse
              set({ activeCourse: course })
            }

            // Check if generation is complete or failed
            if (course.status === 'ready') {
              console.log('[CourseStore] Generation complete!')
              get().completeGeneration(course)
              get().stopPolling()
            } else if (course.status === 'error') {
              console.error('[CourseStore] Generation failed:', course.generationProgress?.error)
              // Keep activeCourse so modal can display the error
              set({
                isGenerating: false,
                activeCourse: course, // Keep course with error state
              })
              get().stopPolling()
            }
          } catch (error) {
            console.error('[CourseStore] Error polling generation progress:', error)
          }
        }, 2000) // Poll every 2 seconds for faster updates

        set({ pollingInterval: interval })
      },

      stopPolling: () => {
        const { pollingInterval } = get()
        if (pollingInterval) {
          clearInterval(pollingInterval)
          set({ pollingInterval: null })
        }
      },

      updateGenerationProgress: (progress: number, message: string) => {
        const { activeGeneration } = get()
        if (activeGeneration) {
          set({
            activeGeneration: {
              ...activeGeneration,
              progress,
              statusMessage: message,
            },
          })
        }
      },

      completeGeneration: (course: Course) => {
        const { courses } = get()

        // Check if course already exists (prevent duplicates)
        const existingIndex = courses.findIndex(c => c.id === course.id)
        const updatedCourses = existingIndex >= 0
          ? courses.map((c, i) => i === existingIndex ? course : c)
          : [...courses, course]

        set({
          isGenerating: false,
          activeGeneration: null,
          courses: updatedCourses,
          activeCourse: course,
        })
      },

      cancelGeneration: () => {
        set({
          isGenerating: false,
          activeGeneration: null,
        })
      },

      markLessonComplete: async (lessonId: string, quizScore: number, timeSpent: number) => {
        const { activeCourse } = get()
        if (!activeCourse) return

        try {
          const response = await fetch(
            `/api/courses/${activeCourse.id}/lessons/${lessonId}/complete`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quizScore, timeSpent }),
            }
          )
          if (!response.ok) throw new Error('Failed to mark lesson complete')

          // Refresh progress (streak is already updated by the completion endpoint)
          await get().updateProgress()
        } catch (error) {
          console.error('Error marking lesson complete:', error)
        }
      },

      updateProgress: async () => {
        const { activeCourse } = get()
        if (!activeCourse) return
        await get().fetchUserProgress(activeCourse.id)
      },

      updateStreak: async () => {
        // Note: Streak is automatically updated by the lesson completion endpoint
        // This method is kept for potential future use but currently does nothing
        // The streak is fetched as part of fetchUserProgress()
        console.log('[CourseStore] updateStreak called (no-op - handled by completion endpoint)')
      },

      resetState: () => {
        // Stop polling before resetting
        get().stopPolling()

        set({
          courses: [],
          activeCourse: null,
          activeChapters: [],
          activeLesson: null,
          activeLessonQuiz: [],
          userProgress: null,
          completedLessons: [],
          userStreak: null,
          activeGeneration: null,
          isGenerating: false,
          pollingInterval: null,
        })
      },
    }),
    {
      name: 'course-storage',
      version: 2, // Increment version to clear old cached data with duplicates
      partialize: (state) => ({
        courses: state.courses,
        activeCourse: state.activeCourse,
        userProgress: state.userProgress,
        userStreak: state.userStreak,
      }),
      migrate: (persistedState: unknown, version: number) => {
        // Clear old cached data if upgrading from version < 2
        if (version < 2) {
          return {
            courses: [],
            activeCourse: null,
            userProgress: null,
            userStreak: null,
          }
        }
        return persistedState
      },
    }
  )
)
