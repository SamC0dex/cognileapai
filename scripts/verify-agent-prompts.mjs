import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const sourcePath = new URL('../src/lib/active-recall-prompts.ts', import.meta.url)
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const sandbox = {
  exports: {},
  module: { exports: {} },
  require,
}
sandbox.exports = sandbox.module.exports
vm.runInNewContext(compiled, sandbox, { filename: 'active-recall-prompts.ts' })

const {
  buildAgentSystemPrompt,
  buildPlanAdaptationPrompt,
} = sandbox.module.exports

const agentPrompt = buildAgentSystemPrompt({
  totalCards: 42,
  dueCards: 9,
  overdueCount: 3,
  masteryPct: 28,
  currentStreak: 5,
  longestStreak: 9,
  weakTopics: ['Bayes theorem', 'Markov chains'],
  strongTopics: ['Linear regression'],
  recentAccuracy: 58,
  totalReviews: 137,
  upcomingExams: [{ title: 'AI Midterm', daysUntil: 2 }],
  recentSessionSummary: '12 cards, 50% accuracy',
  documents: [
    { id: 'doc-1', title: 'Probability Notes.pdf', flashcardCount: 1, quizCount: 0, mindmapCount: 2 },
  ],
  activePlans: [
    { id: 'plan-1', title: 'AI Midterm Rescue', status: 'active', currentDay: 2, totalActivities: 8, completedActivities: 3 },
  ],
  planPerformance: [
    {
      planId: 'plan-1',
      planTitle: 'AI Midterm Rescue',
      accuracy: 58,
      cardsReviewed: 24,
      readinessScore: 44,
      readinessLabel: 'At risk',
      dueCards: 9,
      nextFocus: 'Bayes theorem',
      weakTopics: ['Bayes theorem'],
      strongTopics: ['Linear regression'],
    },
  ],
})

for (const expected of [
  'Bayes theorem',
  'Probability Notes.pdf',
  'AI Midterm Rescue',
  'At risk',
  'CREATE_PLAN',
  'GENERATE_TOOLS',
  'ADAPT_PLAN',
  'START_REVIEW',
  'SET_REMINDERS',
  'durationDays',
  'dailyAvailableMinutes',
  'currentUnderstanding',
  'preferredIntensity',
]) {
  assert.match(agentPrompt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `agent prompt missing ${expected}`)
}

assert.match(agentPrompt, /do not also emit an action marker/i)
assert.match(agentPrompt, /latest message explicitly asks/i)
assert.match(agentPrompt, /missed-day|catch-up/i)

const adaptationMessages = buildPlanAdaptationPrompt({
  planTitle: 'AI Midterm Rescue',
  userRequest: 'Tomorrow should focus on Bayes theorem and be more quiz-heavy.',
  currentDay: 2,
  totalDays: 5,
  remainingSchedule: [
    {
      day: 3,
      date: '2026-06-29',
      activities: [
        {
          type: 'summary',
          documentId: 'doc-1',
          topic: 'Markov chains',
          plannedMinutes: 15,
          generationStatus: 'not_generated',
          generatedSourceId: null,
          completionStatus: 'not_started',
          notes: 'Refresh basics.',
        },
      ],
    },
  ],
  activitySessionSummary: [
    { activityType: 'summary', topic: 'Bayes theorem', durationMs: 300000, status: 'completed' },
  ],
  topicPerformance: [
    { topic: 'Bayes theorem', accuracy: 42, totalReviews: 8, avgResponseTimeMs: 14000, cardCount: 6 },
    { topic: 'Linear regression', accuracy: 94, totalReviews: 9, avgResponseTimeMs: 2500, cardCount: 5 },
  ],
  overallAccuracy: 58,
  daysRemaining: 3,
  weakTopics: ['Bayes theorem'],
  strongTopics: ['Linear regression'],
})

const adaptationPrompt = adaptationMessages.map((message) => message.content).join('\n')

for (const expected of [
  'Bayes theorem',
  'Linear regression',
  'Tomorrow should focus',
  'Recent non-card activity sessions',
  'activity type must be one of',
  'schedulerReason',
  'schedulerBucket',
  'schedulerWeight',
  'expectedOutcome',
  'Return ONLY a valid JSON array',
]) {
  assert.match(adaptationPrompt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `adaptation prompt missing ${expected}`)
}

console.log('Agent prompt verification passed: context, actions, adaptation constraints, and safety rules are present.')
