import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface StudyToolsFetchRequest {
  documentId?: string
  conversationId?: string
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user first
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in to fetch study tools' },
        { status: 401 }
      )
    }

    console.log('[StudyTools] Fetch request from user:', user.id)

    const { documentId, conversationId }: StudyToolsFetchRequest = await req.json()

    console.log('[StudyTools] Fetch request:', { documentId, conversationId })

    let outputs = []

    if (documentId) {
      // Fetch study tools for specific document (RLS will filter by user)
      // Also verify user owns the document explicitly
      const { data: document } = await supabase
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('user_id', user.id)
        .single()

      if (!document) {
        return NextResponse.json(
          { error: 'Document not found or access denied' },
          { status: 404 }
        )
      }

      const { data, error } = await supabase
        .from('outputs')
        .select('*')
        .eq('document_id', documentId)
        .eq('overall', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[StudyTools] Database fetch error:', error)
        return NextResponse.json(
          { error: 'Failed to fetch study tools from database' },
          { status: 500 }
        )
      }

      outputs = data || []
    } else if (conversationId) {
      // Verify user owns the conversation first
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id, document_id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single()

      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found or access denied' },
          { status: 404 }
        )
      }

      // Fetch outputs directly linked to this conversation OR from the associated document
      // This supports both conversation-only study tools and document-based study tools
      const { data, error } = await supabase
        .from('outputs')
        .select('*')
        .or(`conversation_id.eq.${conversationId}${conversation.document_id ? `,document_id.eq.${conversation.document_id}` : ''}`)
        .eq('overall', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[StudyTools] Database fetch error:', error)
        return NextResponse.json(
          { error: 'Failed to fetch study tools from database' },
          { status: 500 }
        )
      }

      outputs = data || []
      console.log('[StudyTools] Found', outputs.length, 'outputs for conversation:', conversationId)
    }

    // If no documentId or conversationId provided,
    // fetch all study tools for user (dashboard view)
    if (!documentId && !conversationId) {
      console.log('[StudyTools] Fetching all study tools for user\'s dashboard view')

      // Get user's document IDs and conversation IDs
      const { data: userDocs } = await supabase
        .from('documents')
        .select('id')
        .eq('user_id', user.id)

      const { data: userConvs } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)

      const userDocIds = (userDocs || []).map(d => d.id)
      const userConvIds = (userConvs || []).map(c => c.id)

      // Fetch outputs from both documents and conversations
      if (userDocIds.length > 0 || userConvIds.length > 0) {
        const conditions: string[] = []

        if (userDocIds.length > 0) {
          conditions.push(`document_id.in.(${userDocIds.join(',')})`)
        }
        
        if (userConvIds.length > 0) {
          conditions.push(`conversation_id.in.(${userConvIds.join(',')})`)
        }

        const { data, error } = await supabase
          .from('outputs')
          .select('*')
          .or(conditions.join(','))
          .eq('overall', true)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[StudyTools] Database fetch error:', error)
          return NextResponse.json(
            { error: 'Failed to fetch study tools from database' },
            { status: 500 }
          )
        }

        outputs = data || []
        console.log('[StudyTools] Loaded', outputs.length, 'study tools for user dashboard (', userDocIds.length, 'docs,', userConvIds.length, 'convs)')
      } else {
        console.log('[StudyTools] User has no documents or conversations yet')
      }
    }

    // Transform database outputs to frontend format
    const studyTools = outputs.map(output => {
      const payload = output.payload || {}

      // Map database types back to frontend types
      const frontendType = output.type === 'summary' ? 'smart-summary' :
                          output.type === 'notes' ? 'smart-notes' :
                          output.type === 'study_guide' ? 'study-guide' :
                          output.type === 'mind_map' ? 'mind-map' : output.type

      return {
        id: output.id, // Use database ID
        type: frontendType,
        title: payload.title || 'Untitled',
        content: payload.content || '',
        createdAt: output.created_at, // Keep as ISO string from database
        // Use database columns as source of truth, fall back to payload
        documentId: output.document_id || payload.documentId || null,
        conversationId: output.conversation_id || payload.conversationId || null,
        isGenerating: false,
        generationProgress: 100,
        metadata: payload.metadata || {}
      }
    })

    console.log('[StudyTools] Fetched', studyTools.length, 'study tools from database')

    return NextResponse.json({
      success: true,
      userId: user.id,
      studyTools,
      count: studyTools.length
    })

  } catch (error) {
    console.error('[StudyTools] Fetch failed:', error)

    return NextResponse.json(
      {
        error: 'Failed to fetch study tools. Please try again.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
