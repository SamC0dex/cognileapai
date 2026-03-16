'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useUser } from '@/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@/components/ui'
import { Save, Eye, EyeOff, LogOut, Loader2, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export function SettingsProfile() {
  const { logOut } = useAuth()
  const { user, profile } = useUser()
  const [fullName, setFullName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name)
    } else if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name)
    }
  }, [profile, user])

  const handleSaveName = async () => {
    if (!fullName.trim()) {
      toast.error('Name cannot be empty')
      return
    }

    setSavingName(true)
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      setNameSaved(true)
      toast.success('Name updated successfully')
      setTimeout(() => setNameSaved(false), 2000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setChangingPassword(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error

      toast.success('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleLogOut = async () => {
    setLoggingOut(true)
    try {
      await logOut()
    } catch {
      setLoggingOut(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
            <Input
              value={user?.email || ''}
              disabled
              className="bg-muted/50"
            />
            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
            <div className="flex gap-2">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your name"
                maxLength={100}
              />
              <Button
                onClick={handleSaveName}
                disabled={savingName || !fullName.trim() || fullName === profile?.full_name}
                size="default"
              >
                {savingName ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : nameSaved ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="ml-2">{nameSaved ? 'Saved' : 'Save'}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">New Password</label>
            <div className="relative">
              <Input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Confirm Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Passwords do not match
              </p>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={changingPassword || !newPassword || newPassword !== confirmPassword}
          >
            {changingPassword ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Update Password
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900/30">
        <CardHeader>
          <CardTitle className="text-lg text-red-600 dark:text-red-400">Sign Out</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Sign out of your account on this device.
          </p>
          <Button
            variant="destructive"
            onClick={handleLogOut}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" />
            )}
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
