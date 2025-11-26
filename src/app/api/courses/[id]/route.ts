import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/courses/[id] - Get course details with chapters and lessons
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

    // Fetch course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Fetch chapters with lessons
    const { data: chapters, error: chaptersError } = await supabase
      .from('chapters')
      .select(`
        *,
        lessons:lessons(*)
      `)
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })

    if (chaptersError) {
      console.error('Error fetching chapters:', chaptersError)
      return NextResponse.json(
        { error: 'Failed to fetch chapters' },
        { status: 500 }
      )
    }

    // Fetch user progress
    const { data: progress } = await supabase
      .from('user_course_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .single()

    // Fetch completed lessons
    const { data: completions } = await supabase
      .from('lesson_completions')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', courseId)

    // Transform to camelCase
    const formattedCourse = {
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty,
      estimatedHours: course.estimated_hours,
      totalLessons: course.total_lessons,
      totalChapters: course.total_chapters,
      thumbnailUrl: course.thumbnail_url,
      documentId: course.document_id,
      status: course.status, // generation status
      generationProgress: course.generation_progress, // progress tracking
      customInstructions: course.custom_instructions, // user customizations
      createdAt: course.created_at,
      updatedAt: course.updated_at,
    }

    const formattedChapters = chapters?.map((chapter: {
      id: string
      course_id: string
      title: string
      description: string | null
      order_index: number
      lessons?: {
        id: string
        chapter_id: string
        course_id: string
        title: string
        description: string | null
        learning_objective: string
        content_markdown: string
        images: unknown
        interactive_elements: unknown
        videos: unknown
        order_index: number
        lesson_number: string
        estimated_minutes: number
      }[]
    }) => ({
      id: chapter.id,
      courseId: chapter.course_id,
      title: chapter.title,
      description: chapter.description,
      orderIndex: chapter.order_index,
      lessons: chapter.lessons?.map((lesson) => ({
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
      })) || [],
    })) || []

    return NextResponse.json({
      course: formattedCourse,
      chapters: formattedChapters,
      progress: progress || null,
      completions: completions || [],
    })
  } catch (error) {
    console.error('Unexpected error in GET /api/courses/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/courses/[id] - Update course
export async function PUT(
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
    const body = await request.json()

    const {
      title,
      description,
      difficulty,
      estimatedHours,
      thumbnailUrl,
    } = body

    // Update course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .update({
        title,
        description,
        difficulty,
        estimated_hours: estimatedHours,
        thumbnail_url: thumbnailUrl,
      })
      .eq('id', courseId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Failed to update course' }, { status: 500 })
    }

    // Transform to camelCase
    const formattedCourse = {
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty,
      estimatedHours: course.estimated_hours,
      totalLessons: course.total_lessons,
      totalChapters: course.total_chapters,
      thumbnailUrl: course.thumbnail_url,
      documentId: course.document_id,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
    }

    return NextResponse.json(formattedCourse)
  } catch (error) {
    console.error('Unexpected error in PUT /api/courses/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/courses/[id] - Delete course
export async function DELETE(
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

    // Delete course (cascades to chapters, lessons, quizzes, etc.)
    const { error: deleteError } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error deleting course:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete course' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error in DELETE /api/courses/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
