import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch courses and progress in parallel
    const [coursesResult, progressResult] = await Promise.all([
      supabase
        .from('courses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_course_progress')
        .select('course_id, completion_percentage, lessons_completed')
        .eq('user_id', user.id)
    ])

    if (coursesResult.error) {
      console.error('Error fetching courses:', coursesResult.error)
      return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
    }

    // Build a progress lookup map
    const progressMap: Record<string, { completionPercentage: number; lessonsCompleted: number }> = {}
    if (progressResult.data) {
      for (const p of progressResult.data) {
        progressMap[p.course_id] = {
          completionPercentage: p.completion_percentage || 0,
          lessonsCompleted: p.lessons_completed || 0
        }
      }
    }

    // Attach progress to each course
    const coursesWithProgress = (coursesResult.data || []).map(course => ({
      ...course,
      progress: progressMap[course.id] || { completionPercentage: 0, lessonsCompleted: 0 }
    }))

    return NextResponse.json(coursesWithProgress)
  } catch (error) {
    console.error('Unexpected error in GET /api/courses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
