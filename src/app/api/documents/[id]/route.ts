import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabase as serviceSupabase } from '@/lib/supabase'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch storage_path before deleting (verify ownership at the same time)
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete the DB record (RLS ensures user owns it)
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Failed to delete document:', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    // Clean up storage file using service role (Storage API, not direct SQL)
    if (doc.storage_path) {
      const { error: storageError } = await serviceSupabase.storage
        .from('documents')
        .remove([doc.storage_path])

      if (storageError) {
        // Non-fatal — DB record is already gone, just log it
        console.error('Failed to delete storage file:', storageError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
