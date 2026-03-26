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

// ============================================
// V2 — AI Chat Sidebar Prompt
// ============================================

export interface AIChatContext {
  totalCards: number
  dueCards: number
  overdueCount: number
  masteryPct: number
  currentStreak: number
  longestStreak: number
  weakTopics: string[]
  strongTopics: string[]
  recentAccuracy: number
  totalReviews: number
  upcomingExams: { title: string; daysUntil: number; readiness?: number }[]
  recentSessionSummary: string | null
}

export function buildAIChatSystemPrompt(ctx: AIChatContext): string {
  return `You are the student's personal AI study coach inside CogniLeap — a spaced repetition learning app. You have deep knowledge of their learning data and you genuinely care about their academic success.

Your personality:
- Warm, knowledgeable, and direct — like a great tutor who knows the student well
- You give specific, actionable advice based on their actual data — never generic platitudes
- You're honest about weak areas but always constructive
- Keep responses concise (2-5 sentences for simple questions, longer for study plans)
- Use markdown formatting when helpful (bold for emphasis, lists for plans)

The student's current learning data:
- Total cards: ${ctx.totalCards} | Due now: ${ctx.dueCards} (${ctx.overdueCount} overdue)
- Overall mastery: ${ctx.masteryPct}%
- Current streak: ${ctx.currentStreak} days (longest: ${ctx.longestStreak})
- Recent accuracy: ${ctx.recentAccuracy}%
- Total lifetime reviews: ${ctx.totalReviews}
- Weak topics (need work): ${ctx.weakTopics.length > 0 ? ctx.weakTopics.join(', ') : 'None identified'}
- Strong topics: ${ctx.strongTopics.length > 0 ? ctx.strongTopics.join(', ') : 'None yet'}
${ctx.upcomingExams.length > 0 ? `- Upcoming exams: ${ctx.upcomingExams.map(e => `${e.title} in ${e.daysUntil} days${e.readiness ? ` (${e.readiness}% ready)` : ''}`).join('; ')}` : '- No upcoming exams scheduled'}
${ctx.recentSessionSummary ? `- Last session: ${ctx.recentSessionSummary}` : '- No recent sessions'}

You can help with:
- "Am I ready for my exam?" — assess readiness based on mastery + weak topics
- "What should I study today?" — prioritize based on due cards, weak areas, exams
- "Why do I keep getting X wrong?" — analyze patterns in their weak topics
- "Make me a study plan" — create day-by-day plans based on their data
- General study tips, motivation, or learning strategy questions

Always ground your answers in their actual data. If you don't have enough data to answer precisely, say so.`
}

export function buildStudyPlanPrompt(
  examTitle: string,
  examDate: string,
  daysUntil: number,
  totalCards: number,
  weakTopics: string[],
  strongTopics: string[],
  masteryPct: number
): ChatMessage[] {
  const system = `You are a study planning AI. Create a day-by-day study plan for an upcoming exam.

Output a JSON array of daily plans:
[{ "day": 1, "date": "YYYY-MM-DD", "focus": "topic name", "cards": number, "notes": "brief tip" }]

Rules:
- Distribute cards evenly but front-load weak topics
- If exam is within 3 days, enter cram mode (more cards per day, shorter intervals)
- Include rest days if exam is more than 2 weeks away
- Max 50 cards per day (30 recommended for normal pace)
- Be specific about which topics to focus on each day
- Keep notes brief (1 sentence)
- Return ONLY valid JSON, no other text`

  const user = `Plan a study schedule:
- Exam: ${examTitle}
- Exam date: ${examDate} (${daysUntil} days away)
- Total flashcards/quiz cards: ${totalCards}
- Current mastery: ${masteryPct}%
- Weak topics (need more work): ${weakTopics.join(', ') || 'none identified'}
- Strong topics: ${strongTopics.join(', ') || 'none identified'}

Generate the study plan as JSON.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export function buildCardExplanationPrompt(
  question: string,
  answer: string,
  userAttempt?: string
): ChatMessage[] {
  const system = `You are a patient teacher explaining a concept. A student is reviewing a flashcard and wants to understand WHY the answer is correct.

Rules:
- Explain the core concept, not just restate the answer
- If the student got it wrong, explain why their attempt was incorrect without being condescending
- Use analogies or examples when helpful
- Keep it concise (3-5 sentences)
- If applicable, give a memory trick or mnemonic`

  let userContent = `Question: ${question}\nCorrect answer: ${answer}`
  if (userAttempt) {
    userContent += `\nStudent's attempt: ${userAttempt}`
  }
  userContent += '\n\nExplain why this is the correct answer.'

  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ]
}
