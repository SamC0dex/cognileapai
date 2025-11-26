import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/courses/lessons/[lessonId] - Get lesson details with quiz questions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const supabase = await createClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { lessonId } = await params

    // Fetch lesson
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select(`
        *,
        chapter:chapters(
          id,
          title,
          course:courses(
            id,
            title,
            user_id
          )
        )
      `)
      .eq('id', lessonId)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Verify user owns this course
    if (lesson.chapter.course.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Fetch quiz questions
    const { data: quizQuestions, error: quizError } = await supabase
      .from('lesson_quizzes')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('order_index', { ascending: true })

    if (quizError) {
      console.error('Error fetching quiz questions:', quizError)
      return NextResponse.json(
        { error: 'Failed to fetch quiz questions' },
        { status: 500 }
      )
    }

    // Check if lesson is completed
    const { data: completion } = await supabase
      .from('lesson_completions')
      .select('*')
      .eq('user_id', user.id)
      .eq('lesson_id', lessonId)
      .single()

    // Transform to camelCase
    const formattedLesson = {
      id: lesson.id,
      chapterId: lesson.chapter_id,
      courseId: lesson.course_id,
      title: lesson.title,
      description: lesson.description,
      learningObjective: lesson.learning_objective,
      contentMarkdown: lesson.content_markdown,
      images: lesson.images || [],
      interactiveElements: lesson.interactive_elements || {},
      videos: lesson.videos || [],
      orderIndex: lesson.order_index,
      lessonNumber: lesson.lesson_number,
      estimatedMinutes: lesson.estimated_minutes,
      chapter: {
        id: lesson.chapter.id,
        title: lesson.chapter.title,
      },
      course: {
        id: lesson.chapter.course.id,
        title: lesson.chapter.course.title,
      },
    }

    const formattedQuiz = quizQuestions?.map((q: {
      id: string
      lesson_id: string
      question: string
      question_type: string
      options: string[]
      correct_answer: string
      explanation: string
      difficulty: string
      order_index: number
    }) => ({
      id: q.id,
      lessonId: q.lesson_id,
      question: q.question,
      questionType: q.question_type,
      options: q.options,
      correctAnswer: q.correct_answer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      orderIndex: q.order_index,
    })) || []

    return NextResponse.json({
      lesson: formattedLesson,
      quiz: formattedQuiz,
      isCompleted: !!completion,
      completion: completion ? {
        id: completion.id,
        completedAt: completion.completed_at,
        quizScore: completion.quiz_score,
        timeSpentSeconds: completion.time_spent_seconds,
      } : null,
    })
  } catch (error) {
    console.error('Unexpected error in GET /api/courses/lessons/[lessonId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
