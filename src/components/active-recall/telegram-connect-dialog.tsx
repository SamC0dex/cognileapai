'use client'

import React from 'react'
import { Button } from '@/components/ui'
import { ExternalLink, Check, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TelegramConnectDialogProps {
  className?: string
}

export function TelegramConnectDialog({ className }: TelegramConnectDialogProps) {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'linking' | 'connected'>('idle')
  const [linkUrl, setLinkUrl] = React.useState<string | null>(null)
  const [username, setUsername] = React.useState<string | null>(null)
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Check current status on mount
  React.useEffect(() => {
    checkStatus()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/telegram/status')
      const data = await response.json()
      if (data.connected) {
        setStatus('connected')
        setUsername(data.username)
      }
    } catch (error) {
      console.error('[Telegram] Status check error:', error)
    }
  }

  const generateLink = async () => {
    setStatus('loading')
    try {
      const response = await fetch('/api/telegram/link', { method: 'POST' })
      const data = await response.json()

      if (data.linkUrl) {
        setLinkUrl(data.linkUrl)
        setStatus('linking')

        // Poll for connection status
        pollRef.current = setInterval(async () => {
          const statusRes = await fetch('/api/telegram/status')
          const statusData = await statusRes.json()
          if (statusData.connected) {
            setStatus('connected')
            setUsername(statusData.username)
            if (pollRef.current) clearInterval(pollRef.current)
          }
        }, 3000)

        // Stop polling after 15 minutes
        setTimeout(() => {
          if (pollRef.current) clearInterval(pollRef.current)
          if (status === 'linking') setStatus('idle')
        }, 15 * 60 * 1000)
      }
    } catch (error) {
      console.error('[Telegram] Link generation error:', error)
      setStatus('idle')
    }
  }

  if (status === 'connected') {
    return (
      <div className={cn('flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-200 dark:border-green-800', className)}>
        <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Telegram Connected
          </p>
          {username && (
            <p className="text-xs text-green-600 dark:text-green-400">@{username}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setStatus('idle')
            setLinkUrl(null)
          }}
          className="text-xs"
        >
          Reconnect
        </Button>
      </div>
    )
  }

  if (status === 'linking' && linkUrl) {
    return (
      <div className={cn('space-y-3', className)}>
        <p className="text-sm text-muted-foreground">
          Open this link in Telegram to connect your account:
        </p>
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#229ED9]/10 border border-[#229ED9]/30 text-[#229ED9] hover:bg-[#229ED9]/20 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span className="text-sm font-medium">Open in Telegram</span>
        </a>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Waiting for connection... (link expires in 15 minutes)
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        onClick={generateLink}
        disabled={status === 'loading'}
        variant="outline"
        className="w-full gap-2"
      >
        {status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
        )}
        Connect Telegram
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Receive study reminders directly in Telegram
      </p>
    </div>
  )
}
