'use client'

import React from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  Info,
  Zap,
  Eye,
  Code,
  Brain,
  MessageSquare,
  FileText,
  Layers,
  ArrowUpRight,
  ImageIcon,
  DollarSign,
  ArrowDownLeft,
  Music,
  Video,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InputFileType } from '@/lib/model-registry'

interface ModelInfoData {
  name: string
  id: string
  description: string
  contextWindow: number
  maxOutput: number
  costTier: 'free' | 'low' | 'medium' | 'high'
  capabilities: string[]
  provider?: string
  inputCostPer1M?: number
  outputCostPer1M?: number
  supportedInputs?: InputFileType[]
}

interface ModelInfoPopoverProps {
  model: ModelInfoData
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  iconSize?: number
  className?: string
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return String(n)
}

function formatTokensFull(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

const costTierInfo: Record<string, { label: string; color: string; bg: string }> = {
  free: {
    label: 'Free',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-950/30',
  },
  low: {
    label: 'Low Cost',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
  },
  medium: {
    label: 'Medium Cost',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
  },
  high: {
    label: 'High Cost',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30',
  },
}

const capabilityDetails: Record<string, { icon: React.ElementType; label: string; description: string; color: string }> = {
  chat: {
    icon: MessageSquare,
    label: 'Chat',
    description: 'General conversation and Q&A',
    color: 'text-blue-500',
  },
  vision: {
    icon: Eye,
    label: 'Vision',
    description: 'Understands images and visual content',
    color: 'text-purple-500',
  },
  code: {
    icon: Code,
    label: 'Code',
    description: 'Code generation, debugging, and analysis',
    color: 'text-emerald-500',
  },
  reasoning: {
    icon: Brain,
    label: 'Reasoning',
    description: 'Complex logic, math, and step-by-step thinking',
    color: 'text-orange-500',
  },
}

const fileTypeConfig: Record<InputFileType, { icon: React.ElementType; label: string }> = {
  image: { icon: ImageIcon, label: 'Image' },
  audio: { icon: Music, label: 'Audio' },
  video: { icon: Video, label: 'Video' },
  pdf: { icon: FileText, label: 'PDF' },
}

function getBestFor(capabilities: string[]): string {
  if (capabilities.includes('reasoning') && capabilities.includes('code') && capabilities.includes('vision')) {
    return 'Complex tasks requiring analysis of text, images, and code'
  }
  if (capabilities.includes('reasoning') && capabilities.includes('code')) {
    return 'Code generation and complex problem solving'
  }
  if (capabilities.includes('vision') && capabilities.includes('code')) {
    return 'Multimodal tasks with code and image understanding'
  }
  if (capabilities.includes('reasoning')) {
    return 'Tasks requiring deep logical thinking and analysis'
  }
  if (capabilities.includes('code')) {
    return 'Code generation, debugging, and technical tasks'
  }
  if (capabilities.includes('vision')) {
    return 'Image analysis and visual understanding'
  }
  return 'General conversation and quick tasks'
}

export const ModelInfoPopover: React.FC<ModelInfoPopoverProps> = ({
  model,
  side = 'top',
  align = 'center',
  iconSize = 14,
  className,
}) => {
  const cost = costTierInfo[model.costTier] || costTierInfo.low
  const inputs = model.supportedInputs || []

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex-shrink-0 p-1 rounded-md hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
            className
          )}
          aria-label={`Info about ${model.name}`}
        >
          <Info
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            style={{ width: iconSize, height: iconSize }}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          side={side}
          align={align}
          className="z-[70] w-[340px] max-w-[95vw] rounded-xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl focus:outline-none animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">{model.name}</h4>
                <span className={cn('px-2 py-0.5 text-[10px] font-medium rounded-full', cost.bg, cost.color)}>
                  {cost.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{model.description}</p>
            </div>

            {/* Context & Output */}
            <div className="grid grid-cols-2 gap-2">
              <div className="px-3 py-2 rounded-lg bg-muted/40 border border-border/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <Layers className="w-3 h-3 text-sky-500" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Context</span>
                </div>
                <div className="text-sm font-semibold text-foreground tabular-nums">
                  {formatTokens(model.contextWindow)}
                </div>
                <div className="text-[10px] text-muted-foreground/70 tabular-nums">
                  {formatTokensFull(model.contextWindow)} tokens
                </div>
              </div>

              <div className="px-3 py-2 rounded-lg bg-muted/40 border border-border/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Max Output</span>
                </div>
                <div className="text-sm font-semibold text-foreground tabular-nums">
                  {formatTokens(model.maxOutput)}
                </div>
                <div className="text-[10px] text-muted-foreground/70 tabular-nums">
                  {formatTokensFull(model.maxOutput)} tokens
                </div>
              </div>
            </div>

            {/* Token Pricing */}
            {(model.inputCostPer1M != null || model.outputCostPer1M != null) && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pricing per 1M tokens</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="px-3 py-2 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-800/30">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ArrowDownLeft className="w-3 h-3 text-sky-500" />
                      <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">Input</span>
                    </div>
                    <div className="text-sm font-bold text-sky-700 dark:text-sky-300 tabular-nums">
                      {model.inputCostPer1M === 0 ? 'Free' : `$${model.inputCostPer1M!.toFixed(2)}`}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-800/30">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ArrowUpRight className="w-3 h-3 text-violet-500" />
                      <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">Output</span>
                    </div>
                    <div className="text-sm font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                      {model.outputCostPer1M === 0 ? 'Free' : `$${model.outputCostPer1M!.toFixed(2)}`}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Capabilities */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Capabilities</div>
              <div className="grid grid-cols-2 gap-1.5">
                {model.capabilities.map((cap) => {
                  const detail = capabilityDetails[cap]
                  if (!detail) return null
                  const CapIcon = detail.icon
                  return (
                    <div
                      key={cap}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 border border-border/30"
                    >
                      <CapIcon className={cn('w-3.5 h-3.5 flex-shrink-0', detail.color)} />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground">{detail.label}</div>
                        <div className="text-[9px] text-muted-foreground/70 leading-tight truncate">{detail.description}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Accepted Inputs */}
            {inputs.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Accepted Inputs</div>
                <div className="flex flex-wrap gap-1.5">
                  {inputs.map((type) => {
                    const config = fileTypeConfig[type]
                    if (!config) return null
                    const TypeIcon = config.icon
                    return (
                      <div
                        key={type}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
                      >
                        <TypeIcon className="w-3 h-3" />
                        {config.label}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Best for */}
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
              <div className="flex items-start gap-2">
                <Zap className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Best For</div>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {getBestFor(model.capabilities)}
                  </p>
                </div>
              </div>
            </div>

            {/* Model ID */}
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <span className="text-[10px] text-muted-foreground/60">Model ID</span>
              <code className="text-[10px] text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded font-mono">
                {model.id}
              </code>
            </div>
          </div>

          <Popover.Arrow className="fill-background/95" width={12} height={6} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

ModelInfoPopover.displayName = 'ModelInfoPopover'
