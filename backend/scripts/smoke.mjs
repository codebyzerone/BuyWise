/**
 * Smoke-tests a deployed (or local) BuyWise POST /recommend endpoint.
 *
 * Usage:
 *   node scripts/smoke.mjs [endpoint]
 * Default endpoint: http://localhost:5000/recommend
 * The endpoint may be the API base URL (https://<id>.execute-api.<region>.
 * amazonaws.com) or the full path; /recommend is appended when missing.
 *
 * Covers the Phase B verification matrix:
 *   1. valid recommendation      -> 200, success true, count > 0
 *   2. impossible requirements   -> 200, success true, count 0, conflicts
 *   3. invalid request           -> 400, success false, errors
 *
 * Exit code 0 when every case matches, 1 otherwise (CI/deploy-gate friendly).
 */

import process from 'node:process'

/** Base URL or full path -> normalized full POST /recommend endpoint. */
function normalizeEndpoint(url) {
  const trimmed = String(url ?? '').trim()
  if (trimmed === '') return 'http://localhost:5000/recommend'
  const withoutTrailingSlashes = trimmed.replace(/\/+$/, '')
  if (withoutTrailingSlashes.toLowerCase().endsWith('/recommend')) {
    return withoutTrailingSlashes
  }
  return `${withoutTrailingSlashes}/recommend`
}

const endpoint = normalizeEndpoint(process.argv[2])

const CASES = [
  {
    name: 'valid recommendation',
    body: {
      requirements: {
        budget: 90000,
        ram: 16,
        storage: 512,
        gpu: 'mid-range',
        os: 'Windows',
        workloads: ['AI/ML', 'Programming'],
      },
    },
    expect: (status, payload) =>
      status === 200 &&
      payload.success === true &&
      payload.count > 0 &&
      payload.recommendations.length === payload.count,
  },
  {
    name: 'impossible requirements',
    body: { requirements: { budget: 15000, gpu: 'high-performance' } },
    expect: (status, payload) =>
      status === 200 &&
      payload.success === true &&
      payload.feasible === false &&
      payload.closestMatches === true &&
      payload.count >= 1 &&
      payload.count <= 3 &&
      payload.conflicts.length > 0 &&
      payload.recommendations.every((rec) => rec.matchLabel === 'closest match'),
  },
  {
    name: 'invalid request',
    body: { requirements: { budget: 'oops' } },
    expect: (status, payload) =>
      status === 400 && payload.success === false && payload.errors.length > 0,
  },
]

let failures = 0
for (const testCase of CASES) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCase.body),
    })
    const payload = await response.json()
    const ok = testCase.expect(response.status, payload)
    console.log(
      `${ok ? 'PASS' : 'FAIL'} [${testCase.name}] status=${response.status}` +
        (payload.count !== undefined ? ` count=${payload.count}` : '') +
        (payload.catalogSource ? '' : ''),
    )
    if (!ok) {
      failures += 1
      console.log(`       payload: ${JSON.stringify(payload).slice(0, 400)}`)
    }
  } catch (error) {
    failures += 1
    console.log(`FAIL [${testCase.name}] request error: ${error.message}`)
  }
}

console.log(
  failures === 0
    ? `All ${CASES.length} smoke tests passed against ${endpoint}`
    : `${failures}/${CASES.length} smoke tests failed against ${endpoint}`,
)
process.exit(failures === 0 ? 0 : 1)
