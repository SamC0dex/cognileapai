'use client'

import React, { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  RotateCcw,
  TreePine,
  Circle,
  Shuffle,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { MindMapSet } from '@/types/mindmap'
import { transformMindMapToFlow, type FlowNodeData } from './mindmap-layout'
import { nodeTypes } from './mindmap-nodes'
import { edgeTypes } from './mindmap-edges'

interface MindMapViewerProps {
  mindMapSet: MindMapSet
  title: string
  onClose?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  className?: string
}

const layoutOptions = [
  { value: 'radial' as const, label: 'Radial', icon: Circle },
  { value: 'tree' as const, label: 'Tree', icon: TreePine },
  { value: 'organic' as const, label: 'Organic', icon: Shuffle },
]

export const MindMapViewer: React.FC<MindMapViewerProps> = ({
  mindMapSet,
  title,
  onClose,
  isFullscreen,
  onToggleFullscreen,
  className,
}) => {
  const [layoutStyle, setLayoutStyle] = useState<'radial' | 'tree' | 'organic'>(
    mindMapSet.options.visualStyle || 'radial'
  )
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null)

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => transformMindMapToFlow(mindMapSet.mindMapData, layoutStyle),
    [mindMapSet.mindMapData, layoutStyle]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes/edges when layout changes
  React.useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = transformMindMapToFlow(
      mindMapSet.mindMapData,
      layoutStyle
    )
    setNodes(newNodes)
    setEdges(newEdges)
    setSelectedNode(null)
  }, [layoutStyle, mindMapSet.mindMapData, setNodes, setEdges])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node as Node<FlowNodeData>)
    },
    []
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleExportPNG = useCallback(async () => {
    try {
      const { toPng } = await import('html-to-image')
      const element = document.querySelector('.react-flow') as HTMLElement
      if (!element) return

      const dataUrl = await toPng(element, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        filter: (node) => {
          // Exclude minimap and controls from export
          if (node.classList?.contains('react-flow__minimap')) return false
          if (node.classList?.contains('react-flow__controls')) return false
          return true
        },
      })

      const { saveAs } = await import('file-saver')
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      saveAs(blob, `${title.replace(/[^a-zA-Z0-9]/g, '_')}_mind_map.png`)
    } catch (error) {
      console.error('Failed to export mind map:', error)
    }
  }, [title])

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-teal-50 to-transparent dark:from-teal-900/20">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-xl bg-teal-100 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800">
            <span className="text-lg">🗺️</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{title}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{mindMapSet.metadata.totalNodes} nodes</span>
              <span>·</span>
              <span>Depth {mindMapSet.metadata.maxDepth}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Layout toggle */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 mr-2">
            {layoutOptions.map((opt) => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.value}
                  onClick={() => setLayoutStyle(opt.value)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all',
                    layoutStyle === opt.value
                      ? 'bg-teal-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                  title={opt.label}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              )
            })}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="w-7 h-7"
            onClick={handleExportPNG}
            title="Export as PNG"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>

          {onToggleFullscreen && (
            <Button
              variant="outline"
              size="icon"
              className="w-7 h-7"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
          )}

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              onClick={onClose}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          minZoom={0.1}
          maxZoom={2}
          attributionPosition="bottom-left"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
          <Controls
            showInteractive={false}
            className="!bg-background/90 !border-border !shadow-lg !rounded-lg"
          />
          <MiniMap
            nodeColor={(node) => {
              const d = node.data as FlowNodeData
              if (d.nodeType === 'central') return '#0d9488'
              return d.branchColor?.bg || '#94a3b8'
            }}
            className="!bg-background/90 !border-border !shadow-lg !rounded-lg"
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>

        {/* Detail Panel */}
        <AnimatePresence>
          {selectedNode && selectedNode.data && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="absolute top-4 right-4 w-72 bg-background/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-4 z-10"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {(selectedNode.data as FlowNodeData).emoji && (
                    <span className="text-2xl">{(selectedNode.data as FlowNodeData).emoji}</span>
                  )}
                  <h4 className="font-semibold text-sm">{(selectedNode.data as FlowNodeData).label}</h4>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 hover:bg-muted rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Breadcrumb path */}
              <div className="flex flex-wrap items-center gap-1 mb-3 text-[10px] text-muted-foreground">
                {((selectedNode.data as FlowNodeData).path || []).map((p: string, i: number, arr: string[]) => (
                  <React.Fragment key={i}>
                    <span className={cn(i === arr.length - 1 && 'font-medium text-foreground')}>
                      {p}
                    </span>
                    {i < arr.length - 1 && <span>→</span>}
                  </React.Fragment>
                ))}
              </div>

              {/* Detail text */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {(selectedNode.data as FlowNodeData).detail}
              </p>

              {/* Node info */}
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>Depth {(selectedNode.data as FlowNodeData).depth}</span>
                {(selectedNode.data as FlowNodeData).childCount > 0 && (
                  <span>{(selectedNode.data as FlowNodeData).childCount} children</span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
