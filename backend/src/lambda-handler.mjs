/**
 * AWS Lambda handler for the BuyWise recommendation backend.
 *
 * Accepts (auto-detected, no configuration needed):
 * - API Gateway REST API (payload format 1.0) proxy events   -> POST /recommend
 * - API Gateway HTTP API / Function URL (payload format 2.0) -> POST /recommend
 * - Direct invocation (the event IS the requirements object) -> tests/CLI
 *
 * Response: API Gateway proxy result
 * { statusCode, headers, body: JSON.stringify(payload) }
 * with CORS headers on every response (belt-and-braces alongside the API
 * Gateway CORS configuration - see scripts/deploy-lambda.ps1).
 *
 * Payload contract (see src/recommend.mjs):
 *   200 { success: true, recommendations: [...], count, feasible, conflicts,
 *         unmetPreferences, meta }
 *   400 { success: false, error, errors: [...] }   invalid/missing input
 *   404/405 { success: false, error }              wrong path/method
 *
 * Lambda handler name: backend/src/lambda-handler.handler
 */

import { handleRecommendRequest } from './recommend.mjs'

/** Engine version constant - single source of truth. */
const ENGINE_VERSION = 'buywise-recommendations/1.0.0 (Node.js 20.x)'

const CORS_HEADERS = (() => {
  // BUYWISE_ALLOWED_ORIGINS: comma-separated list of allowed origins.
  // If not set (or empty) in production, cross-origin access is denied
  // (the '*' is intentionally omitted so the API Gateway / browser blocks it).
  // Local development retains permissive CORS in server.js (see below).
  const allowedOrigins = process.env.BUYWISE_ALLOWED_ORIGINS
  if (allowedOrigins && allowedOrigins.trim() !== '') {
    const origins = allowedOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    return {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origins,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  }
  // Production default: no wildcard — browser will block cross-origin.
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '', // empty = block CORS
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
})()

/** True when the event is the requirements object itself (direct invoke). */
function isDirectInvocation(event) {
  return (
    event !== null &&
    typeof event === 'object' &&
    !Array.isArray(event) &&
    event.requestContext === undefined &&
    event.httpMethod === undefined &&
    event.rawPath === undefined &&
    event.version === undefined &&
    (event.budget !== undefined ||
      event.ram !== undefined ||
      event.storage !== undefined ||
      event.gpu !== undefined ||
      event.os !== undefined ||
      event.workloads !== undefined ||
      event.useCases !== undefined)
  )
}

/** HTTP method from either payload format. */
function eventMethod(event) {
  return event.requestContext?.http?.method ?? event.httpMethod ?? null
}

/** Request path from either payload format (REST proxy paths include stage). */
function eventPath(event) {
  const raw =
    event.rawPath ?? event.requestContext?.resourcePath ?? event.path ?? ''
  return String(raw).replace(/\/+$/, '').toLowerCase()
}

/** Decodes the request body (base64 when the gateway says so). */
function parseBody(event) {
  const rawBody = event.body
  if (rawBody === undefined || rawBody === null || rawBody === '') {
    return { error: 'Request body is required. POST a JSON requirements object.' }
  }
  const decoded = event.isBase64Encoded
    ? Buffer.from(rawBody, 'base64').toString('utf-8')
    : rawBody
  try {
    return { value: JSON.parse(decoded) }
  } catch {
    return { error: 'Request body must be valid JSON.' }
  }
}

function proxyResponse(statusCode, payload) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(payload),
  }
}

/**
 * Lambda entry point.
 *
 * @param {object} event - API Gateway / Function URL event, or a direct
 *   requirements object.
 * @returns {Promise<object>} API Gateway proxy result (direct invocation
 *   returns the payload object itself, mirroring the CLI invoke contract).
 */
export async function handler(event) {
  try {
    const path = eventPath(event)
    const method = eventMethod(event)

    // --- Health check ---
    if (path === '/health') {
      const now = new Date().toISOString()
      const { getProducts } = await import('./products.mjs')
      const gp = await getProducts()
      const productCount = Array.isArray(gp.products) ? gp.products.length : 0
      return proxyResponse(200, {
        status: 'ok',
        engine: ENGINE_VERSION,
        catalogSource: gp.source,
        productCount,
        timestamp: now,
      })
    }
      return proxyResponse(200, {
        status: 'ok',
        engine: ENGINE_VERSION,
        catalogSource: source,
        productCount,
        timestamp: now,
      })
    }

    if (method === 'OPTIONS') {
      // CORS preflight (also answered by API Gateway CORS config).
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    const path = eventPath(event)
    if (path !== '' && !path.endsWith('/recommend')) {
      return proxyResponse(404, {
        success: false,
        error: 'Not found. Use POST /recommend.',
      })
    }

    if (method !== 'POST') {
      return proxyResponse(405, {
        success: false,
        error: 'Method not allowed. Use POST /recommend.',
      })
    }

    const parsed = parseBody(event)
    if (parsed.error !== undefined) {
      return proxyResponse(400, {
        success: false,
        error: 'Invalid request',
        errors: [parsed.error],
      })
    }

    const result = await handleRecommendRequest(parsed.value)
    return proxyResponse(result.statusCode, result.payload)
  } catch (error) {
    // Never leak internals; CloudWatch keeps the full stack trace.
    console.error('[lambda-handler] unhandled error:', error)
    return proxyResponse(500, {
      success: false,
      error: 'Internal server error while generating recommendations.',
    })
  }
}
