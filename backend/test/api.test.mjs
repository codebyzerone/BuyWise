/**
 * Backend tests for the BuyWise recommendation Lambda and shared core.
 *
 * Run: npm test (in backend/) - uses the built-in node:test runner, so no
 * test framework is added to the project.
 *
 * The tests exercise the EXACT production code path:
 *   request -> normalizeRequest -> products source -> EXISTING frontend engine
 * and verify parity with calling frontend/src/engine directly.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRequirements } from '../src/normalizeRequest.mjs'
import { handler } from '../src/lambda-handler.mjs'
import { getRecommendations } from '../../frontend/src/engine/recommendations.js'
import { laptopCatalog } from '../../frontend/src/data/laptopCatalog.js'

/** The documented API contract example. */
const FLAT_REQUEST = {
  budget: 90000,
  ram: 16,
  storage: 512,
  gpu: 'mid-range',
  os: 'Windows',
  workloads: ['AI/ML', 'Programming'],
}

/** API Gateway HTTP API / Function URL event (payload format 2.0). */
function v2Event(body, overrides = {}) {
  return {
    version: '2.0',
    rawPath: '/recommend',
    requestContext: { http: { method: 'POST' } },
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    ...overrides,
  }
}

/** API Gateway REST API proxy event (payload format 1.0). */
function v1Event(body) {
  return {
    httpMethod: 'POST',
    path: '/recommend',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  }
}

/* --------------------------------------------------------------------------
 * Request normalization
 * ------------------------------------------------------------------------ */

test('maps the documented flat request shape onto the normalized profile', () => {
  const { requirements, errors, warnings } = normalizeRequirements(FLAT_REQUEST)
  assert.equal(errors.length, 0)
  assert.deepEqual(requirements.budget, { max: 90000, strict: true })
  assert.deepEqual(requirements.ram, {
    minimumGb: 16,
    preferredGb: 16,
    strict: false,
  })
  assert.deepEqual(requirements.storage, {
    minimumGb: 512,
    preferredGb: 512,
    strict: false,
  })
  assert.deepEqual(requirements.gpu, {
    required: true,
    minimumTier: 'mid-range',
    specificModel: null,
    strict: false,
  })
  assert.deepEqual(requirements.os, { preferred: 'windows', strict: false })
  assert.deepEqual(requirements.useCases, ['ai_ml', 'programming'])
  assert.equal(requirements.category, 'laptop')
})

test('accepts the full normalized frontend interview profile', () => {
  const { requirements, errors } = normalizeRequirements({
    category: 'laptop',
    budget: { max: 72000, strict: true },
    useCases: ['gaming', 'programming'],
    ram: { minimumGb: 16, preferredGb: 32, strict: false },
    storage: { minimumGb: 1024, preferredGb: 1024, strict: false },
    gpu: { required: true, minimumTier: 'mid-range', specificModel: 'RTX 4050', strict: false },
    os: { preferred: 'windows', strict: true },
    display: { preference: 'good', strict: false },
    software: ['VS Code', 'Docker'],
    derived: [{ field: 'ram', reason: 'Docker / containers' }],
  })
  assert.equal(errors.length, 0)
  assert.deepEqual(requirements.budget, { max: 72000, strict: true })
  assert.equal(requirements.os.strict, true)
  assert.deepEqual(requirements.gpu.specificModel, 'RTX 4050')
  assert.deepEqual(requirements.useCases, ['gaming', 'programming'])
})

test('rejects an empty requirements object', () => {
  const { requirements, errors } = normalizeRequirements({})
  assert.equal(requirements, null)
  assert.ok(errors[0].includes('At least one requirement'))
})

test('rejects invalid field values with actionable errors', () => {
  const cases = [
    [{ budget: 'expensive' }, '"budget"'],
    [{ budget: 500 }, '"budget"'],
    [{ ram: -4 }, '"ram"'],
    [{ gpu: 'ultra' }, '"gpu"'],
    [{ os: 'chromeos' }, '"os"'],
    [[1, 2, 3], 'JSON object'],
    ['nope', 'JSON object'],
  ]
  for (const [body, expectedIn] of cases) {
    const { requirements, errors } = normalizeRequirements(body)
    assert.equal(requirements, null, JSON.stringify(body))
    assert.equal(errors.length, 1, JSON.stringify(body))
    assert.ok(errors[0].includes(expectedIn), errors[0])
  }
})

test('warns about unknown fields instead of failing', () => {
  const { warnings, errors } = normalizeRequirements({
    ...FLAT_REQUEST,
    mysteryField: true,
  })
  assert.equal(errors.length, 0)
  assert.ok(warnings.some((w) => w.includes('mysteryField')))
})

/* --------------------------------------------------------------------------
 * Lambda handler (API Gateway v1 + v2 events, direct invocation)
 * ------------------------------------------------------------------------ */

test('HTTP API v2 event: valid request returns recommendations', async () => {
  const response = await handler(v2Event(FLAT_REQUEST))
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Access-Control-Allow-Origin'], '*')
  const payload = JSON.parse(response.body)
  assert.equal(payload.success, true)
  assert.ok(payload.count > 0)
  assert.equal(payload.count, payload.recommendations.length)
  assert.equal(payload.feasible, true)
  for (const rec of payload.recommendations) {
    assert.equal(typeof rec.score, 'number')
    assert.equal(typeof rec.matchLabel, 'string')
    assert.ok(Array.isArray(rec.reasons))
    assert.ok(rec.product.id)
  }
  // deterministic ordering: scores never increase
  for (let i = 1; i < payload.recommendations.length; i += 1) {
    assert.ok(payload.recommendations[i - 1].score >= payload.recommendations[i].score)
  }
})

test('REST API v1 event works identically', async () => {
  const response = await handler(v1Event(FLAT_REQUEST))
  assert.equal(response.statusCode, 200)
  const payload = JSON.parse(response.body)
  assert.equal(payload.success, true)
  assert.ok(payload.count > 0)
})

test('base64-encoded bodies are decoded', async () => {
  const response = await handler(
    v2Event(null, {
      body: Buffer.from(JSON.stringify(FLAT_REQUEST)).toString('base64'),
      isBase64Encoded: true,
    }),
  )
  assert.equal(response.statusCode, 200)
  assert.equal(JSON.parse(response.body).success, true)
})

test('direct invocation returns the payload object itself', async () => {
  const payload = await handler(FLAT_REQUEST)
  assert.equal(payload.success, true)
  assert.ok(payload.count > 0)
  assert.equal(payload.statusCode, undefined)
})

test('OPTIONS preflight is answered with CORS headers', async () => {
  const response = await handler(
    v2Event(null, { requestContext: { http: { method: 'OPTIONS' } }, body: null }),
  )
  assert.equal(response.statusCode, 204)
  assert.equal(response.headers['Access-Control-Allow-Origin'], '*')
  assert.equal(response.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS')
})

test('non-POST methods are rejected with 405', async () => {
  const response = await handler(
    v2Event(null, { requestContext: { http: { method: 'GET' } }, body: null }),
  )
  assert.equal(response.statusCode, 405)
})

test('other paths are rejected with 404', async () => {
  const response = await handler(v2Event(FLAT_REQUEST, { rawPath: '/other' }))
  assert.equal(response.statusCode, 404)
})

test('malformed JSON bodies are rejected with 400', async () => {
  const response = await handler(v2Event(null, { body: '{not json' }))
  assert.equal(response.statusCode, 400)
  const payload = JSON.parse(response.body)
  assert.equal(payload.success, false)
  assert.ok(payload.errors.length > 0)
})

test('missing request bodies are rejected with 400', async () => {
  const response = await handler(v2Event(null, { body: null }))
  assert.equal(response.statusCode, 400)
  assert.equal(JSON.parse(response.body).success, false)
})

test('accepts the Phase B { requirements } request envelope', async () => {
  const response = await handler(
    v2Event({ requirements: FLAT_REQUEST }),
  )
  assert.equal(response.statusCode, 200)
  const payload = JSON.parse(response.body)
  assert.equal(payload.success, true)
  assert.ok(payload.count > 0)
  // Same mapping as the flat shape -> identical recommendations.
  const flatResponse = await handler(v2Event(FLAT_REQUEST))
  assert.deepEqual(payload.recommendations, JSON.parse(flatResponse.body).recommendations)
})

test('rejects a non-object requirements envelope with 400', async () => {
  const response = await handler(v2Event({ requirements: '90000 budget' }))
  assert.equal(response.statusCode, 400)
  const payload = JSON.parse(response.body)
  assert.equal(payload.success, false)
  assert.ok(payload.errors.some((e) => e.includes('"requirements"')))
})

/* --------------------------------------------------------------------------
 * Zero-result and error handling
 * ------------------------------------------------------------------------ */

test('a request no product can satisfy succeeds with zero recommendations', async () => {
  const response = await handler(v2Event({ budget: 15000, gpu: 'mid-range' }))
  assert.equal(response.statusCode, 200)
  const payload = JSON.parse(response.body)
  assert.equal(payload.success, true)
  assert.equal(payload.count, 0)
  assert.deepEqual(payload.recommendations, [])
  assert.equal(payload.feasible, false)
  assert.ok(payload.conflicts.length > 0)
  // The engine names the unsatisfiable hard requirement.
  assert.ok(
    payload.conflicts.some((conflict) => conflict.field.includes('budget')),
  )
})

/* --------------------------------------------------------------------------
 * Engine parity - the backend must reuse the existing engine exactly
 * ------------------------------------------------------------------------ */

test('API recommendations are identical to the existing engine output', async () => {
  const { requirements } = normalizeRequirements(FLAT_REQUEST)
  const expected = getRecommendations(requirements, laptopCatalog)

  const response = await handler(v2Event(FLAT_REQUEST))
  const payload = JSON.parse(response.body)

  assert.deepEqual(payload.recommendations, expected.recommendations)
  assert.deepEqual(payload.conflicts, expected.conflicts)
  assert.deepEqual(payload.unmetPreferences, expected.unmetPreferences)
})


