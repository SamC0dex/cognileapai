'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Settings,
  Bell,
  Target,
  Smartphone,
  Clock,
  Sliders,
  Save,
  CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { registerPushSubscription } from '@/lib/push-notifications'

interface ReviewPrefs {
  defaultCardCount: number
  defaultMode: 'flashcard' | 'quiz' | 'mixed'
  autoAdvance: boolean
  cardOrder: 'optimal' | 'random' | 'newest'
}

interface NotifPrefs {
  push_enabled: boolean
  push_subscription: PushSubscriptionJSON | null
  telegram_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  timezone: string
  daily_reminder_time: string
  max_notifications_per_day: number
  daily_summary_enabled: boolean
  weekly_report_enabled: boolean
}

const REVIEW_PREFS_KEY = 'cognileap-ar-review-prefs'

const DEFAULT_REVIEW_PREFS: ReviewPrefs = {
  defaultCardCount: 20,
  defaultMode: 'mixed',
  autoAdvance: true,
  cardOrder: 'optimal',
}

type Section = 'review' | 'notifications' | 'daily-goal'

export default function ARSettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('review')
  const [reviewPrefs, setReviewPrefs] = useState<ReviewPrefs>(DEFAULT_REVIEW_PREFS)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null)
  const [dailyGoal, setDailyGoal] = useState(20)
  const [pushSupported, setPushSupported] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPushSupported(typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window)

    // Load review prefs from localStorage
    try {
      const stored = localStorage.getItem(REVIEW_PREFS_KEY)
      if (stored) setReviewPrefs(JSON.parse(stored))
    } catch { /* ignore */ }

    // Fetch notification prefs from server
    fetchNotifPrefs()
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
          telegram_enabled: false,
          quiet_hours_start: '22:00',
          quiet_hours_end: '08:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          daily_reminder_time: '09:00',
          max_notifications_per_day: 5,
          daily_summary_enabled: false,
          weekly_report_enabled: true,
        })
      }
    } catch (error) {
      console.error('[Settings] Fetch notif prefs error:', error)
      // Still show defaults on error
      setNotifPrefs({
        push_enabled: false,
        push_subscription: null,
        telegram_enabled: false,
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daily_reminder_time: '09:00',
        max_notifications_per_day: 5,
        daily_summary_enabled: false,
        weekly_report_enabled: true,
      })
    }
  }

  const saveReviewPrefs = () => {
    localStorage.setItem(REVIEW_PREFS_KEY, JSON.stringify(reviewPrefs))
    flashSaved()
  }

  const saveNotifPrefs = async () => {
    if (!notifPrefs) return
    setIsSaving(true)
    try {
      await fetch('/api/active-recall/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifPrefs),
      })
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

  const sections: { id: Section; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { id: 'review', icon: Sliders, label: 'Review Preferences' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'daily-goal', icon: Target, label: 'Daily Goal' },
  ]

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left nav */}
        <nav className="flex md:flex-col gap-1 md:w-48 shrink-0 overflow-x-auto md:overflow-x-visible">
          {sections.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  activeSection === s.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            )
          })}
        </nav>

        {/* Right content */}
        <div className="flex-1 min-w-0">
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

          {/* Review Preferences */}
          {activeSection === 'review' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold mb-1">Review Preferences</h3>
                <p className="text-sm text-muted-foreground mb-4">Customize how your review sessions work.</p>
              </div>

              <SettingRow label="Default card count" description="How many cards per session">
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={reviewPrefs.defaultCardCount}
                  onChange={(e) => setReviewPrefs((p) => ({ ...p, defaultCardCount: Number(e.target.value) }))}
                  className="w-32"
                />
                <span className="text-sm font-medium w-8 text-right">{reviewPrefs.defaultCardCount}</span>
              </SettingRow>

              <SettingRow label="Default mode" description="Type of review cards">
                <select
                  value={reviewPrefs.defaultMode}
                  onChange={(e) => setReviewPrefs((p) => ({ ...p, defaultMode: e.target.value as ReviewPrefs['defaultMode'] }))}
                  className="px-3 py-1.5 rounded-lg border bg-background text-sm"
                >
                  <option value="flashcard">Flashcards only</option>
                  <option value="quiz">Quiz only</option>
                  <option value="mixed">Mixed</option>
                </select>
              </SettingRow>

              <SettingRow label="Card order" description="How cards are prioritized">
                <select
                  value={reviewPrefs.cardOrder}
                  onChange={(e) => setReviewPrefs((p) => ({ ...p, cardOrder: e.target.value as ReviewPrefs['cardOrder'] }))}
                  className="px-3 py-1.5 rounded-lg border bg-background text-sm"
                >
                  <option value="optimal">Optimal (AI picks)</option>
                  <option value="random">Random</option>
                  <option value="newest">Newest first</option>
                </select>
              </SettingRow>

              <SettingRow label="Auto-advance" description="Move to next card after rating">
                <Toggle
                  enabled={reviewPrefs.autoAdvance}
                  onToggle={() => setReviewPrefs((p) => ({ ...p, autoAdvance: !p.autoAdvance }))}
                />
              </SettingRow>

              <Button onClick={saveReviewPrefs} size="sm" className="gap-1.5">
                <Save className="h-4 w-4" />
                Save Preferences
              </Button>
            </div>
          )}

          {/* Notifications */}
          {activeSection === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold mb-1">Notifications</h3>
                <p className="text-sm text-muted-foreground mb-4">Control when and how you get reminded to study.</p>
              </div>

              {notifPrefs ? (
                <>
                  <div>
                    <SettingRow label="Push notifications" description="Browser push alerts for study reminders">
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

                  <SettingRow label="Quiet hours" description="No notifications during this time">
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={notifPrefs.quiet_hours_start}
                        onChange={(e) => setNotifPrefs((p) => p ? { ...p, quiet_hours_start: e.target.value } : p)}
                        className="px-2 py-1.5 rounded-lg border bg-background text-sm w-28"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input
                        type="time"
                        value={notifPrefs.quiet_hours_end}
                        onChange={(e) => setNotifPrefs((p) => p ? { ...p, quiet_hours_end: e.target.value } : p)}
                        className="px-2 py-1.5 rounded-lg border bg-background text-sm w-28"
                      />
                    </div>
                  </SettingRow>

                  <SettingRow label="Max daily notifications" description="Limit reminders per day">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={notifPrefs.max_notifications_per_day}
                      onChange={(e) => setNotifPrefs((p) => p ? { ...p, max_notifications_per_day: Number(e.target.value) } : p)}
                      className="px-3 py-1.5 rounded-lg border bg-background text-sm w-20"
                    />
                  </SettingRow>

                  <SettingRow label="Daily summary" description="Get a summary of your day's progress">
                    <Toggle
                      enabled={notifPrefs.daily_summary_enabled}
                      onToggle={() => setNotifPrefs((p) => p ? { ...p, daily_summary_enabled: !p.daily_summary_enabled } : p)}
                    />
                  </SettingRow>

                  <SettingRow label="Weekly report" description="Auto-generate weekly learning report">
                    <Toggle
                      enabled={notifPrefs.weekly_report_enabled}
                      onToggle={() => setNotifPrefs((p) => p ? { ...p, weekly_report_enabled: !p.weekly_report_enabled } : p)}
                    />
                  </SettingRow>

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
          )}

          {/* Daily Goal */}
          {activeSection === 'daily-goal' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold mb-1">Daily Goal</h3>
                <p className="text-sm text-muted-foreground mb-4">Set how many cards you want to review each day.</p>
              </div>

              <div className="rounded-xl border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium">Cards per day</p>
                    <p className="text-xs text-muted-foreground">
                      {dailyGoal <= 10 ? 'Light' : dailyGoal <= 25 ? 'Moderate' : dailyGoal <= 40 ? 'Intensive' : 'Maximum'} study pace
                    </p>
                  </div>
                  <span className="text-3xl font-bold text-primary">{dailyGoal}</span>
                </div>

                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>5</span>
                  <span>25</span>
                  <span>50</span>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[10, 20, 30, 50].map((v) => (
                    <button
                      key={v}
                      onClick={() => setDailyGoal(v)}
                      className={cn(
                        'py-2 rounded-lg text-sm font-medium border transition-colors',
                        dailyGoal === v
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-muted'
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => {
                  localStorage.setItem('cognileap-ar-daily-goal', String(dailyGoal))
                  flashSaved()
                }}
                size="sm"
                className="gap-1.5"
              >
                <Save className="h-4 w-4" />
                Save Goal
              </Button>
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
