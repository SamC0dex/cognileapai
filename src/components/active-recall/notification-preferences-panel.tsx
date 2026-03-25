'use client'

import React from 'react'
import { Bell, Smartphone, Clock, Settings } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { TelegramConnectDialog } from './telegram-connect-dialog'

interface NotificationPreferencesPanelProps {
  className?: string
}

export function NotificationPreferencesPanel({ className }: NotificationPreferencesPanelProps) {
  const [prefs, setPrefs] = React.useState<Record<string, unknown> | null>(null)
  const [pushSupported, setPushSupported] = React.useState(false)
  const [pushEnabled, setPushEnabled] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window)
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/active-recall/notification-preferences')
      const data = await response.json()
      if (data.preferences) {
        setPrefs(data.preferences)
        setPushEnabled(data.preferences.push_enabled)
      }
    } catch (error) {
      console.error('[Notifications] Fetch error:', error)
    }
    setIsLoading(false)
  }

  const togglePush = async () => {
    if (!pushSupported) return

    if (!pushEnabled) {
      // Enable push
      try {
        const { registerPushSubscription } = await import('@/lib/push-notifications')
        const subscription = await registerPushSubscription()

        if (subscription) {
          // Save subscription to server
          await fetch('/api/active-recall/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription }),
          })
          setPushEnabled(true)
        }
      } catch (error) {
        console.error('[Notifications] Push enable error:', error)
      }
    } else {
      // Disable push
      await updatePreference('push_enabled', false)
      setPushEnabled(false)
    }
  }

  const updatePreference = async (key: string, value: unknown) => {
    try {
      await fetch('/api/active-recall/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })

      setPrefs((prev) => (prev ? { ...prev, [key]: value } : null))
    } catch (error) {
      console.error('[Notifications] Update error:', error)
    }
  }

  return (
    <div className={cn('rounded-xl border bg-card p-5 space-y-5', className)}>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Bell className="w-4 h-4" />
        Notification Settings
      </h3>

      {/* Browser Push */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Desktop Notifications</span>
          </div>
          <button
            onClick={togglePush}
            disabled={!pushSupported}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              pushEnabled ? 'bg-primary' : 'bg-muted',
              !pushSupported && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                pushEnabled && 'translate-x-5'
              )}
            />
          </button>
        </div>
        {!pushSupported && (
          <p className="text-xs text-muted-foreground">
            Push notifications are not supported in this browser.
          </p>
        )}
      </div>

      {/* Telegram */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
          <span className="text-sm">Telegram Reminders</span>
        </div>
        <TelegramConnectDialog />
      </div>

      {/* Quiet Hours */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">Quiet Hours</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="time"
            defaultValue={prefs?.quiet_hours_start as string || '22:00'}
            onChange={(e) => updatePreference('quiet_hours_start', e.target.value)}
            className="px-2 py-1 rounded border bg-background text-foreground text-xs"
          />
          <span>to</span>
          <input
            type="time"
            defaultValue={prefs?.quiet_hours_end as string || '08:00'}
            onChange={(e) => updatePreference('quiet_hours_end', e.target.value)}
            className="px-2 py-1 rounded border bg-background text-foreground text-xs"
          />
        </div>
      </div>

      {/* Max daily notifications */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Max daily reminders</span>
        <select
          defaultValue={prefs?.max_notifications_per_day as number || 3}
          onChange={(e) => updatePreference('max_notifications_per_day', parseInt(e.target.value))}
          className="px-2 py-1 rounded border bg-background text-foreground text-xs"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={5}>5</option>
        </select>
      </div>
    </div>
  )
}
