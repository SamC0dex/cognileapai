'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { SettingsProfile } from '@/components/settings/settings-profile'
import { SettingsApiKeys } from '@/components/settings/settings-api-keys'
import { SettingsAIPreferences } from '@/components/settings/settings-ai-preferences'
import { SettingsUsage } from '@/components/settings/settings-usage'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { User, Key, Brain, BarChart3, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

type SettingsTab = 'profile' | 'api-keys' | 'ai-preferences' | 'usage'

const TABS: { id: SettingsTab; label: string; icon: typeof User; description: string }[] = [
  { id: 'profile', label: 'Profile', icon: User, description: 'Name, password & account' },
  { id: 'api-keys', label: 'API Keys', icon: Key, description: 'Manage provider API keys' },
  { id: 'ai-preferences', label: 'AI Model', icon: Brain, description: 'Default provider & model' },
  { id: 'usage', label: 'Usage', icon: BarChart3, description: 'Token usage & cost analytics' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    )
  }

  if (!user) return null

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your account, API keys, and AI preferences
            </p>
          </div>

          <div className="flex gap-8">
            {/* Sidebar Navigation */}
            <nav className="w-56 shrink-0">
              <div className="space-y-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150',
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{tab.label}</div>
                        <div className="text-xs text-muted-foreground/70 truncate">{tab.description}</div>
                      </div>
                      {isActive && <ChevronRight className="h-3 w-3 shrink-0 text-primary" />}
                    </button>
                  )
                })}
              </div>
            </nav>

            {/* Content */}
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0"
            >
              {activeTab === 'profile' && <SettingsProfile />}
              {activeTab === 'api-keys' && <SettingsApiKeys />}
              {activeTab === 'ai-preferences' && <SettingsAIPreferences />}
              {activeTab === 'usage' && <SettingsUsage />}
            </motion.div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
