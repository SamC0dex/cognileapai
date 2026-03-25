'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface CurvePoint {
  day: number
  retention: number
}

interface ForgettingCurveChartProps {
  curves: Array<{
    label: string
    color: string
    points: CurvePoint[]
    currentRetention: number
  }>
  width?: number
  height?: number
  className?: string
}

export function ForgettingCurveChart({
  curves,
  width = 600,
  height = 300,
  className,
}: ForgettingCurveChartProps) {
  const padding = { top: 20, right: 20, bottom: 40, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Find max days across all curves
  const maxDays = Math.max(...curves.flatMap((c) => c.points.map((p) => p.day)), 30)

  const xScale = (day: number) => padding.left + (day / maxDays) * chartWidth
  const yScale = (retention: number) => padding.top + (1 - retention) * chartHeight

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0]

  // X-axis ticks
  const xTicks = Array.from({ length: 7 }, (_, i) => Math.round((i / 6) * maxDays))

  // Generate SVG path from points
  const pointsToPath = (points: CurvePoint[]) => {
    if (points.length === 0) return ''
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.day)} ${yScale(p.retention)}`)
      .join(' ')
  }

  // Generate area path (for gradient fill)
  const pointsToArea = (points: CurvePoint[]) => {
    if (points.length === 0) return ''
    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.day)} ${yScale(p.retention)}`)
      .join(' ')
    const lastPoint = points[points.length - 1]
    const firstPoint = points[0]
    return `${linePath} L ${xScale(lastPoint.day)} ${yScale(0)} L ${xScale(firstPoint.day)} ${yScale(0)} Z`
  }

  if (curves.length === 0) {
    return (
      <div className={cn('flex items-center justify-center text-muted-foreground text-sm', className)} style={{ width, height }}>
        No retention data yet
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid lines */}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={padding.left}
              y1={yScale(tick)}
              x2={width - padding.right}
              y2={yScale(tick)}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeDasharray={tick === 0.5 ? '4 4' : undefined}
            />
            <text
              x={padding.left - 8}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="text-xs fill-muted-foreground"
            >
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}

        {/* X-axis ticks */}
        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line
              x1={xScale(tick)}
              y1={padding.top}
              x2={xScale(tick)}
              y2={height - padding.bottom}
              stroke="currentColor"
              strokeOpacity={0.05}
            />
            <text
              x={xScale(tick)}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              className="text-xs fill-muted-foreground"
            >
              {tick}d
            </text>
          </g>
        ))}

        {/* 90% threshold line */}
        <line
          x1={padding.left}
          y1={yScale(0.9)}
          x2={width - padding.right}
          y2={yScale(0.9)}
          stroke="#22c55e"
          strokeOpacity={0.4}
          strokeDasharray="6 3"
          strokeWidth={1.5}
        />
        <text
          x={width - padding.right + 4}
          y={yScale(0.9)}
          dominantBaseline="middle"
          className="text-xs fill-green-500"
        >
          90%
        </text>

        {/* 50% danger line */}
        <line
          x1={padding.left}
          y1={yScale(0.5)}
          x2={width - padding.right}
          y2={yScale(0.5)}
          stroke="#ef4444"
          strokeOpacity={0.3}
          strokeDasharray="6 3"
          strokeWidth={1.5}
        />

        {/* Curve gradient fills */}
        <defs>
          {curves.map((curve, idx) => (
            <linearGradient key={`gradient-${idx}`} id={`area-gradient-${idx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={curve.color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={curve.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {/* Curve areas and lines */}
        {curves.map((curve, idx) => (
          <g key={idx}>
            {/* Area fill */}
            <path
              d={pointsToArea(curve.points)}
              fill={`url(#area-gradient-${idx})`}
            />
            {/* Line */}
            <path
              d={pointsToPath(curve.points)}
              fill="none"
              stroke={curve.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Current retention dot */}
            <circle
              cx={xScale(0)}
              cy={yScale(curve.currentRetention)}
              r={4}
              fill={curve.color}
              stroke="white"
              strokeWidth={2}
            />
          </g>
        ))}

        {/* Today marker */}
        <line
          x1={xScale(0)}
          y1={padding.top}
          x2={xScale(0)}
          y2={height - padding.bottom}
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={1}
        />
        <text
          x={xScale(0)}
          y={height - padding.bottom + 32}
          textAnchor="middle"
          className="text-xs fill-muted-foreground font-medium"
        >
          Today
        </text>

        {/* Axes */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="currentColor"
          strokeOpacity={0.2}
        />

        {/* Y-axis label */}
        <text
          x={12}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${height / 2})`}
          className="text-xs fill-muted-foreground"
        >
          Retention
        </text>
      </svg>

      {/* Legend */}
      {curves.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2 px-2">
          {curves.map((curve, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: curve.color }} />
              <span className="text-muted-foreground truncate max-w-[120px]">{curve.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
