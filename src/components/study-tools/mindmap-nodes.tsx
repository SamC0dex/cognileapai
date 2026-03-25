'use client'

import React from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { FlowNodeData } from './mindmap-layout'

function getOpacityForDepth(depth: number): number {
  switch (depth) {
    case 0: return 1
    case 1: return 0.95
    case 2: return 0.85
    case 3: return 0.75
    default: return 0.65
  }
}

export const CentralNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as FlowNodeData
  return (
    <div
      className="relative flex items-center justify-center rounded-2xl px-6 py-4 shadow-xl border-2 border-white/30"
      style={{
        background: 'linear-gradient(135deg, #0d9488, #14b8a6, #2dd4bf)',
        minWidth: 200,
        minHeight: 72,
      }}
    >
      <Handle type="source" position={Position.Bottom} className="!bg-teal-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-teal-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Left} className="!bg-teal-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Top} className="!bg-teal-400 !w-2 !h-2 !border-0" />

      <div className="text-center">
        {d.emoji && <span className="text-xl mr-1">{d.emoji}</span>}
        <span className="text-white font-bold text-sm leading-tight">{d.label}</span>
      </div>

      {/* Glow effect */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          boxShadow: '0 0 30px rgba(20, 184, 166, 0.4), 0 0 60px rgba(20, 184, 166, 0.15)',
        }}
      />
    </div>
  )
}

export const BranchNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as FlowNodeData
  const opacity = getOpacityForDepth(d.depth)

  return (
    <div
      className="relative flex items-center rounded-xl px-4 py-3 shadow-lg border border-white/20 cursor-pointer transition-transform hover:scale-[1.03]"
      style={{
        background: d.branchColor.bg,
        opacity,
        minWidth: 160,
        minHeight: 56,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/50 !w-2 !h-2 !border-0" />
      <Handle type="target" position={Position.Left} className="!bg-white/50 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-white/50 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-white/50 !w-2 !h-2 !border-0" />

      <div className="flex items-center gap-2 w-full">
        {d.emoji && <span className="text-base flex-shrink-0">{d.emoji}</span>}
        <span className="text-white font-semibold text-xs leading-tight line-clamp-2">{d.label}</span>
      </div>

      {d.childCount > 0 && (
        <div className="absolute -bottom-1 -right-1 bg-white/90 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm"
          style={{ color: d.branchColor.bg }}
        >
          {d.childCount}
        </div>
      )}
    </div>
  )
}

export const SubBranchNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as FlowNodeData
  const opacity = getOpacityForDepth(d.depth)

  return (
    <div
      className="relative flex items-center rounded-lg px-3 py-2.5 shadow-md border cursor-pointer transition-transform hover:scale-[1.03]"
      style={{
        background: d.branchColor.light,
        borderColor: d.branchColor.mid,
        opacity,
        minWidth: 140,
        minHeight: 48,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-300 !w-1.5 !h-1.5 !border-0" />
      <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-1.5 !h-1.5 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-300 !w-1.5 !h-1.5 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-1.5 !h-1.5 !border-0" />

      <div className="flex items-center gap-1.5 w-full">
        {d.emoji && <span className="text-sm flex-shrink-0">{d.emoji}</span>}
        <span className="font-medium text-[11px] leading-tight line-clamp-2" style={{ color: d.branchColor.text }}>
          {d.label}
        </span>
      </div>
    </div>
  )
}

export const LeafNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as FlowNodeData
  const opacity = getOpacityForDepth(d.depth)

  return (
    <div
      className="relative flex items-center rounded-md px-2.5 py-2 shadow-sm border cursor-pointer transition-transform hover:scale-[1.03]"
      style={{
        background: `${d.branchColor.light}cc`,
        borderColor: `${d.branchColor.mid}80`,
        opacity,
        minWidth: 120,
        minHeight: 40,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-200 !w-1.5 !h-1.5 !border-0" />
      <Handle type="target" position={Position.Left} className="!bg-gray-200 !w-1.5 !h-1.5 !border-0" />

      <div className="flex items-center gap-1 w-full">
        {d.emoji && <span className="text-xs flex-shrink-0">{d.emoji}</span>}
        <span className="text-[10px] leading-tight line-clamp-2" style={{ color: d.branchColor.text }}>
          {d.label}
        </span>
      </div>
    </div>
  )
}

export const nodeTypes = {
  central: CentralNode,
  branch: BranchNode,
  'sub-branch': SubBranchNode,
  leaf: LeafNode,
}
