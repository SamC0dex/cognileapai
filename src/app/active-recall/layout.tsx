'use client'

import { useState } from 'react'
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

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full min-h-screen">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Active Recall</h1>
            <p className="text-sm text-muted-foreground">Your AI-powered learning companion</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <ARTabNav />

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
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
