'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { Database } from '@/lib/supabase'
import type { DocumentUploadedDetail } from '@/types/documents'
import { useAuth } from '@/contexts/auth-context'

type DocumentItem = Database['public']['Tables']['documents']['Row']

interface UploadingDocument {
  id: string // temporary ID
  title: string
  size?: number
  isUploading: true
  progress?: number
  error?: string
}

interface SelectedDocument {
  id: string
  title: string
  size?: number
  processing_status?: string
}

interface DocumentsContextValue {
  documents: DocumentItem[]
  documentsLoading: boolean
  uploadingDocuments: UploadingDocument[]
  addUploadingDocument: (doc: UploadingDocument) => void
  updateUploadingDocument: (id: string, updates: Partial<UploadingDocument>) => void
  removeUploadingDocument: (id: string) => void
  refreshDocuments: (options?: { force?: boolean }) => Promise<void>
  upsertDocument: (document: DocumentItem) => void
  removeDocumentFromContext: (documentId: string) => void
  selectedDocuments: SelectedDocument[]
  addSelectedDocument: (doc: SelectedDocument) => void
  removeSelectedDocument: (documentId: string) => void
  clearSelectedDocuments: () => void
  isDocumentSelected: (documentId: string) => boolean
  primaryDocument: SelectedDocument | null
  updateDocumentStatus: (documentId: string, status: string) => void
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

const DOCUMENTS_CACHE_KEY = 'cognileap-documents-cache-v1'
const DOCUMENTS_CACHE_TTL = 2 * 60 * 1000 // 2 minutes
const UPLOADING_DOCUMENTS_CACHE_KEY = 'cognileap-uploading-documents-v1'
const UPLOADING_DOCUMENTS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes (longer for upload persistence)
const SELECTED_DOCUMENTS_STORAGE_PREFIX = 'cognileap-selected-documents-v1'

const getSelectedDocumentsStorageKey = (userId: string) => `${SELECTED_DOCUMENTS_STORAGE_PREFIX}:${userId}`

const parseStoredSelectedDocuments = (raw: string | null): SelectedDocument[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item): SelectedDocument | null => {
        if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string') {
          return null
        }
        const candidate = item as Partial<SelectedDocument> & { id: string }
        return {
          id: candidate.id,
          title: typeof candidate.title === 'string' ? candidate.title : 'Untitled Document',
          size: typeof candidate.size === 'number' ? candidate.size : undefined,
          processing_status: typeof candidate.processing_status === 'string' ? candidate.processing_status : undefined
        }
      })
      .filter((item): item is SelectedDocument => item !== null)
  } catch {
    return []
  }
}

const toSelectedDocument = (doc: DocumentItem): SelectedDocument => ({
  id: doc.id,
  title: doc.title,
  size: doc.bytes ?? undefined,
  processing_status: doc.processing_status ?? undefined
})

interface DocumentsApiResponse {
  documents?: DocumentItem[]
  userId?: string
}

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const cacheRef = useRef<DocumentItem[]>([])
  const selectedDocsStorageKeyRef = useRef<string | null>(null)
  const hasLoadedStoredSelectionRef = useRef(false)

  const readCache = (userId?: string | null) => {
    if (typeof window === 'undefined') return []
    if (!userId) return []
    try {
      const cached = window.sessionStorage.getItem(DOCUMENTS_CACHE_KEY)
      if (!cached) return []
      const parsed = JSON.parse(cached) as { timestamp: number; userId?: string; documents: DocumentItem[] }
      if (!parsed?.documents || !Array.isArray(parsed.documents)) return []
      if (parsed.userId !== userId) {
        window.sessionStorage.removeItem(DOCUMENTS_CACHE_KEY)
        return []
      }
      if (Date.now() - (parsed.timestamp || 0) > DOCUMENTS_CACHE_TTL) {
        window.sessionStorage.removeItem(DOCUMENTS_CACHE_KEY)
        return []
      }
      cacheRef.current = parsed.documents
      return parsed.documents
    } catch {
      return []
    }
  }

  const persistCache = (docs: DocumentItem[], userId?: string | null) => {
    if (typeof window === 'undefined') return
    if (!userId) return
    try {
      window.sessionStorage.setItem(
        DOCUMENTS_CACHE_KEY,
        JSON.stringify({ timestamp: Date.now(), userId, documents: docs })
      )
    } catch {
      // ignore storage errors
    }
  }

  const readUploadingCache = () => {
    if (typeof window === 'undefined') return []
    try {
      const cached = window.sessionStorage.getItem(UPLOADING_DOCUMENTS_CACHE_KEY)
      if (!cached) return []
      const parsed = JSON.parse(cached) as { timestamp: number; uploadingDocuments: UploadingDocument[] }
      if (!parsed?.uploadingDocuments || !Array.isArray(parsed.uploadingDocuments)) return []
      if (Date.now() - (parsed.timestamp || 0) > UPLOADING_DOCUMENTS_CACHE_TTL) {
        // Clear expired uploading documents
        window.sessionStorage.removeItem(UPLOADING_DOCUMENTS_CACHE_KEY)
        return []
      }
      return parsed.uploadingDocuments
    } catch {
      return []
    }
  }

  const persistUploadingCache = (uploadingDocs: UploadingDocument[]) => {
    if (typeof window === 'undefined') return
    try {
      if (uploadingDocs.length === 0) {
        // Remove cache when no uploading documents
        window.sessionStorage.removeItem(UPLOADING_DOCUMENTS_CACHE_KEY)
      } else {
        window.sessionStorage.setItem(
          UPLOADING_DOCUMENTS_CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), uploadingDocuments: uploadingDocs })
        )
      }
    } catch {
      // ignore storage errors
    }
  }

  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [uploadingDocuments, setUploadingDocuments] = useState<UploadingDocument[]>(() => readUploadingCache())
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedDocument[]>([])

  const applyDocumentsUpdate = useCallback((updater: (current: DocumentItem[]) => DocumentItem[]) => {
    setDocuments(prev => {
      const next = updater(prev)
      cacheRef.current = next
      persistCache(next, user?.id)
      return next
    })
  }, [user?.id])

  const upsertDocument = useCallback((document: DocumentItem) => {
    applyDocumentsUpdate(prev => {
      const existingIndex = prev.findIndex(item => item.id === document.id)
      if (existingIndex === -1) {
        return [document, ...prev]
      }
      const next = [...prev]
      next[existingIndex] = document
      return next
    })

    setSelectedDocuments(prev =>
      prev.map(item => (item.id === document.id ? toSelectedDocument(document) : item))
    )
  }, [applyDocumentsUpdate])

  const removeDocumentFromContext = useCallback((documentId: string) => {
    applyDocumentsUpdate(prev => prev.filter(doc => doc.id !== documentId))
    setSelectedDocuments(prev => prev.filter(doc => doc.id !== documentId))
    
    // Also notify about document removal so chat can update URL-based selections
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('document-removed', { 
        detail: { documentId } 
      }))
    }
  }, [applyDocumentsUpdate])

  const refreshDocuments = useCallback(async (options?: { force?: boolean }) => {
    if (!user) {
      applyDocumentsUpdate(() => [])
      cacheRef.current = []
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(DOCUMENTS_CACHE_KEY)
      }
      setDocumentsLoading(false)
      return
    }

    const shouldForceLoading = options?.force || cacheRef.current.length === 0
    if (shouldForceLoading) {
      setDocumentsLoading(true)
    }

    try {
      const response = await fetch('/api/documents', {
        cache: 'no-store'
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as { error?: string }
        console.error('[Documents] Failed to fetch documents:', errorBody?.error || response.statusText)
        return
      }

      const payload = await response.json() as DocumentsApiResponse
      if (payload.userId && payload.userId !== user.id) {
        console.warn('[Documents] Ignoring document payload for different user')
        applyDocumentsUpdate(() => [])
        setSelectedDocuments([])
        return
      }
      const nextDocs = Array.isArray(payload?.documents) ? payload.documents : []
      applyDocumentsUpdate(() => nextDocs)

      setSelectedDocuments(prev =>
        prev
          .map(item => {
            const updated = nextDocs.find(doc => doc.id === item.id)
            return updated ? toSelectedDocument(updated) : item
          })
          .filter(item => nextDocs.some(doc => doc.id === item.id))
      )
    } finally {
      setDocumentsLoading(false)
    }
  }, [applyDocumentsUpdate, user])

  useEffect(() => {
    if (!user) {
      if (typeof window !== 'undefined' && selectedDocsStorageKeyRef.current) {
        window.localStorage.removeItem(selectedDocsStorageKeyRef.current)
      }
      selectedDocsStorageKeyRef.current = null
      hasLoadedStoredSelectionRef.current = false
      applyDocumentsUpdate(() => [])
      cacheRef.current = []
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(DOCUMENTS_CACHE_KEY)
      }
      setSelectedDocuments([])
      setUploadingDocuments([])
      persistUploadingCache([]) // Clear uploading documents cache
      setDocumentsLoading(false)
      return
    }

    const storageKey = getSelectedDocumentsStorageKey(user.id)
    selectedDocsStorageKeyRef.current = storageKey
    hasLoadedStoredSelectionRef.current = false
    const cachedDocs = readCache(user.id)
    cacheRef.current = cachedDocs
    setDocuments(cachedDocs)
    setDocumentsLoading(cachedDocs.length === 0)

    const storedSelection = typeof window !== 'undefined'
      ? parseStoredSelectedDocuments(window.localStorage.getItem(storageKey))
      : []

    setSelectedDocuments(storedSelection)
    hasLoadedStoredSelectionRef.current = true

    void refreshDocuments({ force: cacheRef.current.length === 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!selectedDocsStorageKeyRef.current) return
    if (!hasLoadedStoredSelectionRef.current) return

    try {
      window.localStorage.setItem(selectedDocsStorageKeyRef.current, JSON.stringify(selectedDocuments))
    } catch {
      // ignore storage errors
    }
  }, [selectedDocuments])

  // Auto-cleanup old uploading documents on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const cleanup = () => {
      const cached = readUploadingCache()
      if (cached.length > 0) {
        // Check for very old uploading documents (more than 5 minutes)
        const now = Date.now()
        const staleThreshold = 5 * 60 * 1000 // 5 minutes
        const validUploads = cached.filter(doc => {
          // Parse timestamp from temp ID if possible
          const match = doc.id.match(/uploading-(\d+)/)
          if (match) {
            const uploadTime = parseInt(match[1])
            return (now - uploadTime) < staleThreshold
          }
          return true // Keep if we can't determine age
        })
        
        if (validUploads.length !== cached.length) {
          setUploadingDocuments(validUploads)
          persistUploadingCache(validUploads)
        }
      }
    }
    
    // Run cleanup on mount and periodically
    cleanup()
    const interval = setInterval(cleanup, 60000) // Every minute
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleDocumentUploaded = (event: Event) => {
      const customEvent = event as CustomEvent<DocumentUploadedDetail>
      const uploadedDocument = customEvent.detail?.document
      if (!uploadedDocument) return
      upsertDocument(uploadedDocument as DocumentItem)
      void refreshDocuments({ force: true })
    }

    window.addEventListener('document-uploaded', handleDocumentUploaded as EventListener)
    return () => window.removeEventListener('document-uploaded', handleDocumentUploaded as EventListener)
  }, [refreshDocuments, upsertDocument])

  const addSelectedDocument = useCallback((doc: SelectedDocument) => {
    setSelectedDocuments(prev => {
      if (prev.some(d => d.id === doc.id)) {
        return prev
      }
      return [...prev, doc]
    })
  }, [])

  const removeSelectedDocument = useCallback((documentId: string) => {
    setSelectedDocuments(prev => prev.filter(doc => doc.id !== documentId))
  }, [])

  const clearSelectedDocuments = useCallback(() => {
    setSelectedDocuments([])
  }, [])

  const isDocumentSelected = useCallback((documentId: string) => {
    return selectedDocuments.some(doc => doc.id === documentId)
  }, [selectedDocuments])

  const updateDocumentStatus = useCallback((documentId: string, status: string) => {
    setSelectedDocuments(prev =>
      prev.map(doc =>
        doc.id === documentId
          ? { ...doc, processing_status: status }
          : doc
      )
    )
  }, [])

  const addUploadingDocument = useCallback((doc: UploadingDocument) => {
    setUploadingDocuments(prev => {
      const next = [...prev, doc]
      persistUploadingCache(next)
      return next
    })
  }, [])

  const updateUploadingDocument = useCallback((id: string, updates: Partial<UploadingDocument>) => {
    setUploadingDocuments(prev => {
      const next = prev.map(doc => (doc.id === id ? { ...doc, ...updates } : doc))
      persistUploadingCache(next)
      return next
    })
  }, [])

  const removeUploadingDocument = useCallback((id: string) => {
    setUploadingDocuments(prev => {
      const next = prev.filter(doc => doc.id !== id)
      persistUploadingCache(next)
      return next
    })
  }, [])

  const primaryDocument = selectedDocuments.length > 0 ? selectedDocuments[0] : null

  // Auto-select document uploaded from chatbox (handles refresh during upload)
  useEffect(() => {
    if (typeof window === 'undefined' || documents.length === 0) return

    try {
      // Check for completed upload (has document ID)
      const uploadedDocId = sessionStorage.getItem('cognileap-chatbox-uploaded-doc')
      if (uploadedDocId) {
        const doc = documents.find(d => d.id === uploadedDocId)
        if (doc && !isDocumentSelected(doc.id)) {
          addSelectedDocument({
            id: doc.id,
            title: doc.title,
            size: doc.bytes || undefined,
            processing_status: doc.processing_status || undefined
          })
        }
        sessionStorage.removeItem('cognileap-chatbox-uploaded-doc')
        return
      }

      // Check for pending upload (user refreshed during upload)
      const pendingTitle = sessionStorage.getItem('cognileap-pending-chatbox-upload')
      if (pendingTitle) {
        // Find most recent document with matching title
        const matchingDocs = documents
          .filter(d => d.title === pendingTitle)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        
        const recentDoc = matchingDocs[0]
        if (recentDoc && !isDocumentSelected(recentDoc.id)) {
          addSelectedDocument({
            id: recentDoc.id,
            title: recentDoc.title,
            size: recentDoc.bytes || undefined,
            processing_status: recentDoc.processing_status || undefined
          })
          sessionStorage.removeItem('cognileap-pending-chatbox-upload')
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [documents, isDocumentSelected, addSelectedDocument])

  const value: DocumentsContextValue = {
    documents,
    documentsLoading,
    uploadingDocuments,
    addUploadingDocument,
    updateUploadingDocument,
    removeUploadingDocument,
    refreshDocuments,
    upsertDocument,
    removeDocumentFromContext,
    selectedDocuments,
    addSelectedDocument,
    removeSelectedDocument,
    clearSelectedDocuments,
    isDocumentSelected,
    primaryDocument,
    updateDocumentStatus
  }

  return (
    <DocumentsContext.Provider value={value}>
      {children}
    </DocumentsContext.Provider>
  )
}

export function useDocuments() {
  const context = useContext(DocumentsContext)
  if (!context) {
    throw new Error('useDocuments must be used within a DocumentsProvider')
  }
  return context
}
