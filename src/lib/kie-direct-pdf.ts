import type { ChatMessage, TokenUsage } from './ai-providers'

export interface DirectPdfCompletionResult {
  text: string
  model: string
  usage: TokenUsage | null
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
    text: data.choices?.[0]?.message?.content || '',
    model,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens ?? 0,
      completionTokens: data.usage.completion_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0,
    } : null,
  }
}
