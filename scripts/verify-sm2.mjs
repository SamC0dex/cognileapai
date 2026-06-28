import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const sourcePath = new URL('../src/lib/sm2.ts', import.meta.url)
let source = fs.readFileSync(sourcePath, 'utf8')

source = source.replace(
  "import { RecallLayer } from '@/types/active-recall'",
  'const RecallLayer = { ABSORB: 1, RECOGNIZE: 2, RETRIEVE: 3, MASTERED: 4 }'
)

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
vm.runInNewContext(compiled, sandbox, { filename: 'sm2.ts' })

const { sm2, computeLayerTransition, formatInterval } = sandbox.module.exports

function stableResult(input) {
  const result = sm2(input)
  return {
    repetitions: result.repetitions,
    easeFactor: result.easeFactor,
    intervalDays: result.intervalDays,
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

const cases = [
  {
    name: 'rating 0 resets and schedules about 1 minute',
    input: { quality: 0, repetitions: 0, easeFactor: 2.5, intervalDays: 0 },
    expected: { repetitions: 0, easeFactor: 2.3, intervalDays: 0.00069 },
  },
  {
    name: 'rating 2 resets and schedules about 10 minutes',
    input: { quality: 2, repetitions: 0, easeFactor: 2.5, intervalDays: 0 },
    expected: { repetitions: 0, easeFactor: 2.3, intervalDays: 0.00694 },
  },
  {
    name: 'first correct review schedules 1 day',
    input: { quality: 3, repetitions: 0, easeFactor: 2.5, intervalDays: 0 },
    expected: { repetitions: 1, easeFactor: 2.36, intervalDays: 1 },
  },
  {
    name: 'second easy review schedules 6 days',
    input: { quality: 5, repetitions: 1, easeFactor: 2.5, intervalDays: 1 },
    expected: { repetitions: 2, easeFactor: 2.6, intervalDays: 6 },
  },
  {
    name: 'fast mature easy review extends interval by 5 percent',
    input: { quality: 5, repetitions: 2, easeFactor: 2.5, intervalDays: 6, avgResponseTimeMs: 2000 },
    expected: { repetitions: 3, easeFactor: 2.6, intervalDays: 15.75 },
  },
  {
    name: 'slow mature good review shortens interval by 10 percent',
    input: { quality: 3, repetitions: 2, easeFactor: 2.5, intervalDays: 6, avgResponseTimeMs: 13000 },
    expected: { repetitions: 3, easeFactor: 2.36, intervalDays: 13.5 },
  },
]

for (const testCase of cases) {
  assert.deepEqual(stableResult(testCase.input), testCase.expected, testCase.name)
}

assert.equal(formatInterval(0.00069), '<1m')
assert.equal(formatInterval(0.00694), '10m')
assert.equal(formatInterval(1), '1d')
assert.equal(formatInterval(6), '6d')

assert.deepEqual(
  plain(computeLayerTransition(1, 3, 1)),
  { newLayer: 2, reason: 'First exposure complete' }
)
assert.deepEqual(
  plain(computeLayerTransition(2, 3, 2)),
  { newLayer: 3, reason: 'Consistent recognition — testing retrieval' }
)
assert.deepEqual(
  plain(computeLayerTransition(3, 5, 3)),
  { newLayer: 4, reason: 'Strong retrieval — entering spaced repetition' }
)
assert.deepEqual(
  plain(computeLayerTransition(4, 0, 0)),
  { newLayer: 2, reason: 'Lapse detected — re-learning needed' }
)

console.log('SM-2 verification passed: rating intervals, response-time modifiers, formatting, and layer transitions match expected behavior.')
