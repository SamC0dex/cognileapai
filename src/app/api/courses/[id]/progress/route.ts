import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: courseId } = await params

    // Fetch course with progress info
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id, status, generation_progress')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Fetch user course progress
    const { data: progressList } = await supabase
      .from('user_course_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .limit(1)

    const progress = progressList?.[0] || null

    // Fetch completed lessons
    const { data: completions } = await supabase
      .from('lesson_completions')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', courseId)

    // Fetch user streak
    const { data: streakList } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)

    const streak = streakList?.[0] || null

    return NextResponse.json({
      progress: progress,
      completions: completions || [],
      streak: streak
    })

  } catch (error) {
    console.error('[CourseProgress] API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    )
  }
}
