import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Service role client for background operations only
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface StudyToolDeleteRequest {
  id: string
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user first
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in to delete study tools' },
        { status: 401 }
      )
    }

    console.log('[StudyTools] Delete request from user:', user.id)

    const { id }: StudyToolDeleteRequest = await req.json()

    console.log('[StudyTools] Delete request:', { id })

    // Validate request
    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      )
    }

    // Verify Supabase client is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      )
    }

    // First, verify the record exists and user owns it through document ownership
    console.log('[StudyTools] Verifying record exists and user owns it with ID:', id)
    const { data: existingRecord, error: fetchError } = await supabase
      .from('outputs')
      .select('id, payload, document_id')
      .eq('id', id)
      .single()

    console.log('[StudyTools] Verification result:', { existingRecord, fetchError })

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found, which is handled below
      console.error('[StudyTools] Failed to verify record:', fetchError)
      return NextResponse.json(
        { error: 'Failed to verify study tool', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!existingRecord) {
      console.log('[StudyTools] Record not found or access denied')
      return NextResponse.json({
        error: 'Study tool not found or access denied'
      }, { status: 404 })
    }

    // Verify user owns the document this output belongs to
    if (existingRecord.document_id) {
      const { data: document } = await supabase
        .from('documents')
        .select('id')
        .eq('id', existingRecord.document_id)
        .eq('user_id', user.id)
        .single()

      if (!document) {
        return NextResponse.json({
          error: 'Access denied - You do not own this study tool'
        }, { status: 403 })
      }
    }

    // Delete the record from the database (use service role since we've verified ownership)
    console.log('[StudyTools] Deleting record with ID:', id)
    const { error: deleteError } = await serviceSupabase
      .from('outputs')
      .delete()
      .eq('id', id)

    console.log('[StudyTools] Delete result:', { deleteError })

    if (deleteError) {
      console.error('[StudyTools] Failed to delete study tool:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete study tool from database', details: deleteError.message },
        { status: 500 }
      )
    }

    const { error: reviewDeleteError } = await serviceSupabase
      .from('review_cards')
      .delete()
      .eq('user_id', user.id)
      .eq('source_set_id', id)

    if (reviewDeleteError) {
      console.warn('[StudyTools] Deleted output but failed to delete linked review cards:', reviewDeleteError)
    }

    console.log(`[StudyTools] Successfully deleted study tool: ${id}`)

    return NextResponse.json({
      success: true,
      message: 'Study tool deleted successfully'
    })

  } catch (error) {
    console.error('[StudyTools] Delete failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete study tool',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
