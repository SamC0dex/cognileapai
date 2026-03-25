'use client'

import React, { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

const MindMapViewerLazy = React.lazy(() =>
  import('./mindmap-viewer').then(mod => ({ default: mod.MindMapViewer }))
)

const MindMapLoading = () => (
  <div className="flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      <p className="text-sm text-muted-foreground">Loading mind map...</p>
    </div>
  </div>
)

export const LazyMindMapViewer: React.FC<React.ComponentProps<typeof MindMapViewerLazy>> = (props) => (
  <Suspense fallback={<MindMapLoading />}>
    <MindMapViewerLazy {...props} />
  </Suspense>
)
