import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCourseGenerationManager, AllModelsOverloadedError } from '@/lib/course-generation-manager'

export const maxDuration = 60 // Maximum Vercel function duration (Hobby: 10s, Pro: 60s, Enterprise: 900s)

/**
 * POST /api/courses/generate
 * Generate a complete course from a document using AI
 *
 * BACKGROUND GENERATION:
 * - This endpoint starts generation and returns immediately
 * - Course is created with status='generating'
 * - Client polls /api/courses/[id]/status for progress updates
 * - Generation runs in background (within maxDuration limits)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const { documentId, customInstructions } = await request.json()

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }

    // Fetch document with content
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, document_content, user_id')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!document.document_content || document.document_content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Document has no content to generate course from' },
        { status: 400 }
      )
    }

    // ============================================
    // CHECK FOR EXISTING COURSES
    // ============================================

    // Check if a course already exists or is being generated for this document
    const { data: existingCourses } = await supabase
      .from('courses')
      .select('id, status, title')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // If there's an active generation, return that course
    if (existingCourses && existingCourses.length > 0) {
      const generatingCourse = existingCourses.find(c => c.status === 'generating')
      if (generatingCourse) {
        return NextResponse.json({
          success: true,
          courseId: generatingCourse.id,
          status: 'generating',
          message: 'Course is already being generated. Redirecting to progress page.',
          alreadyExists: true
        })
      }

      // If there's already a ready course, inform the user
      const readyCourse = existingCourses.find(c => c.status === 'ready')
      if (readyCourse) {
        return NextResponse.json({
          success: true,
          courseId: readyCourse.id,
          status: 'ready',
          message: 'Course already exists for this document.',
          alreadyExists: true
        })
      }
    }

    // ============================================
    // START BACKGROUND GENERATION
    // ============================================

    // Create generation manager
    const manager = createCourseGenerationManager()

    // Start generation in background (don't await)
    // The function will run until maxDuration is reached
    manager.generateCourse({
      documentId: document.id,
      userId: user.id,
      documentContent: document.document_content,
      documentTitle: document.title,
      customInstructions,
      onProgress: async (progress) => {
        // Update progress in database
        try {
          await supabase
            .from('courses')
            .update({ generation_progress: progress })
            .eq('document_id', document.id)
            .eq('user_id', user.id)
            .eq('status', 'generating')
        } catch (err) {
          console.error('[CourseGeneration] Failed to update progress:', err)
        }
      }
    }).catch(async (error) => {
      // Handle generation errors in background
      console.error('[CourseGeneration] Background generation failed:', error)

      // Update course status to error
      try {
        await supabase
          .from('courses')
          .update({
            status: 'error',
            generation_progress: {
              phase: 'error',
              percentage: 0,
              currentStep: 'Generation failed',
              error: error.message
            }
          })
          .eq('document_id', document.id)
          .eq('user_id', user.id)
          .eq('status', 'generating')
      } catch (dbError) {
        console.error('[CourseGeneration] Failed to update error status:', dbError)
      }
    })

    // Return immediately with course ID and generating status
    // Find the course that was just created by the generation manager
    // Note: There's a race condition here - the course might not exist yet
    // So we wait briefly for the initial course record
    await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay

    const { data: course } = await supabase
      .from('courses')
      .select('id, title, status, generation_progress')
      .eq('document_id', document.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!course) {
      return NextResponse.json(
        { error: 'Failed to start course generation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      courseId: course.id,
      status: course.status,
      progress: course.generation_progress,
      message: 'Course generation started. Poll /api/courses/{courseId}/status for progress.'
    })

  } catch (error: unknown) {
    console.error('[CourseGeneration] API error:', error)

    // Special handling for model overload errors
    if (error instanceof AllModelsOverloadedError || (error && typeof error === 'object' && 'name' in error && error.name === 'AllModelsOverloadedError')) {
      return NextResponse.json({
        error: 'All AI models are currently overloaded',
        errorType: 'all_models_overloaded',
        retryable: true,
        message: 'Our AI models are experiencing high demand. Please try again in a few minutes.'
      }, { status: 503 })
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to start course generation', details: errorMessage },
      { status: 500 }
    )
  }
}
