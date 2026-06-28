import type { ChatMessage, TokenUsage } from './ai-providers'

export interface DirectPdfCompletionResult {
  text: string
  model: string
  usage: TokenUsage | null
}

export function cleanKieArtifacts(text: string): string {
  return text
    .replace(/\[cite_start\]/g, '')
    .replace(/\[cite:\s*[\d,\s-]+\]/g, '')
    .replace(/\s+\./g, '.')
    .trim()
}

export function shouldUseDirectPdfForQuery(extractedContent: string, userMessage: string): boolean {
  const text = extractedContent.trim()
  const contentLength = text.length
  if (contentLength === 0) return true

  const alphaNumericChars = (text.match(/[A-Za-z0-9]/g) || []).length
  const alphaNumericRatio = alphaNumericChars / Math.max(contentLength, 1)
  const wordCount = text.split(/\s+/).filter((word) => /[A-Za-z0-9]{2,}/.test(word)).length
  const hasReadableExtraction = wordCount >= 80 && alphaNumericRatio >= 0.45

  if (hasReadableExtraction) return false
  if (contentLength < 500) return true

  const query = userMessage.toLowerCase()
  const needsPreciseDocumentLookup = /\b(point|section|subsection|subtopic|heading|chapter|page|diagram|figure|table|list|count|how many|exact|name them|cite|quote)\b/.test(query)
  return needsPreciseDocumentLookup
}

export function shouldAttachDocumentContextForQuery(userMessage: string): boolean {
  const query = userMessage.trim().toLowerCase()
  const words = query.split(/\s+/).filter(Boolean)
  if (words.length === 0) return false

  const isShortSocialPrompt =
    words.length <= 12 &&
    /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|nice|test|ping)\b/.test(query)

  if (isShortSocialPrompt) return false

  return true
}

export async function generateKieDirectPdfCompletion({
  apiKey,
  model,
  messages,
  pdfUrls,
  maxTokens = 4096,
  temperature = 0.5,
}: {
  apiKey: string
  model: string
  messages: ChatMessage[]
  pdfUrls: string[]
  maxTokens?: number
  temperature?: number
}): Promise<DirectPdfCompletionResult> {
  if (!apiKey) throw new Error('KIE_API_KEY is required for direct PDF reading.')
  if (pdfUrls.length === 0) throw new Error('At least one PDF URL is required.')

  const promptText = messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join('\n\n')

  const response = await fetch(`https://api.kie.ai/${model}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${promptText}\n\nSome selected PDFs have little or no extractable text. Read the attached PDF file(s) directly. If the user asks a general question, answer normally; if the user asks about a selected document, use the document content directly.`,
          },
          ...pdfUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      }],
      max_tokens: maxTokens,
      temperature,
    }),
  })

  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(`${response.status} ${responseText || response.statusText}`)
  }

  const data = JSON.parse(responseText) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }

  return {
    text: cleanKieArtifacts(data.choices?.[0]?.message?.content || ''),
    model,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens ?? 0,
      completionTokens: data.usage.completion_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0,
    } : null,
  }
}
