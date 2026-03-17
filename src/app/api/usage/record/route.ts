import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { findModel, type AIProvider } from '@/lib/model-registry'

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface UsageRecordRequest {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  source: 'chat' | 'study-tool'
  sourceId?: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: UsageRecordRequest = await req.json()
    const { provider, model, inputTokens, outputTokens, totalTokens, source, sourceId } = body

    if (!provider || !model || totalTokens === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Look up pricing from model registry
    const modelInfo = findModel(model, provider as AIProvider)
    const inputCostPer1M = modelInfo?.inputCostPer1M ?? 0
    const outputCostPer1M = modelInfo?.outputCostPer1M ?? 0

    const inputCost = (inputTokens / 1_000_000) * inputCostPer1M
    const outputCost = (outputTokens / 1_000_000) * outputCostPer1M
    const totalCost = inputCost + outputCost

    const { error: insertError } = await serviceSupabase
      .from('usage_records')
      .insert({
        user_id: user.id,
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

    if (insertError) {
      console.error('[Usage] Failed to record usage:', insertError)
      return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 })
    }

    return NextResponse.json({ success: true, cost: totalCost })
  } catch (error) {
    console.error('[Usage] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
