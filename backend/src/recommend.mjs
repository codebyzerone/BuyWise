/**
 * BuyWise recommendation core - shared by the AWS Lambda handler
 * (src/lambda-handler.mjs) and the local Express stand-in for API Gateway
 * (server.js), so both entry points behave identically.
 *
 * Pipeline position:
 *   API REQUEST -> NORMALIZED REQUIREMENTS -> (catalog source)
 *     -> EXISTING ENGINE (feasibility -> scoring) -> JSON RESPONSE
 *
 * The engine is imported from the frontend's single source of truth
 * (frontend/src/engine/recommendations.js) - no logic is duplicated here.
 */

import { getRecommendations } from '../../frontend/src/engine/recommendations.js'
import { normalizeRequirements } from './normalizeRequest.mjs'
import { getProducts } from './products.mjs'

/**
 * Handles one /recommend request.
 *
 * @param {unknown} body - Parsed JSON request body (or undefined).
 * @returns {Promise<{statusCode: number, payload: object}>}
 */
export async function handleRecommendRequest(body) {
  const { requirements, errors, warnings } = normalizeRequirements(body)
  if (requirements === null) {
    return {
      statusCode: 400,
      payload: { success: false, error: 'Invalid request', errors },
    }
  }

  const { products, source, warning } = await getProducts()
  if (warning !== null) warnings.push(warning)

  const result = getRecommendations(requirements, products)

  return {
    statusCode: 200,
    payload: {
      success: true,
      recommendations: result.recommendations,
      count: result.recommendations.length,
      feasible: result.feasible,
      // Zero-result requests stay a success: the engine's conflict diagnosis
      // explains which hard requirements no available product can satisfy.
      conflicts: result.conflicts,
      unmetPreferences: result.unmetPreferences,
      meta: {
        catalogSource: source,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    },
  }
}
