/**
 * Engine tests for the closest-match fallback (no-exact-match UX).
 *
 * Contract (frontend/src/engine/recommendations.js):
 * - feasible requests: behavior COMPLETELY unchanged (closestMatches false).
 * - infeasible requests: top 3 REAL catalog products ranked by satisfied
 *   requirement groups, labelled 'closest match', with controlled
 *   deviations (+15% budget, one GPU tier lower, one storage ladder step,
 *   one display step; RAM/OS never relaxed), factual why-it-differs notes,
 *   and the unchanged conflict diagnosis.
 * - never invents products or data.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { getRecommendations } from '../../frontend/src/engine/recommendations.js'
import { laptopCatalog } from '../../frontend/src/data/laptopCatalog.js'

const REAL_IDS = new Set(laptopCatalog.map((product) => product.id))

const FEASIBLE_PROFILE = {
  category: 'laptop',
  budget: { max: 90000, strict: true },
  useCases: ['ai_ml', 'programming'],
  ram: { minimumGb: 16, preferredGb: 16, strict: false },
  storage: { minimumGb: 512, preferredGb: 512, strict: false },
  gpu: {
    required: true,
    minimumTier: 'mid-range',
    specificModel: null,
    strict: false,
  },
  os: { preferred: 'windows', strict: false },
}

test('feasible requests are completely unchanged by the fallback', () => {
  const result = getRecommendations(FEASIBLE_PROFILE, laptopCatalog)
  assert.equal(result.feasible, true)
  assert.equal(result.closestMatches, false)
  assert.ok(result.recommendations.length > 0)
  for (const rec of result.recommendations) {
    assert.notEqual(rec.matchLabel, 'closest match')
    assert.equal(rec.deviations, undefined)
  }
})

test('impossible budget returns up to 3 real closest matches with conflicts', () => {
  const result = getRecommendations(
    { budget: { max: 15000, strict: true }, gpu: { required: true, minimumTier: 'mid-range', strict: false } },
    laptopCatalog,
  )
  assert.equal(result.feasible, false)
  assert.equal(result.closestMatches, true)
  assert.ok(result.recommendations.length >= 1)
  assert.ok(result.recommendations.length <= 3)
  // Conflict diagnosis preserved.
  assert.ok(result.conflicts.some((conflict) => conflict.field.includes('budget')))
  for (const rec of result.recommendations) {
    assert.equal(rec.matchLabel, 'closest match')
    assert.ok(REAL_IDS.has(rec.product.id), 'no invented products')
    assert.equal(typeof rec.satisfiedCount, 'number')
  }
  // Ranked by satisfied requirement groups (descending).
  const counts = result.recommendations.map((rec) => rec.satisfiedCount)
  for (let i = 1; i < counts.length; i += 1) {
    assert.ok(counts[i - 1] >= counts[i])
  }
})

test('a slightly over-budget request takes the +15% deviation with a note', () => {
  // Cheapest catalog laptop is ₹52,990 - nothing fits ₹50,000, but one is
  // ~6% over, which is within the allowed 15% deviation.
  const result = getRecommendations(
    { budget: { max: 50000, strict: true } },
    laptopCatalog,
  )
  assert.equal(result.feasible, false)
  assert.equal(result.closestMatches, true)
  assert.ok(result.recommendations.length > 0)
  const deviations = result.recommendations.flatMap((rec) => rec.deviations)
  assert.ok(
    deviations.some((note) => note.includes('over your ₹50,000 budget')),
    JSON.stringify(deviations),
  )
  // The deviation is also visible in the rendered compromise notes.
  assert.ok(
    result.recommendations.some((rec) =>
      rec.compromises.some((note) => note.includes('over your ₹50,000 budget')),
    ),
  )
})

test('one-GPU-tier-lower deviation is applied and labelled', () => {
  // Only BW-IN-021 is 'high-performance', and it is outside ₹1,00,000, so
  // no product satisfies the HARD (strict) GPU requirement within budget.
  // Mid-range GPUs are exactly ONE tier lower and must carry the note.
  const result = getRecommendations(
    {
      budget: { max: 100000, strict: true },
      gpu: {
        required: true,
        minimumTier: 'high-performance',
        specificModel: null,
        strict: true,
      },
    },
    laptopCatalog,
  )
  assert.equal(result.feasible, false)
  assert.equal(result.closestMatches, true)
  const deviations = result.recommendations.flatMap((rec) => rec.deviations)
  assert.ok(
    deviations.some((note) => note.includes('one tier below')),
    JSON.stringify(deviations),
  )
  // Both controlled deviations show up: the ~15% budget allowance and the
  // one-tier-lower GPU.
  assert.ok(
    deviations.some((note) => note.includes('over your ₹1,00,000 budget')),
    JSON.stringify(deviations),
  )
  assert.ok(
    result.conflicts.some((conflict) => conflict.field.includes('gpu')),
    JSON.stringify(result.conflicts),
  )
  // Integrated GPUs never satisfy a required dedicated GPU (no relaxation).
  assert.ok(
    result.recommendations.every((rec) => rec.product.gpu.tier !== 'integrated'),
    'a dedicated-GPU request is never answered with integrated graphics',
  )
})

test('os is never relaxed - mismatch is shown as a gap note', () => {
  // No catalog laptop ships Linux, and the OS requirement is HARD (strict),
  // so feasibility fails on the OS - which the fallback must NOT paper over:
  // the mismatch is a stated gap, never a "deviation".
  const result = getRecommendations(
    {
      budget: { max: 200000, strict: true },
      os: { preferred: 'linux', strict: true },
    },
    laptopCatalog,
  )
  assert.equal(result.feasible, false)
  assert.equal(result.closestMatches, true)
  assert.ok(
    result.conflicts.some((conflict) => conflict.field.includes('os')),
    JSON.stringify(result.conflicts),
  )
  // The mismatch is stated factually in the compromise notes...
  assert.ok(
    result.recommendations.every((rec) =>
      rec.compromises.some((note) => note.includes('you preferred linux')),
    ),
  )
  // ...and never appears as an allowed deviation.
  assert.ok(
    result.recommendations.every(
      (rec) => !rec.deviations.some((note) => note.includes('linux')),
    ),
    'operating system must never be relaxed',
  )
})

test('exactly-satisfied requirements never produce deviation notes', () => {
  // budget 90000 + mid-range GPU is feasible - take an infeasible variant
  // where the product satisfies everything but one never-relaxed group.
  const result = getRecommendations(
    {
      budget: { max: 15000, strict: true },
      os: { preferred: 'windows', strict: false },
    },
    laptopCatalog,
  )
  assert.equal(result.feasible, false)
  for (const rec of result.recommendations) {
    if (rec.product.os === 'windows') {
      assert.ok(
        !rec.compromises.some((note) => note.includes('you preferred windows')),
      )
    }
  }
})

