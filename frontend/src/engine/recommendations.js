/**
 * Recommendation engine.
 *
 * Pipeline position:
 *   RAW ANSWERS -> NORMALIZED REQUIREMENTS -> FEASIBILITY -> RECOMMENDATION
 *
 * Answers exactly one question: "Among the FEASIBLE laptops, which ones best
 * match the user's preferences?" It deliberately knows nothing about
 * feasibility filtering - it must ONLY ever receive products that already
 * passed checkFeasibility(). Scoring can never rescue an infeasible product:
 *
 *   getRecommendations(requirements, products)
 *     -> checkFeasibility() FIRST (hard requirements)
 *     -> score ONLY the feasible survivors (preferences)
 *
 * SCORING MODEL (transparent, deterministic, no ML, no "AI confidence"):
 *
 * | preference  | weight | earned points                              |
 * |-------------|--------|--------------------------------------------|
 * | budget      | 20     | 20 when the known price is <= budget.max   |
 * | gpu         | 20     | 20 when the GPU satisfies the preference   |
 * | ram         | 15     | 15 at/below preferred, 7 between hard      |
 * |             |        | minimum and preferred, 0 below             |
 * | storage     | 15     | same ladder as RAM                         |
 * | display     | 10     | 10 exact tier match, 5 when the product's  |
 * |             |        | tier ranks at/above the preference in the  |
 * |             |        | DISPLAY_TIERS order, 0 below               |
 * | os          | 10     | 10 exact OS match                          |
 * | portability | 5      | 5 when the known weight is light enough    |
 * |             |        | (very-important <= 1.5 kg, important       |
 * |             |        | <= 2.0 kg, somewhat <= 2.5 kg)             |
 * | battery     | 5      | 5 when the known battery is large enough   |
 * |             |        | (very-important >= 70 Wh, important        |
 * |             |        | >= 55 Wh, somewhat >= 50 Wh)               |
 *
 * UNKNOWN DATA IS NEVER A FAILURE:
 * - A preference is only scored when BOTH the preference exists AND the
 *   product's corresponding field is known (not null). Unknown fields are
 *   EXCLUDED from the denominator, so they neither earn nor lose points.
 *   They are reported per product in `unknowns` instead.
 * - A known-but-unmet preference earns 0 (and is reported in `compromises`);
 *   it can drag the score down but NEVER removes a product from the result,
 *   because scoring only runs on feasible survivors.
 * - score = round(100 * earned / applicable); when NO preference is
 *   applicable every product scores 0 and ordering falls back to the
 *   documented tie-breakers.
 *
 * ORDERING (deterministic, documented tie-breakers):
 *   1. score descending
 *   2. cheaper price first (only when both prices and the budget are known)
 *   3. stronger known GPU model first (GPU_MODELS order; unknown ranks last)
 *   4. more RAM first (unknown ranks last)
 *   5. product id ascending (final, always-decides tie-breaker)
 * Identical inputs therefore always produce the identical order.
 *
 * TERMINOLOGY: results are labelled by match quality - never "best".
 *   score >= 75 'strong match', >= 45 'good match', > 0 'partial match',
 *   0 'meets hard requirements'.
 *
 * Not yet scored (future work, deliberately out of scope): performance
 * priority, use cases, local AI, software list, additional requirements.
 */

import { DISPLAY_TIERS } from '../data/productSchema.js'
import { GPU_MODELS, GPU_TIERS, checkFeasibility } from './feasibility.js'

/** Preference weights - must sum to 100. Documented in the header. */
export const SCORING_WEIGHTS = {
  budget: 20,
  gpu: 20,
  ram: 15,
  storage: 15,
  display: 10,
  os: 10,
  portability: 5,
  battery: 5,
}

/** Weight thresholds for portability (kg) and battery (Wh), per priority. */
const PORTABILITY_LIMITS = {
  'very-important': 1.5,
  important: 2.0,
  'somewhat-important': 2.5,
}

const BATTERY_LIMITS = {
  'very-important': 70,
  important: 55,
  'somewhat-important': 50,
}

const gpuModelRank = (model) => GPU_MODELS.indexOf(model)
const gpuTierRank = (tier) => GPU_TIERS.indexOf(tier)
const displayTierRank = (tier) => DISPLAY_TIERS.indexOf(tier)

/** 79990 -> '₹79,990'; 1024 GB -> '1 TB'; 512 -> '512 GB'. */
const formatInr = (amount) =>
  `₹${new Intl.NumberFormat('en-IN').format(amount)}`
const formatGb = (gb) =>
  gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`

/**
 * True when a dedicated GPU requirement is satisfied. Mirrors the
 * feasibility semantics; used only for PREFERENCE credit here.
 */
function gpuPreferenceMet(requirements, product) {
  const gpu = requirements.gpu
  if (gpu.specificModel) {
    const needed = gpuModelRank(gpu.specificModel)
    const available = gpuModelRank(product.gpu.model)
    return needed >= 0 && available >= needed
  }
  if (gpu.minimumTier) {
    const needed = gpuTierRank(gpu.minimumTier)
    const available = gpuTierRank(product.gpu.tier)
    return needed >= 0 && available >= needed
  }
  return gpuTierRank(product.gpu.tier) > gpuTierRank('integrated')
}

/** Stated dedicated-GPU description for reasons/compromises, or null. */
function productGpuLabel(product) {
  if (typeof product.gpu.model === 'string' && product.gpu.model !== '') {
    return product.gpu.model
  }
  if (product.gpu.tier != null && product.gpu.tier !== 'integrated') {
    return `dedicated ${product.gpu.tier} GPU`
  }
  return null
}

/**
 * Score ONE feasible product against the preference profile.
 * Pure: returns { earned, applicable, reasons, compromises, unknowns }.
 * Every rule below only reads actual product data - nothing is invented.
 */
function scoreProduct(requirements, product) {
  let earned = 0
  let applicable = 0
  const reasons = []
  const compromises = []
  const unknowns = []

  /* Budget ----------------------------------------------------------------- */
  if (
    requirements.budget != null &&
    Number.isFinite(requirements.budget.max)
  ) {
    const price = product.pricing.currentPrice
    if (typeof price === 'number') {
      applicable += SCORING_WEIGHTS.budget
      if (price <= requirements.budget.max) {
        earned += SCORING_WEIGHTS.budget
        reasons.push(`Within your ${formatInr(requirements.budget.max)} budget`)
      }
    } else {
      unknowns.push('price unknown')
    }
  }

  /* GPU -------------------------------------------------------------------- */
  if (requirements.gpu != null && requirements.gpu.strict === false) {
    const gpuKnown =
      (requirements.gpu.specificModel != null &&
        product.gpu.model != null) ||
      (requirements.gpu.specificModel == null && product.gpu.tier != null)
    if (gpuKnown) {
      applicable += SCORING_WEIGHTS.gpu
      const label = productGpuLabel(product)
      if (gpuPreferenceMet(requirements, product)) {
        earned += SCORING_WEIGHTS.gpu
        reasons.push(
          label !== null ? `Includes ${label}` : 'Includes a dedicated GPU',
        )
      } else if (label !== null) {
        compromises.push(
          `Preferred GPU (${requirements.gpu.specificModel ?? requirements.gpu.minimumTier ?? 'dedicated'}) not matched — has ${label}`,
        )
      } else {
        compromises.push(
          `Preferred GPU (${requirements.gpu.specificModel ?? requirements.gpu.minimumTier ?? 'dedicated'}) not matched — no dedicated GPU stated`,
        )
      }
    } else {
      unknowns.push('GPU unknown')
    }
  }

  /* RAM -------------------------------------------------------------------- */
  if (
    requirements.ram != null &&
    requirements.ram.strict === false &&
    Number.isFinite(requirements.ram.minimumGb)
  ) {
    const preferred = requirements.ram.preferredGb ?? requirements.ram.minimumGb
    const capacity = product.ram.capacityGb
    if (typeof capacity === 'number') {
      applicable += SCORING_WEIGHTS.ram
      if (capacity >= preferred) {
        earned += SCORING_WEIGHTS.ram
        reasons.push(`${formatGb(capacity)} RAM`)
      } else {
        earned += SCORING_WEIGHTS.ram / 2
        compromises.push(
          `Has ${formatGb(capacity)} RAM — below your ${formatGb(preferred)} preference`,
        )
      }
    } else {
      unknowns.push('RAM unknown')
    }
  }

  /* Storage ------------------------------------------------------------------ */
  if (
    requirements.storage != null &&
    requirements.storage.strict === false &&
    Number.isFinite(requirements.storage.minimumGb)
  ) {
    const preferred =
      requirements.storage.preferredGb ?? requirements.storage.minimumGb
    const capacity = product.storage.capacityGb
    if (typeof capacity === 'number') {
      applicable += SCORING_WEIGHTS.storage
      if (capacity >= preferred) {
        earned += SCORING_WEIGHTS.storage
        reasons.push(`${formatGb(capacity)} storage`)
      } else {
        earned += SCORING_WEIGHTS.storage / 2
        compromises.push(
          `Has ${formatGb(capacity)} storage — below your ${formatGb(preferred)} preference`,
        )
      }
    } else {
      unknowns.push('storage unknown')
    }
  }

  /* Display -------------------------------------------------------------------- */
  if (
    requirements.display != null &&
    requirements.display.strict === false &&
    requirements.display.preference != null
  ) {
    const tier = product.display.tier
    if (tier != null) {
      applicable += SCORING_WEIGHTS.display
      const wanted = displayTierRank(requirements.display.preference)
      const actual = displayTierRank(tier)
      if (actual === wanted) {
        earned += SCORING_WEIGHTS.display
        reasons.push(`${tier} display`)
      } else if (wanted >= 0 && actual > wanted) {
        earned += SCORING_WEIGHTS.display / 2
        reasons.push(
          `${tier} display (above your ${requirements.display.preference} preference)`,
        )
      } else {
        compromises.push(
          `Has a ${tier} display — you preferred ${requirements.display.preference}`,
        )
      }
    } else {
      unknowns.push('display quality unknown')
    }
  }

  /* OS --------------------------------------------------------------------------- */
  if (
    requirements.os != null &&
    requirements.os.strict === false &&
    requirements.os.preferred != null
  ) {
    if (product.os != null) {
      applicable += SCORING_WEIGHTS.os
      if (product.os === requirements.os.preferred) {
        earned += SCORING_WEIGHTS.os
        reasons.push(`Ships with ${product.os}`)
      } else {
        compromises.push(
          `Ships with ${product.os} — you preferred ${requirements.os.preferred}`,
        )
      }
    } else {
      unknowns.push('operating system unknown')
    }
  }

  /* Portability -------------------------------------------------------------------- */
  if (
    requirements.portability != null &&
    requirements.portability.strict === false &&
    PORTABILITY_LIMITS[requirements.portability.priority] != null
  ) {
    const limit = PORTABILITY_LIMITS[requirements.portability.priority]
    const weight = product.physical.weightKg
    if (typeof weight === 'number') {
      applicable += SCORING_WEIGHTS.portability
      if (weight <= limit) {
        earned += SCORING_WEIGHTS.portability
        reasons.push(`${weight} kg — easy to carry`)
      } else {
        compromises.push(
          `${weight} kg — heavier than your portability preference`,
        )
      }
    } else {
      unknowns.push('weight unknown')
    }
  }

  /* Battery --------------------------------------------------------------------------- */
  if (
    requirements.battery != null &&
    requirements.battery.strict === false &&
    BATTERY_LIMITS[requirements.battery.priority] != null
  ) {
    const limit = BATTERY_LIMITS[requirements.battery.priority]
    const capacityWh = product.battery.capacityWh
    if (typeof capacityWh === 'number') {
      applicable += SCORING_WEIGHTS.battery
      if (capacityWh >= limit) {
        earned += SCORING_WEIGHTS.battery
        reasons.push(`${capacityWh} Wh battery`)
      } else {
        compromises.push(
          `${capacityWh} Wh battery — smaller than your battery preference`,
        )
      }
    } else {
      unknowns.push('battery capacity unknown')
    }
  }

  /* Hard-requirement highlights (facts only - NO points). Strict fields are
     enforced by feasibility.js before anything reaches this engine; when met
     they are still stated so the recommendation explains the whole profile. */
  if (
    requirements.ram != null &&
    requirements.ram.strict === true &&
    Number.isFinite(requirements.ram.minimumGb) &&
    typeof product.ram.capacityGb === 'number' &&
    product.ram.capacityGb >= requirements.ram.minimumGb
  ) {
    reasons.push(`${formatGb(product.ram.capacityGb)} RAM`)
  }
  if (
    requirements.os != null &&
    requirements.os.strict === true &&
    requirements.os.preferred != null &&
    product.os === requirements.os.preferred
  ) {
    reasons.push(`Ships with ${product.os}`)
  }
  if (
    requirements.gpu != null &&
    requirements.gpu.strict === true &&
    gpuPreferenceMet(requirements, product)
  ) {
    const label = productGpuLabel(product)
    reasons.push(
      label !== null ? `Includes ${label}` : 'Includes a dedicated GPU',
    )
  }

  return { earned, applicable, reasons, compromises, unknowns }
}

/** Deterministic match-quality label - never "best". */
function matchLabel(score) {
  if (score >= 75) return 'strong match'
  if (score >= 45) return 'good match'
  if (score > 0) return 'partial match'
  return 'meets hard requirements'
}

/**
 * Documented deterministic ordering (see header):
 *   score desc -> cheaper first -> stronger known GPU -> more RAM -> id asc.
 */
function compareRecommendations(a, b) {
  if (b.score !== a.score) return b.score - a.score
  const priceA = a.product.pricing.currentPrice
  const priceB = b.product.pricing.currentPrice
  if (typeof priceA === 'number' && typeof priceB === 'number' && priceA !== priceB) {
    return priceA - priceB
  }
  const gpuA = gpuModelRank(a.product.gpu.model)
  const gpuB = gpuModelRank(b.product.gpu.model)
  if (gpuA !== gpuB) return gpuB - gpuA
  const ramA = a.product.ram.capacityGb ?? -1
  const ramB = b.product.ram.capacityGb ?? -1
  if (ramA !== ramB) return ramB - ramA
  return String(a.product.id).localeCompare(String(b.product.id))
}

/**
 * Score and order ALREADY-FEASIBLE products. This is the core primitive:
 * it trusts the caller that every product passed checkFeasibility() and
 * never applies hard requirements itself - scoring can only rank, never
 * rescue. Pure and deterministic.
 *
 * @param {object} requirements - normalized Buyer Requirements Profile.
 * @param {object[]} feasibleProducts - products returned by feasibility.js.
 * @returns {Array<{product: object, score: number, matchLabel: string,
 *   reasons: string[], compromises: string[], unknowns: string[]}>}
 */
export function recommendProducts(requirements, feasibleProducts) {
  return (Array.isArray(feasibleProducts) ? feasibleProducts : [])
    .map((product) => {
      const scored = scoreProduct(requirements, product)
      const score =
        scored.applicable === 0
          ? 0
          : Math.round((100 * scored.earned) / scored.applicable)
      return {
        product,
        score,
        matchLabel: matchLabel(score),
        reasons: scored.reasons,
        compromises: scored.compromises,
        unknowns: scored.unknowns,
      }
    })
    .sort(compareRecommendations)
}

/**
 * Full recommendation pipeline: feasibility FIRST (hard requirements are
 * never overridden), then preference scoring on the survivors only.
 * Zero-result behavior: when feasibility finds no matching product, scoring
 * is NOT run - the feasibility conflicts are returned unchanged together
 * with an empty recommendation list.
 *
 * @param {object} requirements - normalized Buyer Requirements Profile.
 * @param {object[]} products - normalized catalog (feasibility's job to filter).
 * @returns {{
 *   feasible: boolean,
 *   recommendations: Array<{product: object, score: number, matchLabel: string,
 *     reasons: string[], compromises: string[], unknowns: string[]}>,
 *   conflicts: Array<{field: string, reason: string}>,
 *   unmetPreferences: Array<{field: string, expected: unknown, actual: unknown}>,
 * }}
 */
export function getRecommendations(requirements, products) {
  const feasibilityResult = checkFeasibility(requirements, products)
  if (!feasibilityResult.feasible) {
    return {
      feasible: false,
      recommendations: [],
      conflicts: feasibilityResult.conflicts,
      unmetPreferences: [],
    }
  }
  return {
    feasible: true,
    recommendations: recommendProducts(
      requirements,
      feasibilityResult.matchingProducts,
    ),
    conflicts: feasibilityResult.conflicts,
    unmetPreferences: feasibilityResult.unmetPreferences,
  }
}