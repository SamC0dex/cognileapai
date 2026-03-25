// ============================================
// ActiveRecall AI Prompt Templates
// ============================================

import type { ChatMessage } from './ai-providers'

interface NudgeContext {
  dueCount: number
  overdueCount: number
  currentStreak: number
  longestStreak: number
  lastSessionDate: string | null
  lastSessionAccuracy: number | null
  weakTopics: string[]
  strongTopics: string[]
  totalMastered: number
  totalCards: number
  examInfo: string | null
}

interface WeeklyReportContext {
  cardsReviewed: number
  prevWeekCards: number
  accuracy: number
  prevAccuracy: number
  topicsStudied: string[]
  weakAreas: string[]
  strongAreas: string[]
  streak: number
  timeSpentMinutes: number
  layerPromotions: number
  layerDemotions: number
  totalCards: number
  masteryPct: number
}

interface IntervalAdjustContext {
  topics: Array<{
    topic: string
    avgAccuracy: number
    avgResponseTimeMs: number
    reviewCount: number
    currentDecayRate: number
    recentTrend: 'improving' | 'stable' | 'declining'
  }>
}

/**
 * Build personalized nudge message prompt.
 */
export function buildNudgePrompt(ctx: NudgeContext): ChatMessage[] {
  const system = `You are a supportive, friendly study coach. Generate a brief (2-3 sentences) motivational message for a student using the CogniLeap study app.

Rules:
- Be specific — reference their actual topics and stats, don't be generic
- Be warm and encouraging, like a friend, not a robot
- If they have a streak going, acknowledge it
- If they're overdue, be gentle but motivating
- If they have an exam coming up, add urgency
- Keep it casual and natural
- No emojis
- Don't start with "Hey!" every time, vary your openings`

  const data = `Student's current data:
- Cards due for review: ${ctx.dueCount} (${ctx.overdueCount} overdue)
- Current streak: ${ctx.currentStreak} days (longest: ${ctx.longestStreak})
- Last study session: ${ctx.lastSessionDate || 'never'}${ctx.lastSessionAccuracy !== null ? ` (${ctx.lastSessionAccuracy}% accuracy)` : ''}
- Weak topics (need more work): ${ctx.weakTopics.length > 0 ? ctx.weakTopics.join(', ') : 'none identified yet'}
- Strong topics: ${ctx.strongTopics.length > 0 ? ctx.strongTopics.join(', ') : 'none yet'}
- Progress: ${ctx.totalMastered}/${ctx.totalCards} cards mastered
${ctx.examInfo ? `- Upcoming exam: ${ctx.examInfo}` : ''}

Generate a personalized nudge message.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: data },
  ]
}

/**
 * Build weekly report generation prompt.
 */
export function buildWeeklyReportPrompt(ctx: WeeklyReportContext): ChatMessage[] {
  const system = `You are a study coach writing a weekly learning report. Write in second person ("you"), as if speaking directly to the student.

Format the report in markdown with these sections:
## This Week's Highlights
(2-3 bullet points on what went well)

## Areas for Improvement
(1-2 specific topics or habits to work on)

## Next Week's Focus
(Concrete recommendations for what to study and how)

## Quick Stats
(Formatted as a brief summary)

Keep it encouraging but honest. Be specific about topics. Keep the total report under 300 words.`

  const data = `This week's learning data:
- Cards reviewed: ${ctx.cardsReviewed} (last week: ${ctx.prevWeekCards})
- Accuracy: ${ctx.accuracy}% (last week: ${ctx.prevAccuracy}%)
- Topics studied: ${ctx.topicsStudied.join(', ') || 'none'}
- Weak areas (below 70% accuracy): ${ctx.weakAreas.join(', ') || 'none'}
- Strong areas (above 90% accuracy): ${ctx.strongAreas.join(', ') || 'none'}
- Current streak: ${ctx.streak} days
- Time spent: ${ctx.timeSpentMinutes} minutes
- Cards promoted to higher level: ${ctx.layerPromotions}
- Cards demoted (need more practice): ${ctx.layerDemotions}
- Overall progress: ${ctx.masteryPct}% mastered (${ctx.totalCards} total cards)

Generate the weekly report.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: data },
  ]
}

/**
 * Build AI interval adjustment prompt.
 */
export function buildIntervalAdjustPrompt(ctx: IntervalAdjustContext): ChatMessage[] {
  const system = `You are an adaptive learning algorithm. Analyze a student's spaced repetition performance and suggest interval multipliers for each topic.

For each topic, output a JSON array:
[{ "topic": "...", "multiplier": 0.5-2.0, "reasoning": "..." }]

Multiplier guide:
- 0.5-0.7: Student struggles significantly, needs more frequent reviews
- 0.8-0.9: Slightly below average, minor increase in frequency
- 1.0: Standard SM-2 intervals are working well
- 1.1-1.3: Student performs well, can space out reviews slightly
- 1.5-2.0: Student excels, significantly extend intervals

Consider:
- Accuracy below 60% → decrease multiplier
- Accuracy above 90% → increase multiplier
- Slow response times may indicate guessing or uncertainty
- Declining trend → decrease multiplier even if current accuracy is ok
- Improving trend → increase multiplier even if accuracy isn't perfect yet

Return ONLY the JSON array, no other text.`

  const topicData = ctx.topics.map((t) => (
    `- ${t.topic}: accuracy=${t.avgAccuracy}%, avgResponseTime=${t.avgResponseTimeMs}ms, reviews=${t.reviewCount}, trend=${t.recentTrend}`
  )).join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Per-topic performance data:\n${topicData}` },
  ]
}
