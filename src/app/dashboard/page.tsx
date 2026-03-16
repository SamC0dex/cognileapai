'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DashboardHeader } from '@/components/dashboard-header'
import { DashboardActionCards } from '@/components/dashboard-action-cards'
import { DashboardTabs } from '@/components/dashboard-tabs'

export default function DashboardPage() {
  const router = useRouter()
  const [isUploading] = useState(false)

  const handleUpload = useCallback(() => {
    // First expand the files panel to show upload progress
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('expand-files-panel'))
      // Small delay to let panel start opening, then trigger upload
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-document-upload'))
      }, 100)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: () => {
      // Instead of handling uploads here, delegate to files panel
      handleUpload()
    },
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 20 * 1024 * 1024, // 20MB
    disabled: isUploading,
    noClick: true // Disable default click to open file dialog
  })

  // Prefetch chat routes to make transitions instant
  useEffect(() => {
    router.prefetch('/chat')
  }, [router])

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    // Handle view mode change
    console.log('View mode changed to:', mode)
  }

  const handleSearch = (query: string) => {
    // Handle search
    console.log('Search query:', query)
  }

  return (
    <DashboardLayout>
      <div 
        {...getRootProps()}
        className={`min-h-screen transition-all duration-300 ${
          isDragActive ? 'bg-primary/5 ring-2 ring-primary ring-inset' : ''
        }`}
      >
        <input {...getInputProps()} />
        
        {/* Drag Overlay */}
        {isDragActive && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto">
                <svg
                  className="w-10 h-10 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary">Drop your PDF here</h3>
                <p className="text-muted-foreground">Release to upload your document</p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <DashboardHeader />
        
        {/* Action Cards */}
        <DashboardActionCards />
        
        {/* Tabs and Content */}
        <DashboardTabs
          onViewModeChange={handleViewModeChange}
          onSearch={handleSearch}
          onUpload={handleUpload}
        />
      </div>
    </DashboardLayout>
  )
}
