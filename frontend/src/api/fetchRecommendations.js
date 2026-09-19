/**
 * Phase C: connection to the deployed BuyWise backend
 * (API Gateway -> Lambda -> existing recommendation engine).
 *
 * Behavior rules:
 * - When configured, the BACKEND is the source of recommendation results.
 *   Configured = the VITE_BUYWISE_API_URL environment variable is set at
 *   build time (Vite exposes VITE_* vars via import.meta.env; in AWS
 *   Amplify set it in App settings -> Environment variables, then rebuild).
 * - The request body uses the documented backend contract:
 *   POST {baseUrl}/recommend  with  { "requirements": <normalized profile> }.
 * - ANY failure (unreachable API, non-200, unexpected payload) resolves to
 *   null so App.jsx can fall back to the local engine - the deployed demo
 *   can never break because of the backend.
 * - No UI/design impact: this module only fetches the JSON contract
 *   documented in backend/README.md.
 */

const normalizeEndpoint = (url) => {
  const trimmed = String(url ?? '').trim()
  if (trimmed === '') return null
  const withoutTrailingSlashes = trimmed.replace(/\/+$/, '')
  if (withoutTrailingSlashes.toLowerCase().endsWith('/recommend')) {
    return withoutTrailingSlashes
  }
  return `${withoutTrailingSlashes}/recommend`
}

/** True when VITE_BUYWISE_API_URL is set (or an explicit baseUrl is given). */
export function isBackendConfigured(baseUrl) {
  return (
    normalizeEndpoint(
      baseUrl ?? import.meta.env?.VITE_BUYWISE_API_URL,
    ) !== null
  )
}

/**
 * Fetches recommendations from the deployed BuyWise backend.
 *
 * @param {object} profile - The normalized requirements profile the
 *   interview produced (sent to the backend verbatim).
 * @param {{baseUrl?: string}} [options] - Optional explicit API base URL.
 *   Defaults to VITE_BUYWISE_API_URL.
 * @returns {Promise<object|null>} The backend payload
 *   ({ success, feasible, recommendations, conflicts, unmetPreferences, ... })
 *   which ResultsView renders as-is, or null on ANY failure (caller falls
 *   back to the local engine).
 */
export async function fetchRecommendations(profile, { baseUrl } = {}) {
  const endpoint = normalizeEndpoint(
    baseUrl ?? import.meta.env?.VITE_BUYWISE_API_URL,
  )
  if (endpoint === null) return null
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements: profile }),
    })
    if (!response.ok) return null
    const payload = await response.json()
    return isValidPayload(payload) ? payload : null
  } catch {
    return null
  }
}

/** Accepts only the documented successful response shape. */
function isValidPayload(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    payload.success === true &&
    typeof payload.feasible === 'boolean' &&
    Array.isArray(payload.recommendations) &&
    Array.isArray(payload.conflicts)
  )
}
