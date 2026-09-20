/**
 * Phase C test: the frontend's API connection module
 * (frontend/src/api/fetchRecommendations.js) against the LOCAL backend
 * server, which implements the exact same POST /recommend contract as the
 * deployed API Gateway -> Lambda.
 *
 * Verified behaviors:
 * - valid profile          -> backend payload (feasible, recommendations, ...)
 * - impossible profile     -> success, count 0, conflicts present
 * - unreachable API        -> null (App.jsx falls back to the local engine)
 * - no URL configured      -> null (frontend behaves exactly as before)
 */

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const backendDir = path.join(repoRoot, 'backend')
const TEST_PORT = 4624
const BASE = `http://127.0.0.1:${TEST_PORT}`

const { fetchRecommendations, isBackendConfigured } = await import(
  '../../frontend/src/api/fetchRecommendations.js'
)

const server = spawn(process.execPath, ['server.js'], {
  cwd: backendDir,
  env: { ...process.env, PORT: String(TEST_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stderr.on('data', () => {}) // body-parser logs for the malformed case

async function waitForServer(attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('server did not start')
}

after(async () => {
  server.kill()
})

const PROFILE = {
  category: 'laptop',
  budget: { max: 90000, strict: true },
  useCases: ['ai_ml', 'programming'],
  ram: { minimumGb: 16, preferredGb: 16, strict: false },
  storage: { minimumGb: 512, preferredGb: 512, strict: false },
  gpu: { required: true, minimumTier: 'mid-range', specificModel: null, strict: false },
  os: { preferred: 'windows', strict: false },
}

test('without a configured URL the module stays unconfigured (unchanged frontend behavior)', async () => {
  // In Node, import.meta.env is undefined - mirrors a build without the env var.
  assert.equal(isBackendConfigured(), false)
  assert.equal(await fetchRecommendations(PROFILE), null)
})

test('valid profile: frontend module receives usable backend recommendations', async () => {
  await waitForServer()
  const payload = await fetchRecommendations(PROFILE, { baseUrl: BASE })
  assert.notEqual(payload, null)
  assert.equal(payload.success, true)
  assert.equal(payload.feasible, true)
  assert.ok(payload.count > 0)
  assert.equal(payload.recommendations.length, payload.count)
  for (const rec of payload.recommendations) {
    assert.equal(typeof rec.score, 'number')
    assert.equal(typeof rec.matchLabel, 'string')
    assert.ok(rec.product.id)
  }
  // The payload renders as-is in ResultsView (same keys as the local engine).
  assert.ok(Array.isArray(payload.conflicts))
  assert.ok(Array.isArray(payload.unmetPreferences))
})

test('impossible profile: closest matches with conflict diagnosis', async () => {
  await waitForServer()
  const payload = await fetchRecommendations(
    { ...PROFILE, budget: { max: 15000, strict: true } },
    { baseUrl: BASE },
  )
  assert.notEqual(payload, null)
  assert.equal(payload.success, true)
  assert.equal(payload.feasible, false)
  // No longer an empty list: the engine returns up to 3 closest matches.
  assert.equal(payload.closestMatches, true)
  assert.ok(payload.count >= 1 && payload.count <= 3)
  assert.ok(payload.conflicts.length > 0)
  assert.ok(payload.recommendations.every((rec) => rec.matchLabel === 'closest match'))
})

test('unreachable API resolves to null so the local engine can take over', async () => {
  await waitForServer()
  const payload = await fetchRecommendations(PROFILE, {
    baseUrl: 'http://127.0.0.1:1', // closed port -> immediate failure
  })
  assert.equal(payload, null)
})

test('base URLs with or without a trailing slash / path are normalized', async () => {
  await waitForServer()
  for (const baseUrl of [BASE, `${BASE}/`, `${BASE}/recommend`]) {
    const payload = await fetchRecommendations(PROFILE, { baseUrl })
    assert.notEqual(payload, null, baseUrl)
    assert.ok(payload.count > 0, baseUrl)
  }
})
