import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { documentId } = await req.json()

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
    }

    // Fetch document info
    const { data: doc } = await supabase
      .from('documents')
      .select('id, title')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Count review_cards by source_type AND check outputs table for unsynced tools
    const [flashcardResult, quizResult, mindmapResult, outputsResult] = await Promise.all([
      supabase
        .from('review_cards')
        .select('source_set_id', { count: 'exact', head: false })
        .eq('user_id', user.id)
        .eq('document_id', documentId)
        .eq('source_type', 'flashcard'),
      supabase
        .from('review_cards')
        .select('source_set_id', { count: 'exact', head: false })
        .eq('user_id', user.id)
        .eq('document_id', documentId)
        .eq('source_type', 'quiz'),
      supabase
        .from('review_cards')
        .select('source_set_id', { count: 'exact', head: false })
        .eq('user_id', user.id)
        .eq('document_id', documentId)
        .eq('source_type', 'mindmap'),
      // Also check outputs table for generated but unsynced study tools
      supabase
        .from('outputs')
        .select('id, type')
        .eq('document_id', documentId)
        .in('type', ['flashcards', 'quiz', 'mind_map']),
    ])

    // Get unique source set IDs for each type from review_cards
    const uniqueFlashcardSets = new Set((flashcardResult.data || []).map((r) => r.source_set_id))
    const uniqueQuizSets = new Set((quizResult.data || []).map((r) => r.source_set_id))
    const uniqueMindmapSets = new Set((mindmapResult.data || []).map((r) => r.source_set_id))

    // Count outputs (generated study tools, including unsynced ones)
    const outputs = outputsResult.data || []
    const outputFlashcards = outputs.filter(o => o.type === 'flashcards').length
    const outputQuizzes = outputs.filter(o => o.type === 'quiz').length
    const outputMindmaps = outputs.filter(o => o.type === 'mind_map').length

    return NextResponse.json({
      document: { id: doc.id, title: doc.title },
      tools: {
        flashcards: {
          setCount: Math.max(uniqueFlashcardSets.size, outputFlashcards),
          cardCount: flashcardResult.data?.length || 0,
          setIds: Array.from(uniqueFlashcardSets),
        },
        quizzes: {
          setCount: Math.max(uniqueQuizSets.size, outputQuizzes),
          cardCount: quizResult.data?.length || 0,
          setIds: Array.from(uniqueQuizSets),
        },
        mindmaps: {
          setCount: Math.max(uniqueMindmapSets.size, outputMindmaps),
          cardCount: mindmapResult.data?.length || 0,
          setIds: Array.from(uniqueMindmapSets),
        },
      },
      totalCards: (flashcardResult.data?.length || 0) + (quizResult.data?.length || 0) + (mindmapResult.data?.length || 0),
      // Include output IDs for potential sync
      unsyncedOutputs: outputs.filter(o => {
        if (o.type === 'flashcards') return !uniqueFlashcardSets.has(o.id)
        if (o.type === 'quiz') return !uniqueQuizSets.has(o.id)
        if (o.type === 'mind_map') return !uniqueMindmapSets.has(o.id)
        return false
      }).map(o => ({ id: o.id, type: o.type })),
    })
  } catch (error) {
    console.error('[DiscoverTools] Error:', error)
    return NextResponse.json({ error: 'Failed to discover tools' }, { status: 500 })
  }
}
