// Pure configuration - no external dependencies needed

// Default Model Definitions (Kie.ai provider)
export const GEMINI_MODELS = {
  // Ultra-fast for quick interactions
  FLASH_LITE: {
    name: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    maxTokens: 1000000,
    temperature: 0.7,
    description: 'Fast model for simple queries and follow-ups',
    avgResponseTime: 150, // milliseconds
    costTier: 'low'
  },

  // Balanced for most tasks (default)
  FLASH: {
    name: 'gemini-3-flash',
    displayName: 'Gemini 3 Flash',
    maxTokens: 1000000,
    temperature: 0.7,
    description: 'Best balance of speed, capability, and cost via Kie.ai',
    avgResponseTime: 500,
    costTier: 'low'
  },

  // Most capable for complex analysis
  PRO: {
    name: 'gemini-3-pro',
    displayName: 'Gemini 3 Pro',
    maxTokens: 1000000,
    temperature: 0.7,
    description: 'Most capable for complex reasoning and analysis',
    avgResponseTime: 2000,
    costTier: 'medium'
  }
} as const

export type GeminiModelKey = keyof typeof GEMINI_MODELS

// Message analysis for model selection
export interface MessageContext {
  content: string
  chatType: 'course' | 'lesson' | 'document' | 'general'
  isFollowUp: boolean
  messageHistory: number
  hasDocumentContext: boolean
  requestedOutputType?: 'summary' | 'notes' | 'study_guide' | 'flashcards' | 'analysis'
}

// Model Selection Logic
export class GeminiModelSelector {
  
  /**
   * Select the optimal Gemini model based on message context
   */
  static selectModel(context: MessageContext): GeminiModelKey {
    const { content } = context
    
    // Word count analysis
    const wordCount = content.trim().split(/\s+/).length
    
    // Use Flash-Lite for quick interactions
    if (this.shouldUseFlashLite(context, wordCount)) {
      return 'FLASH_LITE'
    }
    
    // Use Pro for complex tasks
    if (this.shouldUsePro(context, wordCount)) {
      return 'PRO'
    }
    
    // Default to Flash for balanced performance
    return 'FLASH'
  }
  
  /**
   * Determine if Flash-Lite is appropriate
   */
  private static shouldUseFlashLite(context: MessageContext, wordCount: number): boolean {
    const { content, isFollowUp, messageHistory } = context
    
    // Quick follow-up questions
    if (isFollowUp && messageHistory > 2 && wordCount < 50) {
      return true
    }
    
    // Simple queries
    if (wordCount < 100 && this.isSimpleQuery(content)) {
      return true
    }
    
    // Clarification requests
    if (this.isClarificationRequest(content)) {
      return true
    }
    
    return false
  }
  
  /**
   * Determine if Pro model is needed
   */
  private static shouldUsePro(context: MessageContext, wordCount: number): boolean {
    const { chatType, requestedOutputType, hasDocumentContext, content } = context
    
    // Complex document analysis
    if (hasDocumentContext && chatType === 'document' && wordCount > 200) {
      return true
    }
    
    // Detailed course/lesson planning
    if ((chatType === 'course' || chatType === 'lesson') && wordCount > 150) {
      return true
    }
    
    // Specific complex outputs
    if (requestedOutputType && ['analysis', 'study_guide'].includes(requestedOutputType)) {
      return true
    }
    
    // Complex reasoning indicators
    if (this.requiresComplexReasoning(content)) {
      return true
    }
    
    return false
  }
  
  /**
   * Check if query is simple factual question
   */
  private static isSimpleQuery(content: string): boolean {
    const simplePatterns = [
      /^(what is|who is|when is|where is|how many)/i,
      /^(yes|no|maybe|sure|okay|thanks|thank you)/i,
      /^(define|explain briefly)/i,
      /\?$/
    ]
    
    return simplePatterns.some(pattern => pattern.test(content.trim()))
  }
  
  /**
   * Check if message is asking for clarification
   */
  private static isClarificationRequest(content: string): boolean {
    const clarificationPatterns = [
      /^(can you|could you|would you|please)/i,
      /(more details|elaborate|expand|clarify|explain further)/i,
      /(what do you mean|i don't understand|confused)/i
    ]
    
    return clarificationPatterns.some(pattern => pattern.test(content))
  }
  
  /**
   * Check if content requires complex reasoning
   */
  private static requiresComplexReasoning(content: string): boolean {
    const complexPatterns = [
      /(analyze|compare|contrast|evaluate|synthesize)/i,
      /(create.*comprehensive|develop.*detailed|design.*complete)/i,
      /(multiple steps|step by step|systematic|methodology)/i,
      /(pros and cons|advantages.*disadvantages|trade.*offs)/i,
      /(research|investigation|in-depth|thorough)/i
    ]
    
    return complexPatterns.some(pattern => pattern.test(content))
  }

  /**
   * Get model name for Google GenAI SDK
   */
  static getModelInstance(modelKey: GeminiModelKey): string {
    const config = GEMINI_MODELS[modelKey]
    return config.name
  }

  /**
   * Get safety settings for Google GenAI SDK
   */
  static getSafetySettings() {
    return [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
    ]
  }
  
  /**
   * Get model name string for Google GenAI SDK
   */
  static getModelName(modelKey: GeminiModelKey): string {
    return GEMINI_MODELS[modelKey].name
  }

  /**
   * Get model configuration
   */
  static getModelConfig(modelKey: GeminiModelKey) {
    return GEMINI_MODELS[modelKey]
  }
  
  /**
   * Get generation settings for model
   */
  static getGenerationSettings(modelKey: GeminiModelKey, customTemperature?: number) {
    const config = GEMINI_MODELS[modelKey]
    return {
      temperature: customTemperature ?? config.temperature,
      maxTokens: config.maxTokens,
      topP: 0.8,
      topK: 40,
      frequencyPenalty: 0,
      presencePenalty: 0
    }
  }
}

// Utility function for environment validation
// Checks for Kie.ai key first (preferred), then falls back to Google key
export function validateGeminiConfig(): { isValid: boolean; error?: string } {
  const kieKey = process.env.KIE_API_KEY
  if (kieKey) {
    return { isValid: true }
  }

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY

  if (!apiKey) {
    return {
      isValid: false,
      error: 'No AI API key configured. Set KIE_API_KEY (preferred) or GOOGLE_GENERATIVE_AI_API_KEY in your .env.local.'
    }
  }

  return { isValid: true }
}

// Export for easy access
export const gemini = {
  models: GEMINI_MODELS,
  selector: GeminiModelSelector,
  validate: validateGeminiConfig
}
