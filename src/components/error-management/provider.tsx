/**
 * Error Management Provider
 * Provides global error handling and retry management throughout the app
 */

'use client'

import React, { useEffect } from 'react'
// import { retryManager } from '@/lib/retry-manager'
import { NetworkStatusIndicator } from './index'

interface ErrorManagementProviderProps {
  children: React.ReactNode
}

export function ErrorManagementProvider({ children }: ErrorManagementProviderProps) {
  useEffect(() => {
    // Initialize error management when the app starts
    if (typeof window !== 'undefined') {
      console.log('[ErrorManagement] Provider initialized')
    }
  }, [])

  // Note: ErrorBoundary cannot be used at root layout level in Next.js 15
  // Use error.tsx and global-error.tsx files instead for page-level error handling
  return (
    <>
      {children}
      {/* <RetryStatusPanel /> */}
      <NetworkStatusIndicator />
      <GlobalErrorHandler />
    </>
  )
}

// Global error handler that listens for unhandled errors
function GlobalErrorHandler() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason) {
        console.warn('Unhandled promise rejection:', event.reason)
      }

      // You could show a toast here for critical errors
      // For now, we'll just log it - the specific components will handle their own errors
    }

    const handleError = (event: ErrorEvent) => {
      if (event.error) {
        console.warn('Global error:', event.error)
      }

      // Handle global JavaScript errors
      // For now, we'll just log it - the specific components will handle their own errors
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [])

  return null
}
