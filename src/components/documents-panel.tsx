'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, FileText, MoreHorizontal, Trash2, Edit3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Input } from '@/components/ui'
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

interface DocumentsPanelProps {
  isOpen: boolean
  onClose: () => void
  sidebarCollapsed?: boolean
}

const DocumentsPanelErrorFallback: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => {
  const translated = React.useMemo(() => translateError(error, {
    source: 'document-upload',
    operation: 'render',
    rawMessage: error.message,
    payload: {
      component: 'DocumentsPanel'
    }
  }), [error])

  const handleAction = React.useCallback((action: ErrorAction) => {
    switch (action.intent) {
      case 'retry':
      case 'upload':
        retry()
        break
      case 'reload':
        if (typeof window !== 'undefined') {
          window.location.reload()
        }
        break
      case 'support':
        if (typeof window !== 'undefined') {
          window.open('mailto:support@cognileap.ai?subject=Document%20Panel%20Issue', '_blank')
        }
        break
      case 'signin':
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login'
        }
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

export function DocumentsPanel(props: DocumentsPanelProps) {
  return (
    <ErrorBoundary fallback={DocumentsPanelErrorFallback}>
      <DocumentsPanelContent {...props} />
    </ErrorBoundary>
  )
}

function DocumentsPanelContent({ isOpen, onClose, sidebarCollapsed = true }: DocumentsPanelProps) {
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
  const [renameDialog, setRenameDialog] = useState<{open: boolean, document: DocumentItem | null}>({open: false, document: null})
  const [removeDialog, setRemoveDialog] = useState<{open: boolean, document: DocumentItem | null}>({open: false, document: null})
  const [massRemoveDialog, setMassRemoveDialog] = useState<{open: boolean, count: number}>({open: false, count: 0})
  const [newDocumentName, setNewDocumentName] = useState('')
  const [uploadError, setUploadError] = useState<UserFacingError | null>(null)

  // Memoized Supabase client to prevent recreating on every render
  const supabase = React.useMemo(() => createClient(), [])

  useEffect(() => {
    if (isOpen) {
      void refreshDocuments()
    }
  }, [isOpen, refreshDocuments])

  const handleFileUpload = React.useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return

    setIsUploading(true)
    setUploadError(null)

    try {
      const fileArray = Array.from(files)
      for (const file of fileArray) {
        // Generate temporary ID for optimistic update
        const tempId = `uploading-${Date.now()}-${Math.random()}`
        
        // Add uploading document to context immediately
        addUploadingDocument({
          id: tempId,
          title: file.name.replace(/\.pdf$/i, ''),
          size: file.size,
          isUploading: true,
          progress: 0
        })

        const formData = new FormData()
        formData.append('file', file)

        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          })

          if (response.ok) {
            const result = await response.json()

            // Remove uploading document
            removeUploadingDocument(tempId)

            if (result.alreadyExists) {
              toast.info(`"${result.document?.title || file.name}" is already in your library.`)
              // Show warning if present for duplicate documents too
              if (result.warning) {
                setTimeout(() => {
                  toast.warning(result.warning, { duration: 5000 })
                }, 500)
              }
            } else {
              toast.success(`"${file.name}" uploaded successfully!`)
              // Show warning if present for large files
              if (result.warning) {
                setTimeout(() => {
                  toast.warning(result.warning, { duration: 5000 })
                }, 500)
              }
            }
          } else {
            const errorBody = await response.json().catch(() => ({ error: 'Upload failed' }))
            const rawMessage = typeof errorBody?.error === 'string' ? errorBody.error : 'Upload failed'
            
            // Update uploading document with error
            updateUploadingDocument(tempId, {
              error: rawMessage
            })

            const translated = translateError({
              message: rawMessage,
              status: response.status
            }, {
              source: 'document-upload',
              operation: 'upload',
              rawMessage,
              payload: {
                fileName: file.name,
                status: response.status
              }
            })

            logError(errorBody, {
              source: 'document-upload',
              operation: 'upload',
              rawMessage,
              payload: {
                fileName: file.name,
                status: response.status
              }
            }, translated.userError)

            toast.error(translated.userError.message)
            setUploadError(translated.userError)

            // Remove failed upload after 3 seconds
            setTimeout(() => {
              removeUploadingDocument(tempId)
            }, 3000)
          }
        } catch (fetchError) {
          // Update uploading document with error
          updateUploadingDocument(tempId, {
            error: 'Network error'
          })

          throw fetchError
        }
      }

      // Refresh the list after all uploads
      await refreshDocuments({ force: true })
    } catch (error) {
      const translated = translateError(error as ErrorInput, {
        source: 'document-upload',
        operation: 'upload',
        rawMessage: error instanceof Error ? error.message : 'Upload failed',
        payload: {
          attemptedFiles: files.length
        }
      })
      logError(error, {
        source: 'document-upload',
        operation: 'upload',
        rawMessage: error instanceof Error ? error.message : 'Upload failed',
        payload: {
          attemptedFiles: files.length
        }
      }, translated.userError)
      toast.error(translated.userError.message)
      setUploadError(translated.userError)
    } finally {
      setIsUploading(false)
    }
  }, [addUploadingDocument, updateUploadingDocument, removeUploadingDocument, refreshDocuments])

  const handleUpload = React.useCallback(() => {
    if (isUploading) return

    // Create file input dynamically (same approach as dashboard)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf'
    input.multiple = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        await handleFileUpload(files)
      }
      // Reset the input value so the same file can be selected again
      if (e.target) {
        (e.target as HTMLInputElement).value = ''
      }
    }
    input.click()
  }, [isUploading, handleFileUpload])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => handleUpload()
    window.addEventListener('open-document-upload', handler as EventListener)
    return () => {
      window.removeEventListener('open-document-upload', handler as EventListener)
    }
  }, [handleUpload])

  const handleUploadErrorAction = React.useCallback((action: ErrorAction) => {
    switch (action.intent) {
      case 'retry':
      case 'upload':
        setUploadError(null)
        handleUpload()
        break
      case 'signin':
        setUploadError(null)
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
        break
      case 'support':
        if (typeof window !== 'undefined') {
          window.open('mailto:support@cognileap.ai?subject=Upload%20Assistance', '_blank')
        }
        break
      case 'reload':
        if (typeof window !== 'undefined') {
          window.location.reload()
        }
        break
      case 'dismiss':
      default:
        setUploadError(null)
        break
    }
  }, [handleUpload])


  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

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
      // Clear all selections
      contextSelectedDocs.forEach(doc => removeSelectedDocument(doc.id))
      setSelectAll(false)
    } else {
      // Select all documents
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
    setNewDocumentName(document.title)
    setRenameDialog({open: true, document})
  }

  const handleRenameConfirm = async () => {
    if (!renameDialog.document || newDocumentName.trim() === renameDialog.document.title) {
      setRenameDialog({open: false, document: null})
      return
    }

    try {
      const { error } = await supabase
        .from('documents')
        .update({ title: newDocumentName.trim() })
        .eq('id', renameDialog.document.id)

      if (error) {
        console.error('Failed to rename document:', error)
        toast.error('Failed to rename document')
      } else {
        toast.success('Document renamed successfully!')
        if (renameDialog.document) {
          upsertDocument({ ...renameDialog.document, title: newDocumentName.trim() })
        }
      }
    } catch (error) {
      console.error('Failed to rename document:', error)
      toast.error('Failed to rename document')
    }

    setRenameDialog({open: false, document: null})
  }

  const handleRemove = (document: DocumentItem) => {
    setRemoveDialog({open: true, document})
  }

  const handleRemoveConfirm = async () => {
    if (!removeDialog.document) {
      setRemoveDialog({open: false, document: null})
      return
    }

    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', removeDialog.document.id)

      if (error) {
        console.error('Failed to remove document:', error)
        toast.error('Failed to remove document')
      } else {
        toast.success('Document removed successfully!')
        removeDocumentFromContext(removeDialog.document.id)
      }
    } catch (error) {
      console.error('Failed to remove document:', error)
      toast.error('Failed to remove document')
    }

    setRemoveDialog({open: false, document: null})
  }

  const handleMassRemove = () => {
    const count = contextSelectedDocs.length
    if (count === 0) return
    setMassRemoveDialog({open: true, count})
  }

  const handleMassRemoveConfirm = async () => {
    const docsToRemove = [...contextSelectedDocs]
    const totalCount = docsToRemove.length

    if (totalCount === 0) {
      setMassRemoveDialog({open: false, count: 0})
      return
    }

    setMassRemoveDialog({open: false, count: 0})

    let successCount = 0
    let failCount = 0

    // Delete all selected documents
    for (const doc of docsToRemove) {
      try {
        const { error } = await supabase
          .from('documents')
          .delete()
          .eq('id', doc.id)

        if (error) {
          console.error(`Failed to remove document ${doc.id}:`, error)
          failCount++
        } else {
          removeDocumentFromContext(doc.id)
          successCount++
        }
      } catch (error) {
        console.error(`Failed to remove document ${doc.id}:`, error)
        failCount++
      }
    }

    // Show appropriate toast messages
    if (successCount > 0 && failCount === 0) {
      toast.success(`Successfully removed ${successCount} ${successCount === 1 ? 'document' : 'documents'}`)
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`Removed ${successCount} ${successCount === 1 ? 'document' : 'documents'}, but ${failCount} failed`)
    } else if (failCount > 0) {
      toast.error(`Failed to remove ${failCount} ${failCount === 1 ? 'document' : 'documents'}`)
    }

    // Clear select all state if it was enabled
    setSelectAll(false)
  }

  // Update selectAll state when documents change
  React.useEffect(() => {
    if (documents.length > 0) {
      const selectedCount = documents.filter(doc => isDocumentSelected(doc.id)).length
      setSelectAll(selectedCount === documents.length)
    } else {
      setSelectAll(false)
    }
  }, [documents, contextSelectedDocs, isDocumentSelected])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[300] md:hidden"
          />

          {/* Panel */}
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{
              width: 320,
              opacity: 1,
              left: sidebarCollapsed ? 64 : 256
            }}
            exit={{ width: 0, opacity: 0 }}
            transition={{
              duration: 0.18,
              ease: [0.4, 0, 0.2, 1],
              type: "tween"
            }}
            className={cn(
              "fixed top-0 h-full bg-background border-r border-border shadow-2xl z-[400]",
              "flex flex-col overflow-hidden"
            )}
            style={{
              transformOrigin: "left center"
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Sources</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Toolbar */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  data-dashboard-upload-trigger
                  className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>



            {/* Document List */}
            {uploadError && (
              <ActionableErrorPanel error={uploadError} onAction={handleUploadErrorAction} />
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {documentsLoading && documents.length === 0 && uploadingDocuments.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-16 bg-muted/50 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : documents.length === 0 && uploadingDocuments.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    No documents yet
                  </p>
                  <Button
                    onClick={handleUpload}
                    disabled={isUploading}
                    size="sm"
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Upload PDF
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.length > 0 && contextSelectedDocs.length > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSelectAll}
                          className={`w-4 h-4 border rounded flex items-center justify-center shrink-0 transition-colors ${
                            selectAll
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/30 bg-transparent hover:border-primary/50'
                          }`}
                        >
                          {selectAll && (
                            <svg
                              className="w-2.5 h-2.5 text-primary-foreground"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                        <span>Select all sources</span>
                      </div>
                      <button
                        onClick={handleMassRemove}
                        className="text-destructive hover:text-destructive/80 transition-colors p-1 hover:bg-destructive/10 rounded"
                        title={`Delete ${contextSelectedDocs.length} selected ${contextSelectedDocs.length === 1 ? 'document' : 'documents'}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Show uploading documents first */}
                  <AnimatePresence mode="popLayout">
                    {uploadingDocuments.map((uploadingDoc) => (
                      <motion.div
                        key={uploadingDoc.id}
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, x: -20, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="group"
                      >
                        <div className={cn(
                          "flex items-center gap-2 p-2 rounded-lg transition-colors",
                          uploadingDoc.error ? "bg-destructive/10 border border-destructive/20" : "bg-primary/5 border border-primary/20"
                        )}>
                          {uploadingDoc.error ? (
                            <div className="w-4 h-4 shrink-0 text-destructive">
                              <X className="h-4 w-4" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 shrink-0">
                              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                            </div>
                          )}
                          <FileText className={cn(
                            "h-4 w-4 shrink-0",
                            uploadingDoc.error ? "text-destructive" : "text-primary"
                          )} />
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

                  {/* Show actual documents */}
                  {documents.map((document) => (
                    <div key={document.id} className="group">
                      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                        <button
                          onClick={() => handleDocumentSelect(document.id)}
                          className={`w-4 h-4 border rounded flex items-center justify-center shrink-0 transition-colors ${
                            isDocumentSelected(document.id)
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/30 bg-transparent hover:border-primary/50'
                          }`}
                        >
                          {isDocumentSelected(document.id) && (
                            <svg
                              className="w-2.5 h-2.5 text-primary-foreground"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => handleDocumentClick(document)}
                            className="text-sm font-medium text-left hover:text-primary transition-colors block w-full text-left"
                            title={document.title}
                          >
                            <div className="truncate" style={{ maxWidth: '180px' }}>
                              {document.title}
                            </div>
                          </button>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {document.page_count} pages • {formatFileSize(document.bytes)}
                          </p>
                        </div>

                        {/* 3-dot dropdown menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            >
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem 
                              className="text-xs cursor-pointer" 
                              onClick={() => handleRename(document)}
                            >
                              <Edit3 className="h-3 w-3 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-xs text-destructive cursor-pointer" 
                              onClick={() => handleRemove(document)}
                            >
                              <Trash2 className="h-3 w-3 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Rename Dialog */}
          <AlertDialog open={renameDialog.open} onOpenChange={(open) => !open && setRenameDialog({open: false, document: null})}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rename Document</AlertDialogTitle>
                <AlertDialogDescription>
                  Enter a new name for &quot;{renameDialog.document?.title}&quot;
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={newDocumentName}
                onChange={(e) => setNewDocumentName(e.target.value)}
                placeholder="Document name"
                className="mb-4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameConfirm()
                  }
                }}
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setRenameDialog({open: false, document: null})}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleRenameConfirm}>
                  Rename
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Remove Dialog */}
          <AlertDialog open={removeDialog.open} onOpenChange={(open) => !open && setRemoveDialog({open: false, document: null})}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Document</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove &quot;{removeDialog.document?.title}&quot;? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setRemoveDialog({open: false, document: null})}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleRemoveConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Mass Remove Dialog */}
          <AlertDialog open={massRemoveDialog.open} onOpenChange={(open) => !open && setMassRemoveDialog({open: false, count: 0})}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Multiple Documents</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove {massRemoveDialog.count} {massRemoveDialog.count === 1 ? 'document' : 'documents'}? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setMassRemoveDialog({open: false, count: 0})}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleMassRemoveConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Remove All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AnimatePresence>
  )
}
