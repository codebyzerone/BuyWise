/**
 * End-to-end test of the local API stand-in (backend/server.js): boots the
 * real Express server on a test port and calls POST /recommend over HTTP,
 * exactly how the deployed API Gateway endpoint will behave.
 */

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TEST_PORT = 4619
const BASE = `http://127.0.0.1:${TEST_PORT}`

const server = spawn(process.execPath, ['server.js'], {
  cwd: backendDir,
  env: { ...process.env, PORT: String(TEST_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stderr.on('data', (chunk) => process.stderr.write(chunk))

async function waitForServer(attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return await res.json()
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('server did not start')
}

after(async () => {
  server.kill()
})

const FLAT_REQUEST = {
  budget: 90000,
  ram: 16,
  storage: 512,
  gpu: 'mid-range',
  os: 'Windows',
  workloads: ['AI/ML', 'Programming'],
}

test('POST /recommend over HTTP returns recommendations', async () => {
  const health = await waitForServer()
  assert.equal(health.ok, true)
  assert.equal(health.catalogSource, 'bundled-catalog')

  const res = await fetch(`${BASE}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(FLAT_REQUEST),
  })
  assert.equal(res.status, 200)
  const payload = await res.json()
  assert.equal(payload.success, true)
  assert.ok(payload.count > 0)
  assert.equal(payload.count, payload.recommendations.length)
  assert.equal(typeof payload.recommendations[0].score, 'number')
})

test('POST /recommend accepts the Phase B requirements envelope over HTTP', async () => {
  await waitForServer()
  const res = await fetch(`${BASE}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requirements: FLAT_REQUEST }),
  })
  assert.equal(res.status, 200)
  const payload = await res.json()
  assert.equal(payload.success, true)
  assert.ok(payload.count > 0)
})

test('POST /recommend over HTTP rejects invalid input with 400', async () => {
  await waitForServer()
  const res = await fetch(`${BASE}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budget: 'expensive' }),
  })
  assert.equal(res.status, 400)
  const payload = await res.json()
  assert.equal(payload.success, false)
  assert.ok(payload.errors.some((e) => e.includes('budget')))
})

test('malformed JSON over HTTP is rejected with 400', async () => {
  await waitForServer()
  const res = await fetch(`${BASE}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  })
  assert.equal(res.status, 400)
})

test('the original root endpoint still works', async () => {
  await waitForServer()
  const res = await fetch(`${BASE}/`)
  assert.equal(res.status, 200)
  const payload = await res.json()
  assert.match(payload.message, /BuyWise backend is running/)
})
