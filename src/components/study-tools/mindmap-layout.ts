import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { MindMapData, MindMapNodeData } from '@/types/mindmap'

// 8-color palette for top-level branches
const BRANCH_COLORS = [
  { bg: '#0d9488', light: '#ccfbf1', mid: '#5eead4', text: '#134e4a' }, // teal
  { bg: '#6366f1', light: '#e0e7ff', mid: '#a5b4fc', text: '#312e81' }, // indigo
  { bg: '#f59e0b', light: '#fef3c7', mid: '#fcd34d', text: '#78350f' }, // amber
  { bg: '#ec4899', light: '#fce7f3', mid: '#f9a8d4', text: '#831843' }, // pink
  { bg: '#8b5cf6', light: '#ede9fe', mid: '#c4b5fd', text: '#4c1d95' }, // violet
  { bg: '#10b981', light: '#d1fae5', mid: '#6ee7b7', text: '#064e3b' }, // emerald
  { bg: '#f97316', light: '#ffedd5', mid: '#fdba74', text: '#7c2d12' }, // orange
  { bg: '#06b6d4', light: '#cffafe', mid: '#67e8f9', text: '#164e63' }, // cyan
]

export interface FlowNodeData {
  label: string
  detail: string
  emoji?: string
  depth: number
  branchIndex: number
  branchColor: typeof BRANCH_COLORS[number]
  nodeType: 'central' | 'branch' | 'sub-branch' | 'leaf'
  childCount: number
  isCollapsed?: boolean
  hiddenChildCount?: number
  path: string[]
  [key: string]: unknown
}

function getNodeType(depth: number, hasChildren: boolean): 'central' | 'branch' | 'sub-branch' | 'leaf' {
  if (depth === 0) return 'central'
  if (depth === 1) return 'branch'
  if (hasChildren) return 'sub-branch'
  return 'leaf'
}

function getNodeDimensions(nodeType: string): { width: number; height: number } {
  switch (nodeType) {
    case 'central': return { width: 220, height: 80 }
    case 'branch': return { width: 180, height: 64 }
    case 'sub-branch': return { width: 160, height: 56 }
    case 'leaf': return { width: 140, height: 48 }
    default: return { width: 160, height: 56 }
  }
}

function flattenTree(
  nodes: MindMapNodeData[],
  parentId: string,
  depth: number,
  branchIndex: number,
  branchColor: typeof BRANCH_COLORS[number],
  path: string[],
  result: { nodes: Node<FlowNodeData>[]; edges: Edge[] }
) {
  for (const node of nodes) {
    const hasChildren = Boolean(node.children && node.children.length > 0)
    const nodeType = getNodeType(depth, hasChildren)
    const dims = getNodeDimensions(nodeType)

    const flowNode: Node<FlowNodeData> = {
      id: node.id,
      type: nodeType,
      position: { x: 0, y: 0 }, // Will be set by dagre
      data: {
        label: node.label,
        detail: node.detail,
        emoji: node.emoji,
        depth,
        branchIndex,
        branchColor,
        nodeType,
        childCount: node.children?.length || 0,
        path: [...path, node.label],
      },
      style: { width: dims.width, height: dims.height },
    }

    result.nodes.push(flowNode)

    const edge: Edge = {
      id: `e-${parentId}-${node.id}`,
      source: parentId,
      target: node.id,
      type: 'mindMapEdge',
      data: { branchColor, depth },
    }
    result.edges.push(edge)

    if (node.children && node.children.length > 0) {
      flattenTree(
        node.children,
        node.id,
        depth + 1,
        branchIndex,
        branchColor,
        [...path, node.label],
        result
      )
    }
  }
}

function applyDagreLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  })

  for (const node of nodes) {
    const dims = getNodeDimensions(node.data.nodeType)
    g.setNode(node.id, { width: dims.width, height: dims.height })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id)
    const dims = getNodeDimensions(node.data.nodeType)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - dims.width / 2,
        y: nodeWithPosition.y - dims.height / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

function applyRadialLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge[]
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  // First apply dagre for tree structure
  const { nodes: treeNodes } = applyDagreLayout(nodes, edges, 'TB')

  // Find center node
  const centerNode = treeNodes.find(n => n.data.depth === 0)
  if (!centerNode) return { nodes: treeNodes, edges }

  const centerX = centerNode.position.x + 110
  const centerY = centerNode.position.y + 40

  // Group nodes by depth
  const nodesByDepth = new Map<number, Node<FlowNodeData>[]>()
  for (const node of treeNodes) {
    const depth = node.data.depth
    if (!nodesByDepth.has(depth)) nodesByDepth.set(depth, [])
    nodesByDepth.get(depth)!.push(node)
  }

  // Place each depth ring in a circle
  const radii = [0, 250, 420, 560, 680]
  const layoutedNodes = treeNodes.map((node) => {
    if (node.data.depth === 0) {
      return { ...node, position: { x: centerX - 110, y: centerY - 40 } }
    }

    const depthNodes = nodesByDepth.get(node.data.depth) || []
    const index = depthNodes.indexOf(node)
    const total = depthNodes.length
    const radius = radii[Math.min(node.data.depth, radii.length - 1)]

    // Distribute evenly around the circle
    const angle = (2 * Math.PI * index) / total - Math.PI / 2
    const dims = getNodeDimensions(node.data.nodeType)

    return {
      ...node,
      position: {
        x: centerX + radius * Math.cos(angle) - dims.width / 2,
        y: centerY + radius * Math.sin(angle) - dims.height / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

function applyOrganicLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge[]
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  // Start with dagre, then add random offset for organic feel
  const { nodes: treeNodes } = applyDagreLayout(nodes, edges, 'LR')

  const layoutedNodes = treeNodes.map((node) => {
    if (node.data.depth === 0) return node

    // Add random-ish offset based on node id hash
    const hash = node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    const offsetX = ((hash % 30) - 15)
    const offsetY = ((hash * 7 % 30) - 15)

    return {
      ...node,
      position: {
        x: node.position.x + offsetX,
        y: node.position.y + offsetY,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

export function transformMindMapToFlow(
  data: MindMapData,
  style: 'radial' | 'tree' | 'organic' = 'radial'
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const result: { nodes: Node<FlowNodeData>[]; edges: Edge[] } = {
    nodes: [],
    edges: [],
  }

  // Add central node
  const centralDims = getNodeDimensions('central')
  const centralNode: Node<FlowNodeData> = {
    id: 'central',
    type: 'central',
    position: { x: 0, y: 0 },
    data: {
      label: data.centralTopic,
      detail: data.title,
      emoji: '🎯',
      depth: 0,
      branchIndex: -1,
      branchColor: BRANCH_COLORS[0],
      nodeType: 'central',
      childCount: data.branches.length,
      path: [data.centralTopic],
    },
    style: { width: centralDims.width, height: centralDims.height },
  }
  result.nodes.push(centralNode)

  // Add all branches
  data.branches.forEach((branch, index) => {
    const color = BRANCH_COLORS[index % BRANCH_COLORS.length]
    const hasChildren = Boolean(branch.children && branch.children.length > 0)
    const nodeType = getNodeType(1, hasChildren)
    const dims = getNodeDimensions(nodeType)

    const branchNode: Node<FlowNodeData> = {
      id: branch.id,
      type: nodeType,
      position: { x: 0, y: 0 },
      data: {
        label: branch.label,
        detail: branch.detail,
        emoji: branch.emoji,
        depth: 1,
        branchIndex: index,
        branchColor: color,
        nodeType,
        childCount: branch.children?.length || 0,
        path: [data.centralTopic, branch.label],
      },
      style: { width: dims.width, height: dims.height },
    }
    result.nodes.push(branchNode)

    result.edges.push({
      id: `e-central-${branch.id}`,
      source: 'central',
      target: branch.id,
      type: 'mindMapEdge',
      data: { branchColor: color, depth: 0 },
    })

    if (branch.children && branch.children.length > 0) {
      flattenTree(
        branch.children,
        branch.id,
        2,
        index,
        color,
        [data.centralTopic, branch.label],
        result
      )
    }
  })

  // Apply layout
  switch (style) {
    case 'radial':
      return applyRadialLayout(result.nodes, result.edges)
    case 'tree':
      return applyDagreLayout(result.nodes, result.edges, 'TB')
    case 'organic':
      return applyOrganicLayout(result.nodes, result.edges)
    default:
      return applyRadialLayout(result.nodes, result.edges)
  }
}
