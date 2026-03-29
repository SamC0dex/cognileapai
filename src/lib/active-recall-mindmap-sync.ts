import type { MindMapData, MindMapNodeData } from '@/types/mindmap'
import type { SyncCardPayload, SyncRequest } from '@/types/active-recall'

/**
 * Traverses a MindMapData tree and generates review cards.
 *
 * Card types:
 * 1. Branch Recall — "What are the main branches of [topic]?" (nodes with children)
 * 2. Node Completion — "In [topic], what connects to [parent]?" (parent→child)
 * 3. Detail Recall — "What is [label]?" (leaf nodes with detail text)
 */
export function buildMindMapSyncPayload(
  mindMapSetId: string,
  mindMapData: MindMapData,
  documentId?: string
): SyncRequest {
  const cards: SyncCardPayload[] = []

  // 1. Top-level branch recall: "What are the main branches of [central topic]?"
  if (mindMapData.branches.length > 0) {
    cards.push({
      id: `${mindMapSetId}_branches`,
      question: `What are the main branches/topics of "${mindMapData.centralTopic}"?`,
      answer: mindMapData.branches.map((b) => `${b.emoji ? b.emoji + ' ' : ''}${b.label}`).join(', '),
      topic: mindMapData.centralTopic,
      difficulty: 'easy',
    })
  }

  // Recursively traverse all nodes
  for (const branch of mindMapData.branches) {
    traverseNode(branch, mindMapData.centralTopic, cards, mindMapSetId)
  }

  return {
    sourceType: 'mindmap',
    sourceSetId: mindMapSetId,
    documentId,
    cards,
  }
}

function traverseNode(
  node: MindMapNodeData,
  parentLabel: string,
  cards: SyncCardPayload[],
  setId: string
) {
  const hasChildren = node.children && node.children.length > 0

  // 2. Node Completion — parent with children
  if (hasChildren) {
    cards.push({
      id: `${setId}_${node.id}_children`,
      question: `In "${parentLabel}", what are the sub-topics of "${node.label}"?`,
      answer: node.children!.map((c) => `${c.emoji ? c.emoji + ' ' : ''}${c.label}`).join(', '),
      topic: node.label,
      difficulty: 'medium',
    })
  }

  // 3. Detail Recall — nodes with meaningful detail text
  if (node.detail && node.detail.trim().length > 5) {
    cards.push({
      id: `${setId}_${node.id}_detail`,
      question: `What is "${node.label}"?`,
      answer: node.detail,
      topic: parentLabel,
      difficulty: hasChildren ? 'medium' : 'easy',
    })
  }

  // Recurse into children
  if (hasChildren) {
    for (const child of node.children!) {
      traverseNode(child, node.label, cards, setId)
    }
  }
}

/**
 * Sync a mind map set to active recall via the API.
 */
export async function syncMindMapToActiveRecall(
  mindMapSetId: string,
  mindMapData: MindMapData,
  documentId?: string,
  planId?: string
): Promise<{ synced: number; existing: number; total: number } | null> {
  const payload = buildMindMapSyncPayload(mindMapSetId, mindMapData, documentId)

  try {
    const response = await fetch('/api/active-recall/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, planId }),
    })

    if (!response.ok) {
      console.warn('[ActiveRecall] Mind map sync failed:', response.status)
      return null
    }

    return await response.json()
  } catch (error) {
    console.warn('[ActiveRecall] Mind map sync error:', error)
    return null
  }
}
