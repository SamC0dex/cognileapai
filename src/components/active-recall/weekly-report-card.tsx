'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { FileText, RefreshCw, Calendar } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { marked } from 'marked'

interface WeeklyReportCardProps {
  className?: string
}

export function WeeklyReportCard({ className }: WeeklyReportCardProps) {
  const [report, setReport] = React.useState<string | null>(null)
  const [reportDate, setReportDate] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [isGenerating, setIsGenerating] = React.useState(false)

  // Fetch latest report on mount
  React.useEffect(() => {
    fetchReport()
  }, [])

  const fetchReport = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/active-recall/weekly-report')
      if (response.ok) {
        const data = await response.json()
        if (data.report) {
          setReport(data.report.report_markdown)
          setReportDate(data.report.week_end)
        }
      }
    } catch (error) {
      console.error('[WeeklyReport] Fetch error:', error)
    }
    setIsLoading(false)
  }

  const generateReport = async () => {
    setIsGenerating(true)
    try {
      const response = await fetch('/api/active-recall/weekly-report', {
        method: 'POST',
      })
      if (response.ok) {
        const data = await response.json()
        setReport(data.report)
        setReportDate(new Date().toISOString().split('T')[0])
      }
    } catch (error) {
      console.error('[WeeklyReport] Generate error:', error)
    }
    setIsGenerating(false)
  }

  return (
    <div className={cn('rounded-xl border bg-card p-5', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Weekly Report
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={generateReport}
          disabled={isGenerating}
          className="gap-1.5"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isGenerating && 'animate-spin')} />
          {isGenerating ? 'Generating...' : 'Generate'}
        </Button>
      </div>

      {isLoading && !report && (
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
          <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
        </div>
      )}

      {!isLoading && !report && (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-3">
            No report yet. Generate your first weekly learning report.
          </p>
          <Button onClick={generateReport} disabled={isGenerating} size="sm">
            {isGenerating ? 'Generating...' : 'Generate Report'}
          </Button>
        </div>
      )}

      {report && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {reportDate && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
              <Calendar className="w-3 h-3" />
              Week of {new Date(reportDate).toLocaleDateString()}
            </div>
          )}
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: marked.parse(report) as string }}
          />
        </motion.div>
      )}
    </div>
  )
}
