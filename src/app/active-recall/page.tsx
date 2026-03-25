'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { ActiveRecallDashboard } from '@/components/active-recall/active-recall-dashboard'

export default function ActiveRecallPage() {
  return (
    <DashboardLayout>
      <div className="min-h-screen">
        <ActiveRecallDashboard />
      </div>
    </DashboardLayout>
  )
}
