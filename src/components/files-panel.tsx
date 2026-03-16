'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Upload, FolderPlus, MoreHorizontal, Trash2, Edit3,
  ChevronRight, ChevronDown, Folder, FolderOpen,
  FileText, FileImage, Sheet, Presentation, FileType2, File,
  GripVertical, LayoutGrid, LayoutList
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, Input
} from '@/components/ui'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDocuments } from '@/contexts/documents-context'
import type { Database } from '@/lib/supabase'
import { translateError } from '@/lib/errors/translator'
import { logError } from '@/lib/errors/logger'
import type { UserFacingError, ErrorAction, ErrorInput } from '@/lib/errors/types'
import { ActionableErrorPanel } from '@/components/error-management/actionable-error-panel'
import { ErrorBoundary } from '@/components/error-management'

type DocumentItem = Database['public']['Tables']['documents']['Row']

// ─── Virtual folder structure (client-side only) ────────────────────────────
interface FileFolder {
  id: string
  name: string
  isExpanded: boolean
  documentIds: string[]
}

const FOLDERS_STORAGE_KEY = 'cognileap-file-folders-v1'
const LAYOUT_STORAGE_KEY = 'cognileap-files-layout-v1'

function loadFolders(): FileFolder[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(FOLDERS_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveFolders(folders: FileFolder[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders))
  } catch { /* ignore */ }
}

function loadLayout(): 'list' | 'grid' {
  if (typeof window === 'undefined') return 'list'
  try {
    const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    return stored === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function saveLayout(layout: 'list' | 'grid') {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
  } catch { /* ignore */ }
}

// ─── File type helpers ──────────────────────────────────────────────────────

const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'heif'])
const DOC_TYPES = new Set(['doc', 'docx', 'odt', 'rtf', 'txt'])
const SPREADSHEET_TYPES = new Set(['xls', 'xlsx', 'ods', 'csv'])
const SLIDE_TYPES = new Set(['ppt', 'pptx', 'odp'])

function getFileIcon(fileType: string | null, size: 'sm' | 'md' | 'lg' = 'md') {
  const type = (fileType || '').toLowerCase()
  const cls = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'

  if (type === 'pdf') return <FileText className={cn(cls, "text-red-500")} />
  if (DOC_TYPES.has(type)) return <FileType2 className={cn(cls, "text-blue-500")} />
  if (SPREADSHEET_TYPES.has(type)) return <Sheet className={cn(cls, "text-emerald-600")} />
  if (SLIDE_TYPES.has(type)) return <Presentation className={cn(cls, "text-orange-500")} />
  if (IMAGE_TYPES.has(type)) return <FileImage className={cn(cls, "text-violet-500")} />
  return <File className={cn(cls, "text-muted-foreground")} />
}

function isImageType(fileType: string | null): boolean {
  return IMAGE_TYPES.has((fileType || '').toLowerCase())
}

function getFileTypeLabel(fileType: string | null): string {
  const type = (fileType || '').toUpperCase()
  if (!type) return 'File'
  return type
}

// ─── Color accents for grid cards ───────────────────────────────────────────

function getFileAccentColor(fileType: string | null): string {
  const type = (fileType || '').toLowerCase()
  if (type === 'pdf') return 'bg-red-500/10 border-red-500/20'
  if (DOC_TYPES.has(type)) return 'bg-blue-500/10 border-blue-500/20'
  if (SPREADSHEET_TYPES.has(type)) return 'bg-emerald-500/10 border-emerald-500/20'
  if (SLIDE_TYPES.has(type)) return 'bg-orange-500/10 border-orange-500/20'
  if (IMAGE_TYPES.has(type)) return 'bg-violet-500/10 border-violet-500/20'
  return 'bg-muted/50 border-border'
}

// ─── Format helpers ─────────────────────────────────────────────────────────

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileMeta(document: DocumentItem): string {
  const parts: string[] = []
  // Only show page count for non-image types
  if (!isImageType(document.file_type) && document.page_count > 0) {
    parts.push(`${document.page_count} ${document.page_count === 1 ? 'page' : 'pages'}`)
  }
  if (document.bytes > 0) {
    parts.push(formatFileSize(document.bytes))
  }
  return parts.join(' · ')
}

// ─── Animation variants ────────────────────────────────────────────────────

const panelSpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 40,
  mass: 0.5
}

const folderContentVariants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
  },
  expanded: {
    height: 'auto' as const,
    opacity: 1,
    transition: { duration: 0.25, ease: [0, 0, 0.2, 1] }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.15 } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.12 } }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface FilesPanelProps {
  isOpen: boolean
  onClose: () => void
  sidebarCollapsed?: boolean
  onWidthChange?: (width: number) => void
  onResizing?: (active: boolean) => void
}

const FilesPanelErrorFallback: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => {
  const translated = React.useMemo(() => translateError(error, {
    source: 'document-upload',
    operation: 'render',
    rawMessage: error.message,
    payload: { component: 'FilesPanel' }
  }), [error])

  const handleAction = React.useCallback((action: ErrorAction) => {
    switch (action.intent) {
      case 'retry':
      case 'upload':
        retry()
        break
      case 'reload':
        if (typeof window !== 'undefined') window.location.reload()
        break
      case 'support':
        if (typeof window !== 'undefined') window.open('mailto:support@cognileap.ai?subject=File%20Panel%20Issue', '_blank')
        break
      case 'signin':
        if (typeof window !== 'undefined') window.location.href = '/auth/login'
        break
      default:
        retry()
        break
    }
  }, [retry])

  return (
    <div className="p-4">
      <ActionableErrorPanel error={translated.userError} onAction={handleAction} />
    </div>
  )
}

export function FilesPanel(props: FilesPanelProps) {
  return (
    <ErrorBoundary fallback={FilesPanelErrorFallback}>
      <FilesPanelContent {...props} />
    </ErrorBoundary>
  )
}

const PANEL_WIDTH_KEY = 'cognileap-files-panel-width'
const DEFAULT_PANEL_WIDTH = 320
const MIN_PANEL_WIDTH = 240
const MAX_PANEL_WIDTH = 560

function loadPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_PANEL_WIDTH
  try {
    const stored = window.localStorage.getItem(PANEL_WIDTH_KEY)
    if (stored) {
      const val = parseInt(stored, 10)
      if (val >= MIN_PANEL_WIDTH && val <= MAX_PANEL_WIDTH) return val
    }
  } catch { /* ignore */ }
  return DEFAULT_PANEL_WIDTH
}

function FilesPanelContent({ isOpen, onClose, sidebarCollapsed = true, onWidthChange, onResizing }: FilesPanelProps) {
  const router = useRouter()
  const {
    documents,
    documentsLoading,
    uploadingDocuments,
    addUploadingDocument,
    updateUploadingDocument,
    removeUploadingDocument,
    refreshDocuments,
    selectedDocuments: contextSelectedDocs,
    addSelectedDocument,
    removeSelectedDocument,
    isDocumentSelected,
    upsertDocument,
    removeDocumentFromContext
  } = useDocuments()

  const [isUploading, setIsUploading] = useState(false)
  const [selectAll, setSelectAll] = useState(false)
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; document: DocumentItem | null; folder: FileFolder | null }>({ open: false, document: null, folder: null })
  const [removeDialog, setRemoveDialog] = useState<{ open: boolean; document: DocumentItem | null }>({ open: false, document: null })
  const [massRemoveDialog, setMassRemoveDialog] = useState<{ open: boolean; count: number }>({ open: false, count: 0 })
  const [newName, setNewName] = useState('')
  const [uploadError, setUploadError] = useState<UserFacingError | null>(null)
  const [folders, setFolders] = useState<FileFolder[]>(() => loadFolders())
  const [createFolderDialog, setCreateFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [removeFolderDialog, setRemoveFolderDialog] = useState<{ open: boolean; folder: FileFolder | null }>({ open: false, folder: null })
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null)
  const [layout, setLayout] = useState<'list' | 'grid'>(() => loadLayout())
  const panelRef = useRef<HTMLDivElement>(null)

  // ─── Resizable panel width ──────────────────────────────────────────────
  // We store the "committed" width in state (used by framer-motion when NOT
  // dragging). During an active drag we bypass React entirely and write
  // straight to the DOM via refs for zero-lag, 60fps resizing.
  const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth())
  const [isActivelyResizing, setIsActivelyResizing] = useState(false)
  const [justFinishedResizing, setJustFinishedResizing] = useState(false)
  const currentWidth = useRef(panelWidth)
  // Keep ref in sync with state when not dragging
  if (!isActivelyResizing) currentWidth.current = panelWidth

  // Notify parent of width changes
  useEffect(() => {
    if (isOpen) onWidthChange?.(panelWidth)
  }, [panelWidth, isOpen, onWidthChange])

  // Notify parent when panel closes
  useEffect(() => {
    if (!isOpen) onWidthChange?.(0)
  }, [isOpen, onWidthChange])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startW = currentWidth.current
    let rafId = 0

    setIsActivelyResizing(true)
    onResizing?.(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    // Add a global overlay to prevent iframes / other elements from stealing pointer events
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize;'
    document.body.appendChild(overlay)

    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const delta = ev.clientX - startX
        const w = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startW + delta))
        currentWidth.current = w

        // Direct DOM writes — no React re-render
        if (panelRef.current) {
          panelRef.current.style.width = `${w}px`
        }
        // Also push to parent for main-content offset (via lightweight callback)
        onWidthChange?.(w)
      })
    }

    const onUp = () => {
      cancelAnimationFrame(rafId)
      overlay.remove()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)

      // Commit final width to React state + persist
      const finalWidth = currentWidth.current
      // Set width and disable spring in the same batch to prevent bounce-back
      setPanelWidth(finalWidth)
      setIsActivelyResizing(false)
      setJustFinishedResizing(true)
      // Clear the "just finished" flag after framer-motion has committed the width
      requestAnimationFrame(() => {
        setJustFinishedResizing(false)
      })
      onResizing?.(false)
      onWidthChange?.(finalWidth)
      try { window.localStorage.setItem(PANEL_WIDTH_KEY, String(finalWidth)) } catch { /* ignore */ }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onWidthChange, onResizing])

  const supabase = React.useMemo(() => createClient(), [])

  // Persist folders & layout
  useEffect(() => { saveFolders(folders) }, [folders])
  useEffect(() => { saveLayout(layout) }, [layout])

  useEffect(() => {
    if (isOpen) void refreshDocuments()
  }, [isOpen, refreshDocuments])

  // Document IDs in folders
  const documentIdsInFolders = React.useMemo(() => {
    const ids = new Set<string>()
    folders.forEach(f => f.documentIds.forEach(id => ids.add(id)))
    return ids
  }, [folders])

  // Unfiled documents
  const unfiledDocuments = React.useMemo(
    () => documents.filter(doc => !documentIdsInFolders.has(doc.id)),
    [documents, documentIdsInFolders]
  )

  // ─── Upload logic ───────────────────────────────────────────────────────
  const handleFileUpload = React.useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return
    setIsUploading(true)
    setUploadError(null)

    try {
      const fileArray = Array.from(files)
      for (const file of fileArray) {
        const tempId = `uploading-${Date.now()}-${Math.random()}`
        addUploadingDocument({
          id: tempId,
          title: file.name.replace(/\.[^.]+$/, ''),
          size: file.size,
          isUploading: true,
          progress: 0
        })

        const formData = new FormData()
        formData.append('file', file)

        try {
          const response = await fetch('/api/upload', { method: 'POST', body: formData })

          if (response.ok) {
            const result = await response.json()
            removeUploadingDocument(tempId)
            if (result.alreadyExists) {
              toast.info(`"${result.document?.title || file.name}" is already in your library.`)
              if (result.warning) setTimeout(() => toast.warning(result.warning, { duration: 5000 }), 500)
            } else {
              toast.success(`"${file.name}" uploaded successfully!`)
              if (result.warning) setTimeout(() => toast.warning(result.warning, { duration: 5000 }), 500)
            }
          } else {
            const errorBody = await response.json().catch(() => ({ error: 'Upload failed' }))
            const rawMessage = typeof errorBody?.error === 'string' ? errorBody.error : 'Upload failed'
            updateUploadingDocument(tempId, { error: rawMessage })

            const translated = translateError(
              { message: rawMessage, status: response.status },
              { source: 'document-upload', operation: 'upload', rawMessage, payload: { fileName: file.name, status: response.status } }
            )
            logError(errorBody, { source: 'document-upload', operation: 'upload', rawMessage, payload: { fileName: file.name, status: response.status } }, translated.userError)
            toast.error(translated.userError.message)
            setUploadError(translated.userError)
            setTimeout(() => removeUploadingDocument(tempId), 3000)
          }
        } catch (fetchError) {
          updateUploadingDocument(tempId, { error: 'Network error' })
          throw fetchError
        }
      }
      await refreshDocuments({ force: true })
    } catch (error) {
      const translated = translateError(error as ErrorInput, {
        source: 'document-upload', operation: 'upload',
        rawMessage: error instanceof Error ? error.message : 'Upload failed',
        payload: { attemptedFiles: files.length }
      })
      logError(error, { source: 'document-upload', operation: 'upload', rawMessage: error instanceof Error ? error.message : 'Upload failed', payload: { attemptedFiles: files.length } }, translated.userError)
      toast.error(translated.userError.message)
      setUploadError(translated.userError)
    } finally {
      setIsUploading(false)
    }
  }, [addUploadingDocument, updateUploadingDocument, removeUploadingDocument, refreshDocuments])

  const handleUpload = React.useCallback(() => {
    if (isUploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) await handleFileUpload(files)
      if (e.target) (e.target as HTMLInputElement).value = ''
    }
    input.click()
  }, [isUploading, handleFileUpload])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => handleUpload()
    window.addEventListener('open-document-upload', handler as EventListener)
    return () => window.removeEventListener('open-document-upload', handler as EventListener)
  }, [handleUpload])

  const handleUploadErrorAction = React.useCallback((action: ErrorAction) => {
    switch (action.intent) {
      case 'retry':
      case 'upload': setUploadError(null); handleUpload(); break
      case 'signin': setUploadError(null); if (typeof window !== 'undefined') window.location.href = '/login'; break
      case 'support': if (typeof window !== 'undefined') window.open('mailto:support@cognileap.ai?subject=Upload%20Assistance', '_blank'); break
      case 'reload': if (typeof window !== 'undefined') window.location.reload(); break
      case 'dismiss': default: setUploadError(null); break
    }
  }, [handleUpload])

  // ─── OS-level drag & drop (file upload) ─────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = panelRef.current?.getBoundingClientRect()
    if (rect) {
      const { clientX, clientY } = e
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        setIsDragOver(false)
      }
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) await handleFileUpload(files)
  }, [handleFileUpload])

  // ─── Internal drag & drop (file → folder) ──────────────────────────────
  const handleInternalDragStart = useCallback((e: React.DragEvent, docId: string) => {
    e.dataTransfer.setData('text/plain', docId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingDocId(docId)
  }, [])

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggingDocId) {
      e.dataTransfer.dropEffect = 'move'
      setDragOverFolderId(folderId)
    }
  }, [draggingDocId])

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOverFolderId(null)
  }, [])

  const handleFolderDrop = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId(null)
    setDraggingDocId(null)
    const docId = e.dataTransfer.getData('text/plain')
    if (!docId) return
    setFolders(prev => prev.map(f => {
      const filtered = f.documentIds.filter(id => id !== docId)
      if (f.id === folderId) return { ...f, documentIds: [...filtered, docId], isExpanded: true }
      return { ...f, documentIds: filtered }
    }))
    toast.success('File moved to folder')
  }, [])

  const handleUnfiledDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId(null)
    setDraggingDocId(null)
    const docId = e.dataTransfer.getData('text/plain')
    if (!docId) return
    setFolders(prev => prev.map(f => ({ ...f, documentIds: f.documentIds.filter(id => id !== docId) })))
    toast.success('File moved out of folder')
  }, [])

  // ─── File & folder actions ──────────────────────────────────────────────
  const handleDocumentClick = (document: DocumentItem) => {
    router.push(`/chat?type=document&documentId=${document.id}&title=${encodeURIComponent(document.title)}`)
  }

  const handleDocumentSelect = (documentId: string) => {
    const document = documents.find(doc => doc.id === documentId)
    if (!document) return
    if (isDocumentSelected(documentId)) {
      removeSelectedDocument(documentId)
    } else {
      addSelectedDocument({
        id: document.id,
        title: document.title,
        size: document.bytes || undefined,
        processing_status: document.processing_status || undefined
      })
    }
  }

  const handleSelectAll = () => {
    if (selectAll) {
      contextSelectedDocs.forEach(doc => removeSelectedDocument(doc.id))
      setSelectAll(false)
    } else {
      documents.forEach(doc => {
        if (!isDocumentSelected(doc.id)) {
          addSelectedDocument({
            id: doc.id,
            title: doc.title,
            size: doc.bytes || undefined,
            processing_status: doc.processing_status || undefined
          })
        }
      })
      setSelectAll(true)
    }
  }

  const handleRename = (document: DocumentItem) => {
    setNewName(document.title)
    setRenameDialog({ open: true, document, folder: null })
  }

  const handleRenameFolder = (folder: FileFolder) => {
    setNewName(folder.name)
    setRenameDialog({ open: true, document: null, folder })
  }

  const handleRenameConfirm = async () => {
    if (renameDialog.folder) {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === renameDialog.folder.name) {
        setRenameDialog({ open: false, document: null, folder: null })
        return
      }
      setFolders(prev => prev.map(f => f.id === renameDialog.folder!.id ? { ...f, name: trimmed } : f))
      toast.success('Folder renamed')
      setRenameDialog({ open: false, document: null, folder: null })
      return
    }

    if (!renameDialog.document || newName.trim() === renameDialog.document.title) {
      setRenameDialog({ open: false, document: null, folder: null })
      return
    }

    try {
      const { error } = await supabase.from('documents').update({ title: newName.trim() }).eq('id', renameDialog.document.id)
      if (error) {
        toast.error('Failed to rename file')
      } else {
        toast.success('File renamed!')
        if (renameDialog.document) upsertDocument({ ...renameDialog.document, title: newName.trim() })
      }
    } catch {
      toast.error('Failed to rename file')
    }
    setRenameDialog({ open: false, document: null, folder: null })
  }

  const handleRemove = (document: DocumentItem) => {
    setRemoveDialog({ open: true, document })
  }

  const handleRemoveConfirm = async () => {
    if (!removeDialog.document) { setRemoveDialog({ open: false, document: null }); return }
    const docId = removeDialog.document.id
    setRemoveDialog({ open: false, document: null })
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Failed to delete file')
      } else {
        toast.success('File deleted!')
        removeDocumentFromContext(docId)
        setFolders(prev => prev.map(f => ({ ...f, documentIds: f.documentIds.filter(id => id !== docId) })))
      }
    } catch {
      toast.error('Failed to delete file')
    }
  }

  const handleMassRemove = () => {
    if (contextSelectedDocs.length === 0) return
    setMassRemoveDialog({ open: true, count: contextSelectedDocs.length })
  }

  const handleMassRemoveConfirm = async () => {
    const docsToRemove = [...contextSelectedDocs]
    if (docsToRemove.length === 0) { setMassRemoveDialog({ open: false, count: 0 }); return }
    setMassRemoveDialog({ open: false, count: 0 })

    let ok = 0, fail = 0
    for (const doc of docsToRemove) {
      try {
        const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
        if (res.ok) { removeDocumentFromContext(doc.id); ok++ } else { fail++ }
      } catch { fail++ }
    }

    if (ok > 0 && fail === 0) toast.success(`Deleted ${ok} ${ok === 1 ? 'file' : 'files'}`)
    else if (ok > 0) toast.warning(`Deleted ${ok}, ${fail} failed`)
    else toast.error(`Failed to delete ${fail} ${fail === 1 ? 'file' : 'files'}`)

    const removedIds = new Set(docsToRemove.map(d => d.id))
    setFolders(prev => prev.map(f => ({ ...f, documentIds: f.documentIds.filter(id => !removedIds.has(id)) })))
    setSelectAll(false)
  }

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim()
    if (!trimmed) return
    setFolders(prev => [...prev, {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      isExpanded: true,
      documentIds: []
    }])
    setCreateFolderDialog(false)
    setNewFolderName('')
    toast.success(`Folder "${trimmed}" created`)
  }

  const toggleFolder = (folderId: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f))
  }

  const handleRemoveFolder = (folder: FileFolder) => {
    setRemoveFolderDialog({ open: true, folder })
  }

  const handleRemoveFolderConfirm = () => {
    if (!removeFolderDialog.folder) return
    setFolders(prev => prev.filter(f => f.id !== removeFolderDialog.folder!.id))
    toast.success('Folder removed. Files are now unfiled.')
    setRemoveFolderDialog({ open: false, folder: null })
  }

  // Update selectAll state
  React.useEffect(() => {
    if (documents.length > 0) {
      setSelectAll(documents.filter(doc => isDocumentSelected(doc.id)).length === documents.length)
    } else {
      setSelectAll(false)
    }
  }, [documents, contextSelectedDocs, isDocumentSelected])

  // ─── Render: List file item ─────────────────────────────────────────────
  const renderListItem = (document: DocumentItem) => (
    <motion.div
      key={document.id}
      layout
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="group"
      draggable
      onDragStart={(e) => handleInternalDragStart(e as unknown as React.DragEvent, document.id)}
      onDragEnd={() => setDraggingDocId(null)}
    >
      <div className={cn(
        "flex items-center gap-3 py-2 px-3 rounded-xl transition-all duration-200",
        "hover:bg-muted/50 cursor-default",
        draggingDocId === document.id && "opacity-30 scale-95"
      )}>
        {/* Drag handle */}
        <GripVertical className="h-4 w-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0" />

        {/* Checkbox */}
        <button
          onClick={() => handleDocumentSelect(document.id)}
          className={cn(
            "w-4 h-4 border rounded flex items-center justify-center shrink-0 transition-all duration-200",
            isDocumentSelected(document.id)
              ? 'border-primary bg-primary shadow-sm shadow-primary/25'
              : 'border-muted-foreground/30 bg-transparent hover:border-primary/50'
          )}
        >
          {isDocumentSelected(document.id) && (
            <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Icon */}
        {getFileIcon(document.file_type, 'md')}

        {/* Info */}
        <div className="min-w-0 flex-1">
          <button
            onClick={() => handleDocumentClick(document)}
            className="text-sm font-medium text-left hover:text-primary transition-colors block w-full truncate"
            title={document.title}
            style={{ maxWidth: '180px' }}
          >
            {document.title}
          </button>
          <p className="text-xs text-muted-foreground mt-0.5">
            {getFileMeta(document)}
          </p>
        </div>

        {/* Type badge */}
        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide shrink-0 hidden group-hover:inline">
          {getFileTypeLabel(document.file_type)}
        </span>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleRename(document)}>
              <Edit3 className="h-3.5 w-3.5 mr-2" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs text-destructive cursor-pointer" onClick={() => handleRemove(document)}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  )

  // ─── Render: Grid file item ─────────────────────────────────────────────
  const renderGridItem = (document: DocumentItem) => (
    <motion.div
      key={document.id}
      layout
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="group"
      draggable
      onDragStart={(e) => handleInternalDragStart(e as unknown as React.DragEvent, document.id)}
      onDragEnd={() => setDraggingDocId(null)}
    >
      <div
        className={cn(
          "relative flex flex-col items-center p-3 rounded-xl border transition-all duration-200",
          "hover:shadow-md hover:scale-[1.02] cursor-default",
          getFileAccentColor(document.file_type),
          isDocumentSelected(document.id) && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          draggingDocId === document.id && "opacity-30 scale-90"
        )}
      >
        {/* Checkbox */}
        <button
          onClick={() => handleDocumentSelect(document.id)}
          className={cn(
            "absolute top-2 left-2 w-4 h-4 border rounded flex items-center justify-center transition-all duration-200",
            isDocumentSelected(document.id)
              ? 'border-primary bg-primary opacity-100'
              : 'border-muted-foreground/30 bg-background/80 opacity-0 group-hover:opacity-100'
          )}
        >
          {isDocumentSelected(document.id) && (
            <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleRename(document)}>
              <Edit3 className="h-3.5 w-3.5 mr-2" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs text-destructive cursor-pointer" onClick={() => handleRemove(document)}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Icon */}
        <button onClick={() => handleDocumentClick(document)} className="mb-2 mt-1">
          {getFileIcon(document.file_type, 'lg')}
        </button>

        {/* Title */}
        <button
          onClick={() => handleDocumentClick(document)}
          className="text-xs font-medium text-center hover:text-primary transition-colors w-full truncate px-1"
          title={document.title}
        >
          {document.title}
        </button>

        {/* Meta */}
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate w-full text-center">
          {getFileMeta(document)}
        </p>
      </div>
    </motion.div>
  )

  // ─── Render file list (either layout) ───────────────────────────────────
  const renderFiles = (docs: DocumentItem[]) => {
    if (layout === 'grid') {
      return (
        <div className="grid grid-cols-2 gap-2">
          {docs.map(doc => renderGridItem(doc))}
        </div>
      )
    }
    return (
      <div className="space-y-0.5">
        {docs.map(doc => renderListItem(doc))}
      </div>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[300] md:hidden"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ width: 0, opacity: 0 }}
            animate={{
              width: panelWidth,
              opacity: 1,
              left: sidebarCollapsed ? 64 : 256
            }}
            exit={{ width: 0, opacity: 0 }}
            transition={(isActivelyResizing || justFinishedResizing) ? { duration: 0 } : panelSpring}
            className={cn(
              "fixed top-0 h-full bg-background border-r border-border shadow-2xl z-[400]",
              "flex flex-col",
              isDragOver && "ring-2 ring-primary ring-inset"
            )}
            style={{ transformOrigin: "left center" }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Files</h2>
                {documents.length > 0 && (
                  <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full font-medium">
                    {documents.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Layout toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLayout(layout === 'list' ? 'grid' : 'list')}
                  className="h-8 w-8 hover:bg-muted"
                  title={layout === 'list' ? 'Grid view' : 'List view'}
                >
                  {layout === 'list' ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-muted">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  data-dashboard-upload-trigger
                  className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
                <Button
                  onClick={() => { setNewFolderName(''); setCreateFolderDialog(true) }}
                  variant="outline"
                  className="gap-2"
                >
                  <FolderPlus className="h-4 w-4" />
                  Folder
                </Button>
              </div>
            </div>

            {/* ── Drag overlay ── */}
            <AnimatePresence>
              {isDragOver && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 backdrop-blur-sm pointer-events-none"
                >
                  <div className="text-center p-8 rounded-2xl border-2 border-dashed border-primary/40 bg-background/80">
                    <Upload className="h-10 w-10 text-primary mx-auto mb-3" />
                    <p className="text-base font-medium text-primary">Drop files here</p>
                    <p className="text-sm text-muted-foreground mt-1">to upload them</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Upload error ── */}
            {uploadError && (
              <ActionableErrorPanel error={uploadError} onAction={handleUploadErrorAction} />
            )}

            {/* ── File list ── */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {documentsLoading && documents.length === 0 && uploadingDocuments.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-muted/50 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : documents.length === 0 && uploadingDocuments.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <Folder className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">No files yet</p>
                  <p className="text-xs text-muted-foreground/60 mb-4">
                    Upload files or drag & drop them here
                  </p>
                  <Button onClick={handleUpload} disabled={isUploading} size="sm" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Files
                  </Button>
                </div>
              ) : (
                <>
                  {/* Select all bar */}
                  {documents.length > 0 && contextSelectedDocs.length > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-2 py-1.5 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSelectAll}
                          className={cn(
                            "w-4 h-4 border rounded flex items-center justify-center shrink-0 transition-all duration-200",
                            selectAll ? 'border-primary bg-primary' : 'border-muted-foreground/30 bg-transparent hover:border-primary/50'
                          )}
                        >
                          {selectAll && (
                            <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <span>{contextSelectedDocs.length} selected</span>
                      </div>
                      <button
                        onClick={handleMassRemove}
                        className="text-destructive hover:text-destructive/80 transition-colors p-1 hover:bg-destructive/10 rounded"
                        title={`Delete ${contextSelectedDocs.length} selected`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Uploading files */}
                  <AnimatePresence mode="popLayout">
                    {uploadingDocuments.map((uploadingDoc) => (
                      <motion.div
                        key={uploadingDoc.id}
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, x: -20, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className={cn(
                          "flex items-center gap-3 p-3 rounded-xl transition-colors",
                          uploadingDoc.error ? "bg-destructive/10 border border-destructive/20" : "bg-primary/5 border border-primary/20"
                        )}>
                          {uploadingDoc.error ? (
                            <X className="h-4 w-4 shrink-0 text-destructive" />
                          ) : (
                            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full shrink-0" />
                          )}
                          <File className={cn("h-5 w-5 shrink-0", uploadingDoc.error ? "text-destructive" : "text-primary")} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate" style={{ maxWidth: '180px' }}>
                              {uploadingDoc.title}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {uploadingDoc.error ? (
                                <span className="text-destructive">{uploadingDoc.error}</span>
                              ) : (
                                <span className="text-primary">Uploading...</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Folders */}
                  {folders.map((folder) => {
                    const folderDocs = folder.documentIds
                      .map(id => documents.find(d => d.id === id))
                      .filter((d): d is DocumentItem => d != null)

                    return (
                      <div
                        key={folder.id}
                        className={cn(
                          "rounded-xl transition-all duration-200",
                          dragOverFolderId === folder.id && "bg-primary/8 ring-2 ring-primary/30"
                        )}
                        onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                        onDragLeave={handleFolderDragLeave}
                        onDrop={(e) => handleFolderDrop(e, folder.id)}
                      >
                        {/* Folder header */}
                        <div className="group flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-muted/50 transition-all duration-200 cursor-pointer">
                          <button
                            onClick={() => toggleFolder(folder.id)}
                            className="flex items-center gap-2 min-w-0 flex-1"
                          >
                            <motion.div
                              animate={{ rotate: folder.isExpanded ? 90 : 0 }}
                              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            >
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            </motion.div>
                            {folder.isExpanded ? (
                              <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
                            ) : (
                              <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                            )}
                            <span className="text-sm font-medium truncate">{folder.name}</span>
                            <span className="text-xs text-muted-foreground/60 ml-auto shrink-0">
                              {folderDocs.length}
                            </span>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleRenameFolder(folder)}>
                                <Edit3 className="h-3.5 w-3.5 mr-2" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs text-destructive cursor-pointer" onClick={() => handleRemoveFolder(folder)}>
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Folder contents */}
                        <AnimatePresence initial={false}>
                          {folder.isExpanded && (
                            <motion.div
                              key="folder-content"
                              variants={folderContentVariants}
                              initial="collapsed"
                              animate="expanded"
                              exit="collapsed"
                              className="overflow-hidden"
                            >
                              <div className="pl-6 pr-1 pb-1">
                                {folderDocs.length === 0 ? (
                                  <p className="text-xs text-muted-foreground/50 py-3 px-3 italic text-center">
                                    Drag files here to organize
                                  </p>
                                ) : (
                                  renderFiles(folderDocs)
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}

                  {/* Unfiled files */}
                  <div
                    onDragOver={(e) => {
                      if (draggingDocId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
                    }}
                    onDrop={handleUnfiledDrop}
                  >
                    {folders.length > 0 && unfiledDocuments.length > 0 && (
                      <div className="text-xs text-muted-foreground/50 uppercase tracking-wider px-3 pt-4 pb-1 font-medium">
                        Unfiled
                      </div>
                    )}
                    {renderFiles(unfiledDocuments)}
                  </div>
                </>
              )}
            </div>

            {/* ── Resize handle ── */}
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 -right-[3px] w-[7px] h-full cursor-col-resize z-50 group/resize"
            >
              {/* Full-height line */}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover/resize:bg-primary/50 group-active/resize:bg-primary transition-colors duration-200" />
              {/* Center grip pill */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[6px] h-8 rounded-full bg-muted-foreground/20 group-hover/resize:bg-primary/50 group-active/resize:bg-primary/70 transition-all duration-200 flex items-center justify-center opacity-0 group-hover/resize:opacity-100">
                <GripVertical className="h-3 w-3 text-muted-foreground/60 group-hover/resize:text-primary-foreground/80" />
              </div>
            </div>
          </motion.div>

          {/* ── Dialogs ── */}
          <AlertDialog open={renameDialog.open} onOpenChange={(open) => !open && setRenameDialog({ open: false, document: null, folder: null })}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rename {renameDialog.folder ? 'Folder' : 'File'}</AlertDialogTitle>
                <AlertDialogDescription>
                  Enter a new name for &quot;{renameDialog.folder?.name || renameDialog.document?.title}&quot;
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={renameDialog.folder ? 'Folder name' : 'File name'}
                className="mb-4"
                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm() }}
                autoFocus
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setRenameDialog({ open: false, document: null, folder: null })}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRenameConfirm}>Rename</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={removeDialog.open} onOpenChange={(open) => !open && setRemoveDialog({ open: false, document: null })}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete File</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{removeDialog.document?.title}&quot;? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemoveConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={massRemoveDialog.open} onOpenChange={(open) => !open && setMassRemoveDialog({ open: false, count: 0 })}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {massRemoveDialog.count} Files</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {massRemoveDialog.count} {massRemoveDialog.count === 1 ? 'file' : 'files'}? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleMassRemoveConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={createFolderDialog} onOpenChange={(open) => !open && setCreateFolderDialog(false)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Create Folder</AlertDialogTitle>
                <AlertDialogDescription>
                  Enter a name for the new folder.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="mb-4"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }}
                autoFocus
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setCreateFolderDialog(false)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={removeFolderDialog.open} onOpenChange={(open) => !open && setRemoveFolderDialog({ open: false, folder: null })}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Folder</AlertDialogTitle>
                <AlertDialogDescription>
                  Remove &quot;{removeFolderDialog.folder?.name}&quot;? Files inside will be moved to the unfiled section, not deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemoveFolderConfirm}>Remove Folder</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AnimatePresence>
  )
}
