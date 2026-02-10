import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createFastCourseGenerator } from '@/lib/fast-course-generator'

export const maxDuration = 60

/**
 * POST /api/courses/generate-fast
 * 
 * Fast course generation - returns immediately after outline creation
 * Units are generated in background and database updates in real-time
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { documentId, customInstructions, forceNew } = await request.json()
    
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }
    
    // Fetch document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, document_content, user_id')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()
    
    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    
    if (!document.document_content?.trim()) {
      return NextResponse.json(
        { error: 'Document has no content' },
        { status: 400 }
      )
    }
    
    // Check for existing course (skip if forceNew is true)
    if (!forceNew) {
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id, status')
        .eq('document_id', documentId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (existingCourse) {
        if (existingCourse.status === 'generating') {
          return NextResponse.json({
            success: true,
            courseId: existingCourse.id,
            status: 'generating',
            message: 'Course already being generated'
          })
        }
        if (existingCourse.status === 'ready') {
          return NextResponse.json({
            success: true,
            courseId: existingCourse.id,
            status: 'ready',
            message: 'Course already exists'
          })
        }
      }
    }
    
    // Create fast generator
    const generator = createFastCourseGenerator()
    
    // Step 1: Generate outline and create course shell (fast, ~5-10s)
    const { courseId, outline } = await generator.generateOutline(
      document.document_content,
      document.title,
      user.id,
      document.id
    )
    
    // Step 2: Start unit generation in background (don't await)
    generator.generateUnitsParallel(
      courseId,
      outline,
      document.document_content,
      3 // Generate 3 units at a time
    ).catch(error => {
      console.error('[FastGen] Background generation error:', error)
      // Update course status to error
      supabase
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
        .eq('id', courseId)
    })
    
    // Return immediately with course ID
    return NextResponse.json({
      success: true,
      courseId,
      status: 'generating',
      outline: {
        title: outline.title,
        units: outline.units.length,
        estimatedMinutes: outline.estimatedMinutes
      },
      message: 'Course created. Units generating in background.'
    })
    
  } catch (error) {
    console.error('[FastGen] API error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to generate course', details: message },
      { status: 500 }
    )
  }
}
