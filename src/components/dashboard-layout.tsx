'use client'

import * as React from 'react'
import { useState, useRef } from 'react'
import { Sidebar } from '@/components/sidebar'
import { FilesPanel } from '@/components/files-panel'
import { StudyToolsSidebarPanel } from '@/components/study-tools-sidebar-panel'
import { DocumentsProvider } from '@/contexts/documents-context'

const FILES_PANEL_STATE_KEY = 'cognileap-files-panel-open'
const STUDY_TOOLS_PANEL_STATE_KEY = 'cognileap-study-tools-panel-open'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  // Always start with false to match SSR, then hydrate from localStorage
  const [isFilesPanelOpen, setIsFilesPanelOpen] = useState(false)
  const [isStudyToolsPanelOpen, setIsStudyToolsPanelOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [filesPanelWidth, setFilesPanelWidth] = useState(0)
  const [studyToolsPanelWidth, setStudyToolsPanelWidth] = useState(0)
  const mainRef = useRef<HTMLElement>(null)
  const studyToolsPanelRef = useRef<HTMLDivElement>(null)

  // Hydrate from localStorage after mount (client-only)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const storedFiles = window.localStorage.getItem(FILES_PANEL_STATE_KEY)
      const storedStudyTools = window.localStorage.getItem(STUDY_TOOLS_PANEL_STATE_KEY)
      if (storedFiles === 'true' || storedStudyTools === 'true') {
        if (storedFiles === 'true') setIsFilesPanelOpen(true)
        if (storedStudyTools === 'true') setIsStudyToolsPanelOpen(true)
        setSidebarCollapsed(true)
      }
    } catch {
      // ignore storage failures
    }
  }, [])

  // Handle files panel toggle - allow coexistence with study tools panel
  const handleFilesPanelToggle = React.useCallback(() => {
    setIsFilesPanelOpen(prev => {
      if (!prev) {
        setSidebarCollapsed(true)
        return true
      }
      return false
    })
  }, [])

  // Handle study tools panel toggle - allow coexistence with files panel
  const handleStudyToolsPanelToggle = React.useCallback(() => {
    setIsStudyToolsPanelOpen(prev => {
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

  // Shift content when floating panels are visible (both can be open)
  const getMainContentOffset = () => {
    let offset = 0
    if (isFilesPanelOpen) offset += filesPanelWidth
    if (isStudyToolsPanelOpen) offset += studyToolsPanelWidth
    return offset
  }

  // Track widths in refs for real-time DOM updates during drag
  const isResizingRef = useRef(false)
  const filesPanelWidthRef = useRef(0)
  const studyToolsPanelWidthRef = useRef(0)

  // Update combined margin on main content + reposition study tools panel
  const updateMainMargin = React.useCallback(() => {
    if (mainRef.current) {
      const total = filesPanelWidthRef.current + studyToolsPanelWidthRef.current
      mainRef.current.style.marginLeft = `${total}px`
    }
    // Also reposition the study tools panel in real-time during files panel drag
    if (studyToolsPanelRef.current) {
      const sidebarW = sidebarCollapsed ? 64 : 256
      studyToolsPanelRef.current.style.left = `${sidebarW + filesPanelWidthRef.current}px`
    }
  }, [sidebarCollapsed])

  const handleFilesPanelWidthChange = React.useCallback((width: number) => {
    filesPanelWidthRef.current = width
    updateMainMargin()
    if (!isResizingRef.current) {
      setFilesPanelWidth(width)
    }
  }, [updateMainMargin])

  const handlePanelResizing = React.useCallback((active: boolean) => {
    isResizingRef.current = active
    if (mainRef.current) {
      mainRef.current.style.transition = active ? 'none' : 'margin-left 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)'
    }
    // Disable transition on study tools panel during files panel drag for smooth coordination
    if (studyToolsPanelRef.current) {
      studyToolsPanelRef.current.style.transition = active ? 'none' : 'left 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)'
    }
  }, [])

  const handleStudyToolsPanelWidthChange = React.useCallback((width: number) => {
    studyToolsPanelWidthRef.current = width
    updateMainMargin()
    if (!isResizingRef.current) {
      setStudyToolsPanelWidth(width)
    }
  }, [updateMainMargin])

  const handleStudyToolsPanelResizing = React.useCallback((active: boolean) => {
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

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STUDY_TOOLS_PANEL_STATE_KEY, isStudyToolsPanelOpen ? 'true' : 'false')
    } catch {
      // ignore storage failures
    }
  }, [isStudyToolsPanelOpen])

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
          isStudyToolsPanelOpen={isStudyToolsPanelOpen}
          onStudyToolsPanelToggle={handleStudyToolsPanelToggle}
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

        {/* Study Tools Panel */}
        <StudyToolsSidebarPanel
          ref={studyToolsPanelRef}
          isOpen={isStudyToolsPanelOpen}
          onClose={() => setIsStudyToolsPanelOpen(false)}
          sidebarCollapsed={sidebarCollapsed}
          onWidthChange={handleStudyToolsPanelWidthChange}
          onResizing={handleStudyToolsPanelResizing}
          extraLeftOffset={isFilesPanelOpen ? filesPanelWidth : 0}
        />
      </div>
    </DocumentsProvider>
  )
}
