import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json()

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    console.log(`Starting content extraction for document: ${documentId}`)

    // Get document info
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, storage_path, processing_status, document_content')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: `Document not found: ${docError?.message}` }, { status: 404 })
    }

    // Check if content already exists
    if (document.document_content && document.document_content.trim()) {
      console.log(`Document already has content: ${document.document_content.length} characters`)
      return NextResponse.json({
        success: true,
        message: 'Document already has extracted content',
        contentLength: document.document_content.length
      })
    }

    console.log(`Found document: ${document.title}`)
    console.log(`Storage path: ${document.storage_path}`)

    // Download the PDF file from Supabase storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path)

    if (downloadError) {
      console.error('Download error:', downloadError)
      return NextResponse.json({ error: `Failed to download PDF: ${downloadError.message}` }, { status: 500 })
    }

    console.log('PDF downloaded successfully')

    // Convert blob to buffer
    const arrayBuffer = await fileData.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log(`PDF size: ${buffer.length} bytes`)

    // Extract text using pdf2json
    try {
      const PDFParser = (await import('pdf2json')).default

      // Suppress PDF.js warnings temporarily
      const originalWarn = console.warn
      console.warn = () => {} // Suppress all warnings during PDF parsing

      const extractedText = await new Promise<string>((resolve, reject) => {
        const pdfParser = new PDFParser()

        pdfParser.on('pdfParser_dataError', (errData: Error | { parserError: Error }) => {
          if (errData instanceof Error) {
            reject(errData)
          } else {
            reject(errData.parserError)
          }
        })

        pdfParser.on('pdfParser_dataReady', (pdfData: { Pages: Array<{ Texts: Array<{ R: Array<{ T: string }> }> }> }) => {
          try {
            let text = ''
            if (pdfData.Pages) {
              pdfData.Pages.forEach((page: { Texts: Array<{ R: Array<{ T: string }> }> }, pageNum: number) => {
                console.log(`Processing page ${pageNum + 1}/${pdfData.Pages.length}`)
                if (page.Texts) {
                  page.Texts.forEach((textItem: { R: Array<{ T: string }> }) => {
                    if (textItem.R) {
                      textItem.R.forEach((textRun: { T: string }) => {
                        if (textRun.T) {
                          // Decode the text and add spaces
                          text += decodeURIComponent(textRun.T) + ' '
                        }
                      })
                    }
                  })
                  text += '\n' // Add line break after each page
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

      console.warn = originalWarn // Restore console.warn
      console.log(`Extracted ${extractedText.length} characters from PDF`)

      // Show first 500 characters as preview
      const preview = extractedText.substring(0, 500)
      console.log('Preview of extracted content:')
      console.log('='.repeat(50))
      console.log(preview + '...')
      console.log('='.repeat(50))

      // Count actual tokens using Gemini API
      let actualTokens: number | null = null
      let tokenCountMethod: 'api_count' | 'estimation' = 'estimation'
      
      try {
        const { countDocumentTokens } = await import('@/lib/token-counter')
        const result = await countDocumentTokens(
          documentId,
          'gemini-2.0-flash-exp', // Use the model for counting
          extractedText
        )
        actualTokens = result.totalTokens
        tokenCountMethod = result.method
        console.log(`Document tokens: ${actualTokens} (${tokenCountMethod})`)
      } catch (tokenError) {
        console.warn(`Failed to count tokens, will use estimation:`, tokenError)
        // Estimate as fallback
        actualTokens = Math.ceil(extractedText.length / 4)
        tokenCountMethod = 'estimation'
      }

      // Update document with extracted content and token count
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          document_content: extractedText,
          processing_status: 'completed',
          chunk_count: 1,
          actual_tokens: actualTokens,
          token_count_method: tokenCountMethod
        })
        .eq('id', documentId)

      if (updateError) {
        console.error('Update error:', updateError)
        return NextResponse.json({ error: `Failed to update document: ${updateError.message}` }, { status: 500 })
      }

      console.log(`✅ Successfully extracted and saved PDF content! (${actualTokens} tokens, ${tokenCountMethod})`)

      return NextResponse.json({
        success: true,
        message: 'Content extracted and saved successfully',
        contentLength: extractedText.length,
        actualTokens,
        tokenCountMethod,
        preview: preview
      })

    } catch (textError) {
      console.error('Text extraction error:', textError)
      return NextResponse.json({
        error: `Failed to extract text: ${textError instanceof Error ? textError.message : 'Unknown error'}`
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Extraction error:', error)
    return NextResponse.json({
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 })
  }
}