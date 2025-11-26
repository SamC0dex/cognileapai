import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/courses/[id]/lessons/[lessonId]/complete - Mark lesson as complete
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
    const body = await request.json()
    const { quizScore, timeSpent } = body

    // Verify course ownership
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id, total_lessons')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Verify lesson belongs to course
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, course_id')
      .eq('id', lessonId)
      .eq('course_id', courseId)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Check if already completed (upsert)
    // Note: Don't use .single() here as it throws PGRST116 error when no rows exist
    const { data: existingCompletions } = await supabase
      .from('lesson_completions')
      .select('id')
      .eq('user_id', user.id)
      .eq('lesson_id', lessonId)
      .limit(1)

    const existingCompletion = existingCompletions?.[0] || null

    let completion
    if (existingCompletion) {
      // Update existing completion
      const { data, error } = await supabase
        .from('lesson_completions')
        .update({
          quiz_score: quizScore,
          time_spent_seconds: timeSpent,
          completed_at: new Date().toISOString(),
        })
        .eq('id', existingCompletion.id)
        .select()

      if (error) throw error
      completion = data?.[0] || existingCompletion
    } else {
      // Create new completion
      const { data, error } = await supabase
        .from('lesson_completions')
        .insert({
          user_id: user.id,
          lesson_id: lessonId,
          course_id: courseId,
          quiz_score: quizScore,
          time_spent_seconds: timeSpent,
        })
        .select()

      if (error) throw error
      completion = data?.[0]
      if (!completion) throw new Error('Failed to create completion record')
    }

    // Update user course progress
    // Get total completed lessons for this course
    const { data: completions } = await supabase
      .from('lesson_completions')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', courseId)

    const lessonsCompleted = completions?.length || 0
    const completionPercentage = Math.round((lessonsCompleted / course.total_lessons) * 100)

    // Update or create user_course_progress
    // Note: Don't use .single() here as it throws PGRST116 error when no rows exist
    const { data: existingProgressList } = await supabase
      .from('user_course_progress')
      .select('id, total_time_seconds')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .limit(1)

    const existingProgress = existingProgressList?.[0] || null

    if (existingProgress) {
      // Update existing progress
      await supabase
        .from('user_course_progress')
        .update({
          completion_percentage: completionPercentage,
          lessons_completed: lessonsCompleted,
          total_time_seconds: existingProgress.total_time_seconds + timeSpent,
          last_accessed_at: new Date().toISOString(),
          current_lesson_id: lessonId,
        })
        .eq('id', existingProgress.id)
    } else {
      // Create new progress record
      await supabase
        .from('user_course_progress')
        .insert({
          user_id: user.id,
          course_id: courseId,
          completion_percentage: completionPercentage,
          lessons_completed: lessonsCompleted,
          total_time_seconds: timeSpent,
          current_lesson_id: lessonId,
        })
    }

    // Update user streak
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    // Note: Don't use .single() here as it throws PGRST116 error when no rows exist
    const { data: streakList } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)

    const streak = streakList?.[0] || null

    if (streak) {
      const lastStudyDate = streak.last_study_date
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

      let newCurrentStreak = streak.current_streak
      
      if (lastStudyDate === today) {
        // Already studied today, no change
      } else if (lastStudyDate === yesterday) {
        // Consecutive day, increment streak
        newCurrentStreak = streak.current_streak + 1
      } else {
        // Streak broken, reset to 1
        newCurrentStreak = 1
      }

      const newLongestStreak = Math.max(newCurrentStreak, streak.longest_streak)

      await supabase
        .from('user_streaks')
        .update({
          current_streak: newCurrentStreak,
          longest_streak: newLongestStreak,
          last_study_date: today,
        })
        .eq('user_id', user.id)
    } else {
      // Create new streak record
      await supabase
        .from('user_streaks')
        .insert({
          user_id: user.id,
          current_streak: 1,
          longest_streak: 1,
          last_study_date: today,
        })
    }

    return NextResponse.json({
      success: true,
      completion: {
        id: completion.id,
        quizScore: completion.quiz_score,
        timeSpent: completion.time_spent_seconds,
        completedAt: completion.completed_at,
      },
      progress: {
        completionPercentage,
        lessonsCompleted,
      },
    })
  } catch (error) {
    console.error('Unexpected error in POST /api/courses/[id]/lessons/[lessonId]/complete:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
