'use client'

import React from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export const MindMapEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) => {
  const branchColor = (data as { branchColor?: { bg: string; mid: string } })?.branchColor
  const depth = (data as { depth?: number })?.depth ?? 0

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  })

  const strokeWidth = depth === 0 ? 3 : depth === 1 ? 2.5 : 2
  const strokeColor = branchColor?.bg || '#94a3b8'
  const strokeOpacity = depth === 0 ? 0.8 : depth === 1 ? 0.6 : 0.4

  return (
    <>
      <defs>
        <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={strokeOpacity + 0.2} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={strokeOpacity} />
        </linearGradient>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: `url(#gradient-${id})`,
          strokeWidth,
          strokeLinecap: 'round',
          fill: 'none',
        }}
      />
      {/* Animated flowing dash */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1}
        strokeOpacity={0.3}
        strokeDasharray="6 8"
        strokeLinecap="round"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="14"
          to="0"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </path>
    </>
  )
}

export const edgeTypes = {
  mindMapEdge: MindMapEdge,
}
