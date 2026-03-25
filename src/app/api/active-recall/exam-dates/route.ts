import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — Fetch user's exam dates
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: exams, error } = await supabase
      .from('exam_dates')
      .select('*')
      .eq('user_id', user.id)
      .order('exam_date', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch exams' }, { status: 500 })
    }

    return NextResponse.json({ exams: exams || [] })
  } catch (error) {
    console.error('[ActiveRecall] Exam dates GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — Add a new exam date
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { title, examDate, documentId, reminderDaysBefore } = await req.json()

    if (!title || !examDate) {
      return NextResponse.json({ error: 'Title and exam date are required' }, { status: 400 })
    }

    const { data: exam, error } = await supabase
      .from('exam_dates')
      .insert({
        user_id: user.id,
        title,
        exam_date: examDate,
        document_id: documentId || null,
        reminder_days_before: reminderDaysBefore || [7, 3, 1],
      })
      .select()
      .single()

    if (error) {
      console.error('[ActiveRecall] Exam date insert error:', error)
      return NextResponse.json({ error: 'Failed to add exam' }, { status: 500 })
    }

    return NextResponse.json({ exam })
  } catch (error) {
    console.error('[ActiveRecall] Exam dates POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — Remove an exam date
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Exam ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('exam_dates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete exam' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ActiveRecall] Exam dates DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
