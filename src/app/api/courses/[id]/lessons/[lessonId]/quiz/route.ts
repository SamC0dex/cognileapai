import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/courses/[id]/lessons/[lessonId]/quiz
// Get quiz questions for a lesson
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const supabase = await createClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await params
    const courseId = resolvedParams.id
    const lessonId = resolvedParams.lessonId

    // Verify course ownership
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Verify lesson belongs to course
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, title')
      .eq('id', lessonId)
      .eq('course_id', courseId)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Fetch quiz questions
    const { data: questions, error: questionsError } = await supabase
      .from('lesson_quizzes')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('order_index', { ascending: true })

    if (questionsError) {
      console.error('Error fetching quiz questions:', questionsError)
      return NextResponse.json(
        { error: 'Failed to fetch quiz questions' },
        { status: 500 }
      )
    }

    // Transform to camelCase
    const formattedQuestions = questions?.map((q: {
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
      lessonTitle: lesson.title,
      questions: formattedQuestions,
    })
  } catch (error) {
    console.error('Unexpected error in GET /api/courses/[id]/lessons/[lessonId]/quiz:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/courses/[id]/lessons/[lessonId]/quiz
// Submit quiz answers and get results
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const supabase = await createClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await params
    const courseId = resolvedParams.id
    const lessonId = resolvedParams.lessonId

    // Parse request body
    const body = await request.json()
    const { answers } = body // answers: { questionId: selectedAnswer }

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json(
        { error: 'Invalid answers format' },
        { status: 400 }
      )
    }

    // Verify course ownership
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Fetch quiz questions
    const { data: questions, error: questionsError } = await supabase
      .from('lesson_quizzes')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('order_index', { ascending: true })

    if (questionsError || !questions) {
      return NextResponse.json(
        { error: 'Failed to fetch quiz questions' },
        { status: 500 }
      )
    }

    // Grade the quiz
    const results = questions.map((q: {
      id: string
      question: string
      correct_answer: string
      explanation: string
    }) => {
      const userAnswer = answers[q.id]
      const isCorrect = userAnswer === q.correct_answer

      return {
        questionId: q.id,
        question: q.question,
        userAnswer,
        correctAnswer: q.correct_answer,
        isCorrect,
        explanation: q.explanation,
      }
    })

    const correctCount = results.filter(r => r.isCorrect).length
    const totalQuestions = questions.length
    const score = totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0

    return NextResponse.json({
      score,
      correctCount,
      totalQuestions,
      passed: score >= 70, // 70% passing threshold
      results,
    })
  } catch (error) {
    console.error('Unexpected error in POST /api/courses/[id]/lessons/[lessonId]/quiz:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
