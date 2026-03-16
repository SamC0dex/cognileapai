'use client'

import * as React from 'react'
import { useState, useRef } from 'react'
import { Sidebar } from '@/components/sidebar'
import { FilesPanel } from '@/components/files-panel'
import { DocumentsProvider } from '@/contexts/documents-context'

const FILES_PANEL_STATE_KEY = 'cognileap-files-panel-open'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  // Always start with false to match SSR, then hydrate from localStorage
  const [isFilesPanelOpen, setIsFilesPanelOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [filesPanelWidth, setFilesPanelWidth] = useState(0)
  const mainRef = useRef<HTMLElement>(null)

  // Hydrate from localStorage after mount (client-only)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(FILES_PANEL_STATE_KEY)
      if (stored === 'true') {
        setIsFilesPanelOpen(true)
        setSidebarCollapsed(true)
      }
    } catch {
      // ignore storage failures
    }
  }, [])

  // Handle files panel toggle with seamless coordination
  const handleFilesPanelToggle = React.useCallback(() => {
    setIsFilesPanelOpen(prev => {
      if (!prev) {
        setSidebarCollapsed(true)
        return true
      }
      return false
    })
  }, [])

  // Handle sidebar manual toggle - allow coexistence with files panel
  const handleSidebarToggle = React.useCallback((newCollapsedState: boolean) => {
    setSidebarCollapsed(newCollapsedState)
  }, [])

  // Shift content only when the floating files panel is visible
  const getMainContentOffset = () => {
    return isFilesPanelOpen ? filesPanelWidth : 0
  }

  // Called by FilesPanel — during drag this fires on every rAF frame.
  // We write directly to DOM for the margin to avoid re-rendering
  // the entire dashboard tree on every pixel of drag.
  // During drag: direct DOM write only (no React re-render).
  // On mouseup: FilesPanel commits the final width via this same callback,
  // and the React state update keeps things in sync for open/close animations.
  const isResizingRef = useRef(false)
  const handleFilesPanelWidthChange = React.useCallback((width: number) => {
    if (mainRef.current) {
      mainRef.current.style.marginLeft = `${width}px`
    }
    // Only update React state when NOT mid-drag to avoid re-rendering on every frame
    if (!isResizingRef.current) {
      setFilesPanelWidth(width)
    }
  }, [])

  const handlePanelResizing = React.useCallback((active: boolean) => {
    isResizingRef.current = active
    if (mainRef.current) {
      mainRef.current.style.transition = active ? 'none' : 'margin-left 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)'
    }
  }, [])

  // Persist panel state to localStorage
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(FILES_PANEL_STATE_KEY, isFilesPanelOpen ? 'true' : 'false')
    } catch {
      // ignore storage failures
    }
  }, [isFilesPanelOpen])

  // Listen for upload events to auto-expand files panel
  React.useEffect(() => {
    const handleExpandFilesPanel = () => {
      if (!isFilesPanelOpen) {
        handleFilesPanelToggle()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('expand-files-panel', handleExpandFilesPanel)
      return () => window.removeEventListener('expand-files-panel', handleExpandFilesPanel)
    }
  }, [isFilesPanelOpen, handleFilesPanelToggle])

  return (
    <DocumentsProvider>
      <div className="flex h-screen overflow-hidden bg-background optimized-container" data-app-content>
        {/* Sidebar */}
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarToggle}
          isFilesPanelOpen={isFilesPanelOpen}
          onFilesPanelToggle={handleFilesPanelToggle}
        />

        {/* Main Content */}
        <main
          ref={mainRef}
          className="flex-1 flex flex-col overflow-hidden"
          style={{
            marginLeft: getMainContentOffset(),
            transition: 'margin-left 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)'
          }}
        >
          {/* Content wrapper with proper scrolling */}
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>

        {/* Files Panel */}
        <FilesPanel
          isOpen={isFilesPanelOpen}
          onClose={() => setIsFilesPanelOpen(false)}
          sidebarCollapsed={sidebarCollapsed}
          onWidthChange={handleFilesPanelWidthChange}
          onResizing={handlePanelResizing}
        />
      </div>
    </DocumentsProvider>
  )
}
