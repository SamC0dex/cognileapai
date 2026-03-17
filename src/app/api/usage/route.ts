import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '30', 10)

    const since = new Date()
    since.setDate(since.getDate() - days)

    // Fetch all usage records within the date range
    const { data: records, error } = await supabase
      .from('usage_records')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[Usage] Failed to fetch usage:', error)
      return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 })
    }

    // Aggregate totals
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalTokens = 0
    let totalCost = 0
    let totalRequests = 0

    // By provider
    const byProvider: Record<string, {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      cost: number
      requests: number
    }> = {}

    // By model
    const byModel: Record<string, {
      provider: string
      inputTokens: number
      outputTokens: number
      totalTokens: number
      cost: number
      requests: number
    }> = {}

    // By day
    const byDay: Record<string, {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      cost: number
      requests: number
    }> = {}

    // By source
    const bySource: Record<string, {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      cost: number
      requests: number
    }> = {}

    for (const r of (records || [])) {
      const inputTokens = r.input_tokens || 0
      const outputTokens = r.output_tokens || 0
      // Always recompute total as input + output for consistency
      // (API total_tokens can include hidden reasoning/cache tokens)
      const tokens = inputTokens + outputTokens
      const cost = parseFloat(r.total_cost) || 0

      totalInputTokens += inputTokens
      totalOutputTokens += outputTokens
      totalTokens += tokens
      totalCost += cost
      totalRequests++

      // Provider aggregation
      if (!byProvider[r.provider]) {
        byProvider[r.provider] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, requests: 0 }
      }
      byProvider[r.provider].inputTokens += inputTokens
      byProvider[r.provider].outputTokens += outputTokens
      byProvider[r.provider].totalTokens += tokens
      byProvider[r.provider].cost += cost
      byProvider[r.provider].requests++

      // Model aggregation
      if (!byModel[r.model]) {
        byModel[r.model] = { provider: r.provider, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, requests: 0 }
      }
      byModel[r.model].inputTokens += inputTokens
      byModel[r.model].outputTokens += outputTokens
      byModel[r.model].totalTokens += tokens
      byModel[r.model].cost += cost
      byModel[r.model].requests++

      // Day aggregation
      const day = new Date(r.created_at).toISOString().split('T')[0]
      if (!byDay[day]) {
        byDay[day] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, requests: 0 }
      }
      byDay[day].inputTokens += inputTokens
      byDay[day].outputTokens += outputTokens
      byDay[day].totalTokens += tokens
      byDay[day].cost += cost
      byDay[day].requests++

      // Source aggregation
      const source = r.source || 'chat'
      if (!bySource[source]) {
        bySource[source] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, requests: 0 }
      }
      bySource[source].inputTokens += inputTokens
      bySource[source].outputTokens += outputTokens
      bySource[source].totalTokens += tokens
      bySource[source].cost += cost
      bySource[source].requests++
    }

    return NextResponse.json({
      totals: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens,
        cost: totalCost,
        requests: totalRequests,
      },
      byProvider,
      byModel,
      byDay,
      bySource,
      days,
    })
  } catch (error) {
    console.error('[Usage] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
