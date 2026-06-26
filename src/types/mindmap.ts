export interface MindMapOptions {
  depth?: 2 | 3 | 4
  detailLevel?: 'keywords' | 'brief' | 'detailed'
  focusArea?: string
  visualStyle?: 'radial' | 'tree' | 'organic'
  customInstructions?: string
}

export interface MindMapNodeData {
  id: string
  label: string
  detail: string
  emoji?: string
  children?: MindMapNodeData[]
}

export interface MindMapData {
  title: string
  centralTopic: string
  branches: MindMapNodeData[]
  metadata?: { totalNodes: number; maxDepth: number }
}

export interface MindMapSet {
  id: string
  title: string
  mindMapData: MindMapData
  options: MindMapOptions
  createdAt: Date
  documentId?: string
  conversationId?: string
  metadata: {
    totalNodes: number
    maxDepth: number
    generationTime: number
    model: string
    sourceContentLength: number
    isGenerating?: boolean
    generationProgress?: number
    statusMessage?: string
  }
}
