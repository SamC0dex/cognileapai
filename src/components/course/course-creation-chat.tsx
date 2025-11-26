'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, FileText, Upload, Camera, HelpCircle, X } from 'lucide-react'
import { useDocuments } from '@/contexts/documents-context'
import { useCourseStore } from '@/lib/course-store'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui'

const MIN_HEIGHT = 120
const MAX_HEIGHT = 200

export function CourseCreationChat() {
  const router = useRouter()
  const { selectedDocuments, removeSelectedDocument, addUploadingDocument, updateUploadingDocument, removeUploadingDocument, addSelectedDocument } = useDocuments()
  const { startGeneration, isGenerating } = useCourseStore()
  const [customInstructions, setCustomInstructions] = React.useState('')
  const [textareaHeight, setTextareaHeight] = React.useState(MIN_HEIGHT)
  const [isUploading, setIsUploading] = React.useState(false)
  const [isStartingGeneration, setIsStartingGeneration] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Calculate textarea height based on content
  const calculateHeight = React.useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_HEIGHT}px`
      const scrollHeight = textareaRef.current.scrollHeight
      const newHeight = Math.min(Math.max(scrollHeight, MIN_HEIGHT), MAX_HEIGHT)
      setTextareaHeight(newHeight)
      textareaRef.current.style.height = `${newHeight}px`
    }
  }, [])

  React.useEffect(() => {
    calculateHeight()
  }, [customInstructions, calculateHeight])

  const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCustomInstructions(e.target.value)
  }, [])

  const handleFileUpload = React.useCallback(async () => {
    if (isUploading) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf'
    input.multiple = false
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length > 0) {
        setIsUploading(true)
        const file = files[0]
        
        const tempId = `uploading-${Date.now()}-${Math.random()}`
        const documentTitle = file.name.replace(/\.pdf$/i, '')
        
        addUploadingDocument({
          id: tempId,
          title: documentTitle,
          size: file.size,
          isUploading: true,
          progress: 0
        })

        try {
          const formData = new FormData()
          formData.append('file', file)

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          })

          if (response.ok) {
            const result = await response.json()
            removeUploadingDocument(tempId)

            const uploadedDocument = result.document

            if (uploadedDocument) {
              addSelectedDocument({
                id: uploadedDocument.id,
                title: uploadedDocument.title,
                size: uploadedDocument.bytes || undefined,
                processing_status: uploadedDocument.processing_status || undefined
              })

              if (result.alreadyExists) {
                toast.info(`"${uploadedDocument.title || file.name}" is already uploaded and selected.`)
              } else {
                toast.success(`"${file.name}" uploaded and selected!`)
              }
            } else {
              toast.success(`"${file.name}" uploaded successfully!`)
            }
          } else {
            const error = await response.json()
            updateUploadingDocument(tempId, {
              error: error.error || 'Upload failed'
            })
            toast.error(error.error || 'Upload failed')
            setTimeout(() => removeUploadingDocument(tempId), 3000)
          }
        } catch (error) {
          updateUploadingDocument(tempId, {
            error: 'Network error'
          })
          toast.error('Upload failed')
          console.error('Upload error:', error)
          setTimeout(() => removeUploadingDocument(tempId), 3000)
        } finally {
          setIsUploading(false)
        }
      }
    }
    input.click()
  }, [isUploading, addUploadingDocument, updateUploadingDocument, removeUploadingDocument, addSelectedDocument])

  const handleGenerateCourse = async () => {
    if (selectedDocuments.length === 0) {
      toast.error('Please select at least one document from the Sources panel')
      return
    }

    if (isStartingGeneration || isGenerating) {
      return
    }

    const selectedDoc = selectedDocuments[0]

    setIsStartingGeneration(true)
    try {
      const courseId = await startGeneration(
        selectedDoc.id,
        selectedDoc.title,
        customInstructions || undefined
      )

      if (courseId) {
        // Redirect to course detail page where generation will show in real-time
        toast.success('Course generation started!')
        router.push(`/courses/${courseId}`)
      }
    } catch (error) {
      console.error('Failed to start course generation:', error)
      toast.error('Failed to start course generation')
    } finally {
      setIsStartingGeneration(false)
    }
  }

  const canGenerate = selectedDocuments.length > 0 && !isStartingGeneration && !isGenerating

  return (
    <div className="h-full flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted/10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-teal-600"
          >
            <Sparkles className="h-8 w-8 text-white" />
          </motion.div>

          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              Your gentle learning companion
            </h2>
            <p className="text-base text-muted-foreground">
              Start with anything - notes, questions, or just a topic
            </p>
          </div>
        </div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          {/* Selected Documents Pills */}
          <AnimatePresence>
            {selectedDocuments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 justify-center"
              >
                {selectedDocuments.map(doc => (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="group inline-flex items-center gap-2 px-3 py-2 bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-300 text-sm rounded-full border border-teal-200 dark:border-teal-800/30"
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium max-w-xs truncate" title={doc.title}>
                      {doc.title}
                    </span>
                    <button
                      onClick={() => removeSelectedDocument(doc.id)}
                      className="w-4 h-4 rounded-full hover:bg-teal-200 dark:hover:bg-teal-800/40 flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      title="Remove document"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area */}
          <div className="relative bg-background rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
            <textarea
              ref={textareaRef}
              value={customInstructions}
              onChange={handleInputChange}
              placeholder="What would you like to learn about today? Ask a question, share notes, or just type a topic..."
              className="w-full resize-none bg-transparent text-base placeholder:text-muted-foreground focus:outline-none p-4 rounded-2xl"
              style={{ 
                height: textareaHeight,
                minHeight: MIN_HEIGHT,
                maxHeight: MAX_HEIGHT
              }}
            />
          </div>

          {/* Create Button */}
          <Button
            onClick={handleGenerateCourse}
            disabled={!canGenerate}
            size="lg"
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium text-base py-6 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStartingGeneration || isGenerating ? (
              <>
                <div className="mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Starting generation...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Create my gentle lesson
              </>
            )}
          </Button>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-4 pt-2">
            <button
              onClick={handleFileUpload}
              disabled={isUploading}
              className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center">
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="h-5 w-5 text-teal-600" />
                )}
              </div>
              <span className="text-sm font-medium text-foreground">Upload notes</span>
            </button>

            <button
              onClick={() => {
                // Open documents panel
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('expand-documents-panel'))
                }
              }}
              className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted/50 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-foreground">Select docs</span>
            </button>

            <button
              onClick={() => router.push('/chat')}
              className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted/50 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-foreground">Get help</span>
            </button>
          </div>

          {/* Footer */}
          <p className="text-sm text-center text-muted-foreground pt-2">
            Just 5 minutes • Zero pressure • You&apos;ve got this
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
