import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sourceSetId = new URL(req.url).searchParams.get('source_set_id')
    if (!sourceSetId) {
      return NextResponse.json({ error: 'Missing source_set_id' }, { status: 400 })
    }

    // Try mind_map_sets table first (mind maps generated via the mindmap store)
    const { data: mindMapSet } = await supabase
      .from('mind_map_sets')
      .select('id, title, mind_map_data, options, metadata, document_id, created_at')
      .eq('id', sourceSetId)
      .eq('user_id', user.id)
      .single()

    if (mindMapSet) {
      const mindMapData = typeof mindMapSet.mind_map_data === 'string'
        ? JSON.parse(mindMapSet.mind_map_data)
        : mindMapSet.mind_map_data
      const options = typeof mindMapSet.options === 'string'
        ? JSON.parse(mindMapSet.options)
        : mindMapSet.options
      const metadata = typeof mindMapSet.metadata === 'string'
        ? JSON.parse(mindMapSet.metadata)
        : mindMapSet.metadata

      return NextResponse.json({
        mindMapSet: {
          id: mindMapSet.id,
          title: mindMapData?.title || mindMapSet.title || 'Mind Map',
          mindMapData,
          options: options || { depth: 3, detailLevel: 'brief', visualStyle: 'radial' },
          createdAt: mindMapSet.created_at || new Date().toISOString(),
          metadata: metadata || {
            totalNodes: mindMapData?.metadata?.totalNodes || 0,
            maxDepth: mindMapData?.metadata?.maxDepth || 0,
            generationTime: 0, model: '', sourceContentLength: 0,
          },
          documentId: mindMapSet.document_id,
        },
      })
    }

    // Fallback: try outputs table (mind maps generated via agent/study tools)
    const { data: output } = await supabase
      .from('outputs')
      .select('id, payload, document_id, created_at')
      .eq('id', sourceSetId)
      .eq('type', 'mind_map')
      .single()

    if (output) {
      const payload = typeof output.payload === 'string'
        ? JSON.parse(output.payload)
        : output.payload

      // The outputs payload structure: { mindMapData: {...}, options: {...}, metadata: {...} }
      // Or sometimes the mindMapData is directly in content field
      const mindMapData = payload?.mindMapData
        || (payload?.content ? (typeof payload.content === 'string' ? tryParseJSON(payload.content) : payload.content) : null)
        || payload

      // Validate the data has the expected structure
      if (!mindMapData?.branches && !mindMapData?.centralTopic) {
        console.error('[MindmapData] Invalid mind map data structure from outputs:', Object.keys(mindMapData || {}))
        return NextResponse.json({ error: 'Invalid mind map data' }, { status: 404 })
      }

      const totalNodes = countNodes(mindMapData.branches || [])
      const maxDepth = getMaxDepth(mindMapData.branches || [])

      return NextResponse.json({
        mindMapSet: {
          id: output.id,
          title: mindMapData.title || mindMapData.centralTopic || 'Mind Map',
          mindMapData,
          options: payload?.options || { depth: 3, detailLevel: 'brief', visualStyle: 'radial' },
          createdAt: output.created_at || new Date().toISOString(),
          metadata: {
            totalNodes,
            maxDepth,
            generationTime: payload?.metadata?.duration || 0,
            model: payload?.metadata?.model || '',
            sourceContentLength: payload?.metadata?.sourceContentLength || 0,
          },
          documentId: output.document_id,
        },
      })
    }

    return NextResponse.json({ error: 'Mind map not found' }, { status: 404 })
  } catch (error) {
    console.error('[MindmapData] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function tryParseJSON(str: string): unknown {
  try { return JSON.parse(str) } catch { return null }
}

interface BranchNode { children?: BranchNode[] }

function countNodes(branches: BranchNode[]): number {
  let count = 0
  for (const b of branches) {
    count++
    if (b.children) count += countNodes(b.children)
  }
  return count
}

function getMaxDepth(branches: BranchNode[], depth = 1): number {
  let max = depth
  for (const b of branches) {
    if (b.children?.length) {
      max = Math.max(max, getMaxDepth(b.children, depth + 1))
    }
  }
  return max
}
