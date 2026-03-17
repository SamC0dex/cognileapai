/**
 * Server-side usage tracking helper
 * Records token usage to the usage_records table after each AI API call
 */

import { createClient } from '@supabase/supabase-js'
import { findModel, type AIProvider } from './model-registry'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RecordUsageParams {
  userId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  source: 'chat' | 'study-tool'
  sourceId?: string
}

/**
 * Record a single AI API call's token usage and computed cost.
 * Runs fire-and-forget — errors are logged but never thrown.
 */
export async function recordUsage(params: RecordUsageParams): Promise<void> {
  try {
    const { userId, provider, model, inputTokens, outputTokens, totalTokens, source, sourceId } = params

    // Look up pricing from model registry
    const modelInfo = findModel(model, provider as AIProvider)
    const inputCostPer1M = modelInfo?.inputCostPer1M ?? 0
    const outputCostPer1M = modelInfo?.outputCostPer1M ?? 0

    const inputCost = (inputTokens / 1_000_000) * inputCostPer1M
    const outputCost = (outputTokens / 1_000_000) * outputCostPer1M
    const totalCost = inputCost + outputCost

    const { error } = await serviceSupabase
      .from('usage_records')
      .insert({
        user_id: userId,
        provider,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: totalCost,
        source,
        source_id: sourceId || null,
      })

    if (error) {
      console.error('[UsageTracker] Failed to record:', error.message)
    }
  } catch (err) {
    console.error('[UsageTracker] Error recording usage:', err)
  }
}
