import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { supabase as serviceSupabase } from '@/lib/supabase'
import PDFParser from 'pdf2json'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const officeParser = require('officeparser') as { parseOfficeAsync: (input: Buffer) => Promise<string> }

// TypeScript interfaces for PDF parser data structures
interface PDFTextRun {
  T: string // Encoded text content
}

interface PDFTextItem {
  R: PDFTextRun[] // Array of text runs
}

interface PDFPage {
  Texts: PDFTextItem[] // Array of text items on the page
}

interface PDFParserData {
  Pages: PDFPage[] // Array of pages in the PDF
}


// Database document interface (based on Supabase schema)
interface DatabaseDocument {
  id: string
  title: string
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | null
  error_message?: string | null
  page_count: number
  bytes?: number | null
  storage_path?: string | null
  chunk_count?: number | null
  document_content?: string | null
  checksum?: string | null
  created_at: string
  updated_at: string
}

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heic',
}

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif'])
const OFFICE_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf', 'text/rtf',
])

export async function POST(req: NextRequest) {
  try {
    console.log('Upload API called')

    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Authentication error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Authenticated user:', user.id)

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileType = MIME_TO_EXT[file.type]
    if (!fileType) {
      return NextResponse.json({
        error: 'Unsupported file type.',
        details: `"${file.type}" is not supported. Accepted: PDF, Word, PowerPoint, Excel, LibreOffice, RTF, TXT, CSV, JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC.`
      }, { status: 400 })
    }

    // File size validation (only validate binary file size)
    const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB hard limit

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: 'File too large',
        message: `File exceeds the maximum size limit of 100MB. Your file is ${Math.round(file.size / (1024 * 1024))}MB.`,
        details: 'Please try a smaller document or split it into multiple parts.',
        size: file.size,
        limit: MAX_FILE_SIZE
      }, { status: 413 })
    }

    console.log('Processing file:', file.name, file.size, 'bytes')

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const checksum = createHash('sha256').update(buffer).digest('hex')

    // Check for duplicates within user's own documents only
    const { data: duplicateDocument, error: duplicateError } = await supabase
      .from('documents')
      .select('id, title, page_count, bytes, storage_path, processing_status, chunk_count, error_message, document_content, created_at, updated_at')
      .eq('checksum', checksum)
      .eq('user_id', user.id)
      .maybeSingle()

    if (duplicateError && duplicateError.code !== 'PGRST116') {
      console.error('Failed to check for duplicate document:', duplicateError)
    }

    const handleDuplicate = async (document: DatabaseDocument) => {
      console.log(`Duplicate document detected for checksum ${checksum}, reusing document ${document.id}`)

      let nextStatus = document.processing_status || 'processing'

      if (document.processing_status === 'failed') {
        nextStatus = 'processing'
        await supabase
          .from('documents')
          .update({
            processing_status: 'processing',
            error_message: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', document.id)

        queueBackgroundProcessing(document.id, buffer, file.type)
      } else {
        await supabase
          .from('documents')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', document.id)
      }

      return NextResponse.json({
        success: true,
        alreadyExists: true,
        document: {
          ...document,
          processing_status: nextStatus,
          hasStudyGuide: false,
          hasSummary: false,
          hasNotes: false
        }
      })
    }

    if (duplicateDocument) {
      return handleDuplicate(duplicateDocument)
    }

    // Check existing documents for the authenticated user only
    const { data: existingCandidates, error: existingError } = await supabase
      .from('documents')
      .select('id, title, page_count, bytes, storage_path, processing_status, chunk_count, error_message, document_content, created_at, updated_at')
      .is('checksum', null)
      .eq('bytes', file.size)
      .eq('user_id', user.id)

    if (existingError) {
      console.error('Failed to fetch checksum-less documents:', existingError)
    } else if (existingCandidates && existingCandidates.length > 0) {
      for (const candidate of existingCandidates) {
        if (!candidate.storage_path) continue

        try {
          const downloadResult = await serviceSupabase.storage.from('documents').download(candidate.storage_path)
          if (downloadResult.error) {
            console.error(`Failed to download existing document ${candidate.id}:`, downloadResult.error)
            continue
          }

          const candidateBuffer = Buffer.from(await downloadResult.data.arrayBuffer())
          const candidateChecksum = createHash('sha256').update(candidateBuffer).digest('hex')

          if (candidateChecksum === checksum) {
            const { data: updatedDocument, error: updateError } = await supabase
              .from('documents')
              .update({ checksum, updated_at: new Date().toISOString() })
              .eq('id', candidate.id)
              .select('id, title, page_count, bytes, storage_path, processing_status, chunk_count, error_message, document_content, created_at, updated_at')
              .single()

            if (updateError) {
              console.error(`Failed to stamp checksum on existing document ${candidate.id}:`, updateError)
              continue
            }

            return handleDuplicate(updatedDocument)
          }
        } catch (candidateError) {
          console.error(`Failed to verify existing document ${candidate.id}:`, candidateError)
        }
      }
    }

    let pageCount = 0
    try {
      if (file.type === 'application/pdf') {
        // Suppress PDF.js warnings temporarily
        const originalWarn = console.warn
        console.warn = () => {} // Suppress all warnings during PDF parsing

        const parsePdf = () => {
          return new Promise((resolve, reject) => {
            const pdfParser = new PDFParser()

            pdfParser.on('pdfParser_dataError', (errMsg: Error | { parserError: Error }) => {
              const errorMessage = errMsg instanceof Error ? errMsg.message : errMsg.parserError.message
              reject(new Error(errorMessage))
            })

            pdfParser.on('pdfParser_dataReady', (pdfData: PDFParserData) => {
              const pages = pdfData.Pages ? pdfData.Pages.length : 0
              resolve(pages)
            })

            pdfParser.parseBuffer(buffer)
          })
        }

        pageCount = await parsePdf() as number
        console.warn = originalWarn // Restore console.warn
        console.log('PDF parsed successfully, pages:', pageCount)
      } else {
        pageCount = 1 // For all non-PDF types, default to 1
      }
    } catch (parseError) {
      console.error('Page count error:', parseError)
      pageCount = 1
    }

    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    // Store under per-user prefix to reduce discoverability and enforce server mediation
    const fileName = `${user.id}/${Date.now()}-${sanitizedFileName}`
    const { data: uploadData, error: uploadError } = await serviceSupabase.storage
      .from('documents')
      .upload(fileName, buffer, {
        contentType: file.type
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    console.log('File uploaded successfully:', uploadData.path)

    // Insert document with user_id to ensure proper ownership
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        title: file.name.replace(/\.[^.]+$/, ''),
        page_count: pageCount,
        bytes: file.size,
        storage_path: uploadData.path,
        processing_status: 'processing',
        checksum,
        user_id: user.id, // Critical: Associate document with user
        file_type: fileType,
      })
      .select()
      .single()

    if (dbError) {
      if (dbError.code === '23505') {
        console.warn(`Checksum conflict detected during insert for checksum ${checksum}`)

        // Only check for conflicts within user's own documents
            const { data: conflictingDocument, error: conflictError } = await supabase
          .from('documents')
          .select('id, title, page_count, bytes, storage_path, processing_status, chunk_count, error_message, document_content, created_at, updated_at')
          .eq('checksum', checksum)
          .eq('user_id', user.id)
          .maybeSingle()

        // Clean up the newly uploaded file since we'll use the existing one
        await serviceSupabase.storage.from('documents').remove([uploadData.path])

        if (conflictError && conflictError.code !== 'PGRST116') {
          console.error('Failed to retrieve conflicting document:', conflictError)
          return NextResponse.json({
            error: 'Document already exists',
            message: 'This document has already been uploaded. Please check your Sources panel.',
            details: 'If you need to re-upload, please delete the existing document first.'
          }, { status: 409 })
        } else if (conflictingDocument) {
          return handleDuplicate(conflictingDocument)
        } else {
          // Checksum exists but not for this user (shouldn't happen due to unique constraint)
          // Return generic error without revealing other users' documents
          console.error('Checksum exists but no matching document found for user:', user.id)
          return NextResponse.json({
            error: 'Upload failed',
            message: 'Unable to process this document. Please try again with a different file.',
            details: 'If the problem persists, please contact support.'
          }, { status: 409 })
        }
      }

      console.error('Database error:', dbError)
      await serviceSupabase.storage.from('documents').remove([uploadData.path])
      return NextResponse.json({ error: 'Failed to save document', details: dbError.message }, { status: 500 })
    }

    console.log('Document created successfully:', document.id)

    await supabase
      .from('sections')
      .insert({
        document_id: document.id,
        ord: 1,
        title: 'Full Document',
        page_start: 1,
        page_end: pageCount > 0 ? pageCount : 1
      })

    queueBackgroundProcessing(document.id, buffer, file.type)

    return NextResponse.json({
      success: true,
      document: {
        ...document,
        hasStudyGuide: false,
        hasSummary: false,
        hasNotes: false,
        processing_status: 'processing'
      }
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const originalWarn = console.warn
    console.warn = () => {}

    const pdfParser = new PDFParser()

    pdfParser.on('pdfParser_dataError', (errMsg: Error | { parserError: Error }) => {
      console.warn = originalWarn
      const errorMessage = errMsg instanceof Error ? errMsg.message : errMsg.parserError.message
      reject(new Error(errorMessage))
    })

    pdfParser.on('pdfParser_dataReady', (pdfData: PDFParserData) => {
      console.warn = originalWarn
      try {
        let text = ''
        if (pdfData.Pages) {
          pdfData.Pages.forEach((page: PDFPage) => {
            if (page.Texts) {
              page.Texts.forEach((textItem: PDFTextItem) => {
                if (textItem.R) {
                  textItem.R.forEach((textRun: PDFTextRun) => {
                    if (textRun.T) {
                      text += decodeURIComponent(textRun.T) + ' '
                    }
                  })
                }
              })
              text += '\n'
            }
          })
        }
        resolve(text.trim())
      } catch (error) {
        reject(error)
      }
    })

    pdfParser.parseBuffer(buffer)
  })
}

async function extractTextFromImage(buffer: Buffer, _mimeType?: string): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY not set')

  const base64 = buffer.toString('base64')

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
      })
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Cloud Vision API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  const annotation = data.responses?.[0]?.fullTextAnnotation
  return annotation?.text?.trim() ?? ''
}

async function extractText(mimeType: string, buffer: Buffer): Promise<string> {
  if (mimeType === 'application/pdf') {
    return await extractPdfText(buffer)
  }
  if (OFFICE_MIMES.has(mimeType)) {
    const text = await officeParser.parseOfficeAsync(buffer)
    return typeof text === 'string' ? text.trim() : ''
  }
  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return buffer.toString('utf-8').trim()
  }
  if (IMAGE_MIMES.has(mimeType)) {
    return await extractTextFromImage(buffer, mimeType)
  }
  return ''
}

// Enhanced background processing function with document text extraction
// Uses service role client to bypass RLS since this runs in background
async function startBackgroundProcessing(documentId: string, buffer: Buffer, mimeType: string) {
  try {
    console.log(`[Background] Starting document processing for document ${documentId}`)

    // Update status to processing (using service role client)
    await serviceSupabase
      .from('documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId)

    // Extract text content from document
    let extractedText = ''
    try {
      extractedText = await extractText(mimeType, buffer)
      console.log(`[Background] Extracted ${extractedText.length} characters from document`)

      // Count tokens using estimation
      let actualTokens: number | null = null
      let tokenCountMethod: 'api_count' | 'estimation' = 'estimation'

      try {
        const { countDocumentTokens } = await import('@/lib/token-counter')
        const result = await countDocumentTokens(
          documentId,
          'gemini-3-flash', // Model reference for cache key
          extractedText
        )
        actualTokens = result.totalTokens
        tokenCountMethod = result.method
        console.log(`[Background] Document tokens: ${actualTokens} (${tokenCountMethod})`)
      } catch (tokenError) {
        console.warn(`[Background] Failed to count tokens, will use estimation:`, tokenError)
        // Estimate as fallback
        actualTokens = Math.ceil(extractedText.length / 4)
        tokenCountMethod = 'estimation'
      }

      // Store the extracted text and token count in the document_content column (using service role)
      await serviceSupabase
        .from('documents')
        .update({
          processing_status: 'completed',
          chunk_count: 1, // For now, we store as one chunk
          document_content: extractedText, // Store the full text
          actual_tokens: actualTokens,
          token_count_method: tokenCountMethod
        })
        .eq('id', documentId)

      console.log(`[Background] Document text extraction completed for document ${documentId} (${actualTokens} tokens, ${tokenCountMethod})`)

    } catch (textError) {
      console.error(`[Background] Text extraction failed, but marking as completed:`, textError)

      // Even if text extraction fails, mark as completed so UI shows ready (using service role)
      await serviceSupabase
        .from('documents')
        .update({
          processing_status: 'completed',
          chunk_count: 0,
          error_message: 'Text extraction failed, but document is available'
        })
        .eq('id', documentId)
    }

  } catch (error) {
    console.error(`[Background] Processing failed for document ${documentId}:`, error)

    await serviceSupabase
      .from('documents')
      .update({
        processing_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed'
      })
      .eq('id', documentId)
  }
}

function queueBackgroundProcessing(documentId: string, buffer: Buffer, mimeType: string) {
  startBackgroundProcessing(documentId, buffer, mimeType).catch(error => {
    console.error(`Background document processing failed for document ${documentId}:`, error)

    // Use service role client for background updates
    serviceSupabase
      .from('documents')
      .update({
        processing_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed'
      })
      .eq('id', documentId)
      .then(() => console.log(`Updated document ${documentId} with error status`))
  })
}
