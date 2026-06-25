'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ARTabNav } from '@/components/active-recall/v2/ar-tab-nav'
import { AIChatSidebar } from '@/components/active-recall/v2/ai-chat-sidebar'
import { Brain } from 'lucide-react'

export default function ActiveRecallLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isChatOpen, setIsChatOpen] = useState(false)

  // Listen for custom event to open chat from child components
  const handleOpenChat = useCallback(() => {
    setIsChatOpen(true)
  }, [])

  useEffect(() => {
    window.addEventListener('open-study-agent', handleOpenChat)
    return () => window.removeEventListener('open-study-agent', handleOpenChat)
  }, [handleOpenChat])

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full min-h-screen min-w-0 overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-2 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 shrink-0">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight leading-tight">Active Recall</h1>
            <p className="text-sm text-muted-foreground">AI-powered multi-tool learning</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <ARTabNav />

        {/* Page Content */}
        <div className="flex-1 min-w-0 overflow-auto">
          {children}
        </div>
      </div>

      {/* AI Chat Sidebar — available on all AR pages */}
      <AIChatSidebar
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen((prev) => !prev)}
      />
    </DashboardLayout>
  )
}
