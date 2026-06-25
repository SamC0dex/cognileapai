'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface RetentionForecastChartProps {
  data: Array<{ date: string; avgRetention: number; cardsDue: number }>
  width?: number
  height?: number
  className?: string
}

export function RetentionForecastChart({
  data,
  width = 700,
  height = 280,
  className,
}: RetentionForecastChartProps) {
  const padding = { top: 20, right: 20, bottom: 40, left: 50 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const { linePath, areaPath, dangerAreaPath, optimalDots, yTicks, xLabels } = useMemo(() => {
    if (data.length === 0) return { linePath: '', areaPath: '', dangerAreaPath: '', optimalDots: [], yTicks: [], xLabels: [] }

    const xScale = (i: number) => padding.left + (i / Math.max(1, data.length - 1)) * chartW
    const yScale = (v: number) => padding.top + (1 - v) * chartH

    // Line path
    const points = data.map((d, i) => ({ x: xScale(i), y: yScale(d.avgRetention) }))
    const linePathStr = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

    // Area under line
    const areaPathStr = `${linePathStr} L ${points[points.length - 1].x} ${yScale(0)} L ${points[0].x} ${yScale(0)} Z`

    // Danger zone (below 50%)
    const dangerY = yScale(0.5)
    const dangerAreaStr = `M ${padding.left} ${dangerY} L ${padding.left + chartW} ${dangerY} L ${padding.left + chartW} ${yScale(0)} L ${padding.left} ${yScale(0)} Z`

    // Find optimal review points (where retention crosses below thresholds)
    const dots: Array<{ x: number; y: number; date: string; retention: number }> = []
    for (let i = 1; i < data.length; i++) {
      if (data[i - 1].avgRetention >= 0.5 && data[i].avgRetention < 0.5) {
        dots.push({ x: xScale(i), y: yScale(data[i].avgRetention), date: data[i].date, retention: data[i].avgRetention })
      }
    }

    // Y-axis ticks
    const yTickValues = [0, 0.25, 0.5, 0.75, 1.0]
    const yTicksArr = yTickValues.map((v) => ({ value: v, y: yScale(v), label: `${Math.round(v * 100)}%` }))

    // X-axis labels (every ~5th point)
    const step = Math.max(1, Math.floor(data.length / 6))
    const xLabelsArr: Array<{ x: number; label: string }> = []
    for (let i = 0; i < data.length; i += step) {
      const d = new Date(data[i].date)
      xLabelsArr.push({ x: xScale(i), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })
    }

    return { linePath: linePathStr, areaPath: areaPathStr, dangerAreaPath: dangerAreaStr, optimalDots: dots, yTicks: yTicksArr, xLabels: xLabelsArr }
  }, [data, chartW, chartH, padding.left, padding.top])

  if (data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-48 text-muted-foreground text-sm', className)}>
        Not enough data for forecast
      </div>
    )
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
    >
      {/* Danger zone */}
      <path d={dangerAreaPath} fill="hsl(var(--destructive))" opacity={0.06} />

      {/* Danger threshold line */}
      <line
        x1={padding.left}
        y1={padding.top + chartH * 0.5}
        x2={padding.left + chartW}
        y2={padding.top + chartH * 0.5}
        stroke="hsl(var(--destructive))"
        strokeWidth={1}
        strokeDasharray="6 4"
        opacity={0.3}
      />
      <text
        x={padding.left + chartW + 4}
        y={padding.top + chartH * 0.5 + 4}
        fill="hsl(var(--destructive))"
        fontSize={10}
        opacity={0.6}
      >
        50%
      </text>

      {/* Y-axis ticks */}
      {yTicks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={padding.left}
            y1={tick.y}
            x2={padding.left + chartW}
            y2={tick.y}
            stroke="hsl(var(--border))"
            strokeWidth={0.5}
            opacity={0.5}
          />
          <text
            x={padding.left - 8}
            y={tick.y + 4}
            fill="hsl(var(--muted-foreground))"
            fontSize={10}
            textAnchor="end"
          >
            {tick.label}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {xLabels.map((label, i) => (
        <text
          key={i}
          x={label.x}
          y={height - 8}
          fill="hsl(var(--muted-foreground))"
          fontSize={10}
          textAnchor="middle"
        >
          {label.label}
        </text>
      ))}

      {/* Area fill */}
      <motion.path
        d={areaPath}
        fill="url(#retentionGradient)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />

      {/* Line */}
      <motion.path
        d={linePath}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: 'easeInOut' }}
      />

      {/* Optimal review dots */}
      {optimalDots.map((dot, i) => (
        <motion.g
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.5 + i * 0.2 }}
        >
          <circle cx={dot.x} cy={dot.y} r={6} fill="hsl(var(--destructive))" opacity={0.2} />
          <circle cx={dot.x} cy={dot.y} r={3.5} fill="hsl(var(--destructive))" />
          <text
            x={dot.x}
            y={dot.y - 10}
            fill="hsl(var(--destructive))"
            fontSize={9}
            fontWeight={600}
            textAnchor="middle"
          >
            Review here
          </text>
        </motion.g>
      ))}

      {/* Gradient definition */}
      <defs>
        <linearGradient id="retentionGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
        </linearGradient>
      </defs>
    </svg>
  )
}
