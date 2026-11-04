/**
 * Frontend engine tests for the recommendation scoring breakdown.
 * Run: npm test (in frontend/) - uses node:test, no new dependencies.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { SCORING_WEIGHTS, recommendProducts } from './recommendations.js'
import { checkFeasibility } from './feasibility.js'

const knownProduct = {
  id: 'TEST-KNOWN-01', brand: 'TestBrand', model: 'TestModel',
  pricing: { currency: 'INR', currentPrice: 60000, source: null, url: null, checkedAt: null },
  cpu: { brand: 'Intel', model: 'Core i5', generation: null, cores: null, threads: null, baseClockGHz: null, boostClockGHz: null },
  gpu: { model: 'RTX 4050', tier: 'mid-range', vramGb: 6, tgpW: null },
  ram: { capacityGb: 16, type: null, speedMHz: null, slots: null, upgradeable: null, maximumSupportedGb: null },
  storage: { capacityGb: 512, type: null, slots: null, upgradeable: null },
  display: { sizeInches: null, resolution: null, panel: null, refreshRateHz: null, brightnessNits: null, colorGamut: null, tier: 'good' },
  battery: { capacityWh: 60 },
  physical: { weightKg: 1.8, thicknessMm: null },
  connectivity: { wifi: null, bluetooth: null }, ports: [], os: 'windows',
  webcam: { resolution: null }, keyboard: { backlit: null, numpad: null },
  upgradeability: { ram: null, storage: null },
  source: { retailer: null, productUrl: null, lastChecked: null },
}

const unknownProduct = {
  id: 'TEST-UNKNOWN-01', brand: 'TestBrand', model: 'TestModel',
  pricing: { currency: 'INR', currentPrice: null, source: null, url: null, checkedAt: null },
  cpu: { brand: null, model: null, generation: null, cores: null, threads: null, baseClockGHz: null, boostClockGHz: null },
  gpu: { model: null, tier: null, vramGb: null, tgpW: null },
  ram: { capacityGb: null, type: null, speedMHz: null, slots: null, upgradeable: null, maximumSupportedGb: null },
  storage: { capacityGb: null, type: null, slots: null, upgradeable: null },
  display: { sizeInches: null, resolution: null, panel: null, refreshRateHz: null, brightnessNits: null, colorGamut: null, tier: null },
  battery: { capacityWh: null },
  physical: { weightKg: null, thicknessMm: null },
  connectivity: { wifi: null, bluetooth: null }, ports: [], os: null,
  webcam: { resolution: null }, keyboard: { backlit: null, numpad: null },
  upgradeability: { ram: null, storage: null },
  source: { retailer: null, productUrl: null, lastChecked: null },
}

const fullRequirements = {
  category: 'laptop', budget: { max: 70000, strict: true }, useCases: ['programming'],
  performance: { priority: 'high', strict: false },
  ram: { minimumGb: 16, preferredGb: 16, strict: false },
  storage: { minimumGb: 512, preferredGb: 512, strict: false },
  gpu: { required: false, minimumTier: 'mid-range', specificModel: null, strict: false },
  os: { preferred: 'windows', strict: false }, display: { preference: 'good', strict: false },
  portability: { priority: 'important', strict: false }, battery: { priority: 'important', strict: false },
  localAi: null, software: [], additionalRequirements: '', derived: [],
}

const partialRequirements = {
  category: 'laptop', budget: { max: 70000, strict: true }, useCases: [],
  performance: null,
  ram: { minimumGb: 16, preferredGb: 16, strict: false },
  storage: null, gpu: null, os: null, display: null, portability: null, battery: null,
  localAi: null, software: [], additionalRequirements: '', derived: [],
}

test('recommendProducts returns a breakdown array for every recommendation', () => {
  const feasibility = checkFeasibility(fullRequirements, [knownProduct])
  assert.equal(feasibility.feasible, true)
  const recommendations = recommendProducts(fullRequirements, feasibility.matchingProducts)
  assert.equal(recommendations.length, 1)
  const rec = recommendations[0]
  assert.ok(Array.isArray(rec.breakdown))
  assert.equal(rec.breakdown.length, 8)
  const factors = rec.breakdown.map((b) => b.factor)
  assert.deepEqual(factors.sort(), ['battery', 'budget', 'display', 'gpu', 'os', 'portability', 'ram', 'storage'])
})

test('breakdown entry shape has factor, weight, earned, applicable, note', () => {
  const feasibility = checkFeasibility(fullRequirements, [knownProduct])
  const recommendations = recommendProducts(fullRequirements, feasibility.matchingProducts)
  const rec = recommendations[0]
  for (const entry of rec.breakdown) {
    assert.ok(typeof entry.factor === 'string' && entry.factor.length > 0)
    assert.ok(typeof entry.weight === 'number' && entry.weight > 0)
    assert.ok(typeof entry.earned === 'number' && entry.earned >= 0)
    assert.ok(typeof entry.applicable === 'number' && entry.applicable >= 0)
    assert.ok(entry.earned <= entry.applicable, `earned ${entry.earned} > applicable ${entry.applicable} for ${entry.factor}`)
    assert.ok(typeof entry.note === 'string' && entry.note.length > 0)
    assert.ok(Object.keys(SCORING_WEIGHTS).includes(entry.factor), `unexpected factor ${entry.factor}`)
    assert.equal(entry.weight, SCORING_WEIGHTS[entry.factor])
  }
})

test('breakdown earned + applicable sums match the total score', () => {
  const feasibility = checkFeasibility(fullRequirements, [knownProduct])
  const recommendations = recommendProducts(fullRequirements, feasibility.matchingProducts)
  const rec = recommendations[0]
  const totalEarned = rec.breakdown.reduce((sum, b) => sum + b.earned, 0)
  const totalApplicable = rec.breakdown.reduce((sum, b) => sum + b.applicable, 0)
  if (totalApplicable > 0) {
    assert.equal(rec.score, Math.round((100 * totalEarned) / totalApplicable))
  } else {
    assert.equal(rec.score, 0)
  }
})

test('unknown product fields are excluded from applicable (budget price unknown)', () => {
  // Budget as a preference (not strict) so feasibility passes despite null price.
  const reqWithPrefBudget = { ...partialRequirements, budget: { max: 70000, strict: false } }
  const feasibility = checkFeasibility(reqWithPrefBudget, [unknownProduct])
  assert.equal(feasibility.feasible, true)
  const recommendations = recommendProducts(reqWithPrefBudget, feasibility.matchingProducts)
  assert.equal(recommendations.length, 1)
  const rec = recommendations[0]
  const budgetEntry = rec.breakdown.find((b) => b.factor === 'budget')
  assert.equal(budgetEntry.applicable, 0)
  assert.equal(budgetEntry.earned, 0)
  assert.ok(budgetEntry.note.includes('unknown'), `expected unknown note, got: ${budgetEntry.note}`)
})

test('all factors not applicable when requirements are minimal', () => {
  const minimalRequirements = {
    category: 'laptop', budget: { max: 80000, strict: false }, useCases: [],
    performance: null, ram: null, storage: null, gpu: null, os: null,
    display: null, portability: null, battery: null, localAi: null,
    software: [], additionalRequirements: '', derived: [],
  }
  const feasibility = checkFeasibility(minimalRequirements, [knownProduct])
  assert.equal(feasibility.feasible, true)
  const recommendations = recommendProducts(minimalRequirements, feasibility.matchingProducts)
  assert.equal(recommendations.length, 1)
  const rec = recommendations[0]
  const applicableFactors = rec.breakdown.filter((b) => b.applicable > 0)
  assert.equal(applicableFactors.length, 1)
  assert.equal(applicableFactors[0].factor, 'budget')
  const notApplicable = rec.breakdown.filter((b) => b.applicable === 0)
  assert.equal(notApplicable.length, 7)
  assert.equal(rec.score, 100)
})

test('breakdown weight matches SCORING_WEIGHTS for every factor', () => {
  const feasibility = checkFeasibility(fullRequirements, [knownProduct])
  const recommendations = recommendProducts(fullRequirements, feasibility.matchingProducts)
  const rec = recommendations[0]
  for (const entry of rec.breakdown) {
    assert.equal(entry.weight, SCORING_WEIGHTS[entry.factor])
  }
  const totalWeight = rec.breakdown.reduce((sum, b) => sum + b.weight, 0)
  assert.equal(totalWeight, 100)
})