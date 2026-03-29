'use client'

import { useCallback } from 'react'
import { ActiveRecallDashboard } from '@/components/active-recall/active-recall-dashboard'

export default function ActiveRecallPage() {
  const handleOpenChat = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-study-agent'))
  }, [])

  return <ActiveRecallDashboard onOpenChat={handleOpenChat} />
}
