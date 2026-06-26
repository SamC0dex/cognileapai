'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Bell,
  Target,
  Save,
  CheckCircle,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { registerPushSubscription } from '@/lib/push-notifications'

interface NotifPrefs {
  push_enabled: boolean
  push_subscription: PushSubscriptionJSON | null
  timezone: string
  daily_reminder_time: string
}

interface ReminderPreview {
  preferences: {
    pushEnabled: boolean
    hasPushSubscription: boolean
    dailyReminderTime: string
    timezone: string
  }
  reminders: Array<{
    id: string
    type: 'daily_study' | 'due_cards' | 'exam_countdown'
    title: string
    body: string
    scheduledTime: string
    url: string
    enabled: boolean
  }>
}

export default function ARSettingsPage() {
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [reminderPreview, setReminderPreview] = useState<ReminderPreview | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPushSupported(typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window)

    // Fetch notification prefs from server
    fetchNotifPrefs()
    fetchReminderPreview()
  }, [])

  useEffect(() => {
    const handleAgentAction = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string }>).detail
      if (detail?.type === 'SET_REMINDERS') {
        fetchNotifPrefs()
        fetchReminderPreview()
      }
    }

    window.addEventListener('agent-action-completed', handleAgentAction)
    return () => window.removeEventListener('agent-action-completed', handleAgentAction)
  }, [])

  const fetchNotifPrefs = async () => {
    try {
      const response = await fetch('/api/active-recall/notification-preferences')
      const data = await response.json()
      if (data.preferences) {
        setNotifPrefs(data.preferences)
      } else {
        // No row yet — use defaults so the UI renders
        setNotifPrefs({
          push_enabled: false,
          push_subscription: null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          daily_reminder_time: '09:00',
        })
      }
    } catch (error) {
      console.error('[Settings] Fetch notif prefs error:', error)
      // Still show defaults on error
      setNotifPrefs({
        push_enabled: false,
        push_subscription: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daily_reminder_time: '09:00',
      })
    }
  }

  const fetchReminderPreview = async () => {
    try {
      const response = await fetch('/api/active-recall/reminder-preview')
      if (!response.ok) return
      setReminderPreview(await response.json())
    } catch (error) {
      console.error('[Settings] Fetch reminder preview error:', error)
    }
  }

  const saveNotifPrefs = async () => {
    if (!notifPrefs) return
    setIsSaving(true)
    try {
      await fetch('/api/active-recall/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          push_enabled: notifPrefs.push_enabled,
          timezone: notifPrefs.timezone,
          daily_reminder_time: notifPrefs.daily_reminder_time,
        }),
      })
      fetchReminderPreview()
      flashSaved()
    } catch (error) {
      console.error('[Settings] Save notif prefs error:', error)
    }
    setIsSaving(false)
  }

  const [pushError, setPushError] = useState<string | null>(null)
  const [pushLoading, setPushLoading] = useState(false)

  const handleEnablePush = async () => {
    setPushError(null)
    setPushLoading(true)

    try {
      // Check service worker support
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushError('Push notifications are not supported in this browser.')
        setPushLoading(false)
        return
      }

      // Register service worker if not already
      try {
        await navigator.serviceWorker.register('/sw.js')
      } catch {
        // May already be registered, that's fine
      }

      // Request permission
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setPushError('Notification permission was denied. Please enable it in your browser settings.')
        setPushLoading(false)
        return
      }
      if (permission !== 'granted') {
        setPushError('Notification permission was dismissed. Please try again.')
        setPushLoading(false)
        return
      }

      // Check VAPID key
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setPushError('Push notifications are not configured yet (missing VAPID keys).')
        setPushLoading(false)
        return
      }

      const subscription = await registerPushSubscription()
      if (subscription && notifPrefs) {
        const updated = { ...notifPrefs, push_enabled: true, push_subscription: subscription }
        setNotifPrefs(updated)
        await fetch('/api/active-recall/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        })
        flashSaved()
        fetchReminderPreview()
      } else {
        setPushError('Failed to subscribe. Please try again.')
      }
    } catch (error) {
      console.error('[Push] Enable error:', error)
      setPushError('Something went wrong enabling push notifications.')
    }

    setPushLoading(false)
  }

  const flashSaved = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="max-w-2xl">
          {/* Save indicator */}
          {saved && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-sm text-green-500 font-medium mb-4"
            >
              <CheckCircle className="h-4 w-4" />
              Settings saved
            </motion.div>
          )}

            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold mb-1">Agent Reminders</h3>
                <p className="text-sm text-muted-foreground mb-4">Let the Study Agent remind you about today&apos;s plan, due review, and exam countdowns.</p>
              </div>

              {notifPrefs ? (
                <>
                  <div>
                    <SettingRow
                      label="Push notifications"
                      description={pushSupported ? 'Browser alerts for agent reminders' : 'This browser does not support push alerts'}
                    >
                      {notifPrefs.push_enabled ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-500 font-medium">Active</span>
                          <Toggle
                            enabled={notifPrefs.push_enabled}
                            onToggle={() => setNotifPrefs((p) => p ? { ...p, push_enabled: false, push_subscription: null } : p)}
                          />
                        </div>
                      ) : (
                        <Button size="sm" onClick={handleEnablePush} disabled={pushLoading} className="gap-1.5">
                          {pushLoading ? (
                            <>
                              <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              Enabling...
                            </>
                          ) : (
                            <>
                              <Bell className="h-3.5 w-3.5" />
                              Enable Push
                            </>
                          )}
                        </Button>
                      )}
                    </SettingRow>
                    {pushError && (
                      <p className="text-xs text-red-500 mt-1 ml-1">{pushError}</p>
                    )}
                  </div>

                  <SettingRow label="Daily reminder" description="When to remind you to study">
                    <input
                      type="time"
                      value={notifPrefs.daily_reminder_time}
                      onChange={(e) => setNotifPrefs((p) => p ? { ...p, daily_reminder_time: e.target.value } : p)}
                      className="px-3 py-1.5 rounded-lg border bg-background text-sm"
                    />
                  </SettingRow>

                  <SettingRow label="Timezone" description="Used for reminder timing">
                    <input
                      value={notifPrefs.timezone}
                      onChange={(e) => setNotifPrefs((p) => p ? { ...p, timezone: e.target.value } : p)}
                      className="w-48 px-3 py-1.5 rounded-lg border bg-background text-sm"
                    />
                  </SettingRow>

                  {reminderPreview && (
                    <div className="rounded-xl border bg-card p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold">Agent reminder plan</h4>
                          <p className="text-xs text-muted-foreground">
                            {reminderPreview.preferences.dailyReminderTime} in {reminderPreview.preferences.timezone}
                          </p>
                        </div>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          reminderPreview.preferences.hasPushSubscription
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        )}>
                          {reminderPreview.preferences.hasPushSubscription ? 'Push ready' : 'Needs push permission'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {reminderPreview.reminders.map((reminder) => (
                          <div
                            key={reminder.id}
                            className={cn(
                              'flex items-start gap-3 rounded-lg border p-3',
                              reminder.enabled ? 'bg-background' : 'bg-muted/30 opacity-75'
                            )}
                          >
                            <div className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary">
                              {reminder.type === 'exam_countdown' ? (
                                <Calendar className="h-3.5 w-3.5" />
                              ) : reminder.type === 'due_cards' ? (
                                <Target className="h-3.5 w-3.5" />
                              ) : (
                                <Bell className="h-3.5 w-3.5" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{reminder.title}</p>
                                <span className="shrink-0 text-xs text-muted-foreground">{reminder.scheduledTime}</span>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">{reminder.body}</p>
                              <p className="mt-1 truncate text-[11px] text-muted-foreground/70">{reminder.url}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button onClick={saveNotifPrefs} disabled={isSaving} size="sm" className="gap-1.5">
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Notifications'}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              )}
            </div>
      </div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
      </div>
    </div>
  )
}

function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        enabled ? 'bg-primary' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
          enabled ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}
