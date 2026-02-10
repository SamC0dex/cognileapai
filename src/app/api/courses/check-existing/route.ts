import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/courses/check-existing
 * 
 * Checks if a course already exists for the given document.
 * Returns existing course info without blocking creation.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { documentId } = await request.json()
    
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }
    
    // Check for existing courses for this document
    const { data: existingCourses, error } = await supabase
      .from('courses')
      .select('id, title, status, created_at, total_lessons, total_chapters')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .in('status', ['ready', 'generating'])
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('[CheckExisting] Database error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    if (existingCourses && existingCourses.length > 0) {
      const latestCourse = existingCourses[0]
      return NextResponse.json({
        exists: true,
        course: {
          id: latestCourse.id,
          title: latestCourse.title,
          status: latestCourse.status,
          createdAt: latestCourse.created_at,
          totalLessons: latestCourse.total_lessons,
          totalChapters: latestCourse.total_chapters
        },
        totalExisting: existingCourses.length
      })
    }
    
    return NextResponse.json({ exists: false })
    
  } catch (error) {
    console.error('[CheckExisting] API error:', error)
    return NextResponse.json(
      { error: 'Failed to check existing courses' },
      { status: 500 }
    )
  }
}
