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
 *
 * CLOSEST-MATCH FALLBACK (no-exact-match UX):
 * When checkFeasibility() finds no product satisfying every hard
 * requirement, getRecommendations() no longer returns an empty list. It
 * returns the top CLOSEST_MATCH_LIMIT (3) real products, ranked by how many
 * requirement groups they satisfy, allowing ONLY these controlled
 * deviations (never inventing products or data):
 *   budget  - up to ~15% over the stated maximum
 *   gpu     - one GPU tier below the requested minimum (a requested
 *             dedicated GPU is still never replaced by integrated graphics)
 *   storage - one step down the standard capacity ladder (256/512/1024/2048)
 *   display - one quality step below the requested tier
 * RAM and OS are never relaxed. Each result is labelled 'closest match'
 * (never presented as an exact match) and carries a structured
 * `deviations` list plus factual gap notes folded into `compromises`, so
 * the UI can show exactly why each alternative differs. The original
 * conflict diagnosis is preserved unchanged. Fallback ranking:
 *   satisfied requirement groups desc -> score desc -> cheaper ->
 *   stronger GPU -> more RAM -> id asc.
 * The feasible path (result.feasible === true) is completely unchanged;
 * the result additionally carries closestMatches: true/false in both.
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

/* ==========================================================================
 * CLOSEST-MATCH FALLBACK
 * Used ONLY when feasibility found zero products (see the header). Purely
 * factual: counts how many requirement groups each REAL product satisfies,
 * with the documented controlled deviations. Never invents data.
 * ========================================================================== */

/** Max relative overage allowed on a stated maximum budget (15%). */
const BUDGET_OVERAGE_ALLOWANCE = 0.15

/** At most this many closest matches are returned. */
const CLOSEST_MATCH_LIMIT = 3

/** Standard storage capacities (GB, ascending) for one-step-down deviations. */
const STORAGE_LADDER = [256, 512, 1024, 2048]

/** Largest standard storage step strictly below gb (null when none). */
function oneStorageStepDown(gb) {
  const steps = STORAGE_LADDER.filter((step) => step < gb)
  return steps.length > 0 ? steps[steps.length - 1] : null
}

/**
 * One requirement group of the fallback. All notes are factual strings
 * rendered from actual product data.
 * - exact: satisfies the requirement exactly as stated.
 * - withinDeviation: satisfies it within the allowed controlled deviation.
 * - deviation: factual difference when the deviation is taken (null when
 *   the product actually exceeds the requirement - nothing to apologize for).
 * - gap: factual difference when neither exact nor deviation holds.
 * Unknown product data is never treated as satisfied.
 */
const FIT_GROUPS = [
  {
    field: 'budget',
    applicable: (req) => req.budget != null && Number.isFinite(req.budget.max),
    exact: (req, product) =>
      typeof product.pricing.currentPrice === 'number' &&
      product.pricing.currentPrice <= req.budget.max,
    withinDeviation: (req, product) =>
      typeof product.pricing.currentPrice === 'number' &&
      product.pricing.currentPrice <=
        req.budget.max * (1 + BUDGET_OVERAGE_ALLOWANCE),
    deviation: (req, product) => {
      const price = product.pricing.currentPrice
      const overPercent = Math.round((price / req.budget.max - 1) * 100)
      return `${formatInr(price)} is about ${overPercent}% over your ${formatInr(req.budget.max)} budget`
    },
    gap: (req, product) =>
      typeof product.pricing.currentPrice === 'number'
        ? `${formatInr(product.pricing.currentPrice)} — more than ${Math.round(BUDGET_OVERAGE_ALLOWANCE * 100)}% over your ${formatInr(req.budget.max)} budget`
        : 'Price not stated',
  },
  {
    field: 'ram',
    applicable: (req) => req.ram != null && Number.isFinite(req.ram.minimumGb),
    exact: (req, product) =>
      typeof product.ram.capacityGb === 'number' &&
      product.ram.capacityGb >= (req.ram.preferredGb ?? req.ram.minimumGb),
    withinDeviation: (req, product) =>
      typeof product.ram.capacityGb === 'number' &&
      product.ram.capacityGb >= req.ram.minimumGb,
    deviation: (req, product) =>
      `Has ${formatGb(product.ram.capacityGb)} RAM — meets your ${formatGb(req.ram.minimumGb)} minimum but not your ${formatGb(req.ram.preferredGb ?? req.ram.minimumGb)} preference`,
    gap: (req, product) =>
      typeof product.ram.capacityGb === 'number'
        ? `Has ${formatGb(product.ram.capacityGb)} RAM — below your ${formatGb(req.ram.minimumGb)} minimum`
        : 'RAM capacity not stated',
  },
  {
    field: 'storage',
    applicable: (req) =>
      req.storage != null && Number.isFinite(req.storage.minimumGb),
    exact: (req, product) =>
      typeof product.storage.capacityGb === 'number' &&
      product.storage.capacityGb >=
        (req.storage.preferredGb ?? req.storage.minimumGb),
    withinDeviation: (req, product) => {
      if (typeof product.storage.capacityGb !== 'number') return false
      if (product.storage.capacityGb >= req.storage.minimumGb) return true
      const stepDown = oneStorageStepDown(req.storage.minimumGb)
      return stepDown != null && product.storage.capacityGb >= stepDown
    },
    deviation: (req, product) => {
      if (product.storage.capacityGb >= req.storage.minimumGb) {
        return `Has ${formatGb(product.storage.capacityGb)} storage — meets your ${formatGb(req.storage.minimumGb)} minimum but not your ${formatGb(req.storage.preferredGb ?? req.storage.minimumGb)} preference`
      }
      return `Has ${formatGb(product.storage.capacityGb)} storage — one step below your ${formatGb(req.storage.minimumGb)} minimum`
    },
    gap: (req, product) =>
      typeof product.storage.capacityGb === 'number'
        ? `Has ${formatGb(product.storage.capacityGb)} storage — well below your ${formatGb(req.storage.minimumGb)} minimum`
        : 'Storage capacity not stated',
  },
  {
    field: 'gpu',
    applicable: (req) =>
      req.gpu != null &&
      (req.gpu.required === true || req.gpu.minimumTier != null),
    exact: (req, product) => {
      const gpu = req.gpu
      if (
        gpu.required === true &&
        gpuTierRank(product.gpu.tier) <= gpuTierRank('integrated')
      ) {
        return false
      }
      if (gpu.minimumTier != null) {
        const needed = gpuTierRank(gpu.minimumTier)
        if (needed < 0 || gpuTierRank(product.gpu.tier) < needed) return false
      }
      if (gpu.specificModel != null) {
        const needed = gpuModelRank(gpu.specificModel)
        const available = gpuModelRank(product.gpu.model)
        if (needed >= 0 && (available < 0 || available < needed)) return false
      }
      return true
    },
    withinDeviation: (req, product) => {
      const gpu = req.gpu
      const tier = gpuTierRank(product.gpu.tier)
      // A requested dedicated GPU is never downgraded to integrated graphics.
      if (gpu.required === true && tier <= gpuTierRank('integrated')) {
        return false
      }
      const neededTier =
        gpu.minimumTier != null
          ? gpuTierRank(gpu.minimumTier)
          : gpuTierRank('entry-level')
      if (neededTier < 0) return false
      return tier >= neededTier - 1
    },
    deviation: (req, product) => {
      const gpu = req.gpu
      const label = productGpuLabel(product) ?? 'Integrated graphics'
      const tier = gpuTierRank(product.gpu.tier)
      if (
        gpu.minimumTier != null &&
        tier < gpuTierRank(gpu.minimumTier)
      ) {
        return `${label} — one tier below the ${gpu.minimumTier} GPU you asked for`
      }
      if (gpu.specificModel != null) {
        return `${product.gpu.model ?? label} — below the ${gpu.specificModel} you asked for`
      }
      return `${label} — below your GPU request`
    },
    gap: (req, product) => {
      const label = productGpuLabel(product)
      return label != null
        ? `${label} — below the ${req.gpu.minimumTier ?? 'dedicated'} GPU you asked for`
        : 'No dedicated GPU — you asked for one'
    },
  },
  {
    field: 'display',
    applicable: (req) => req.display != null && req.display.preference != null,
    exact: (req, product) => product.display.tier === req.display.preference,
    withinDeviation: (req, product) => {
      const wanted = displayTierRank(req.display.preference)
      const actual = displayTierRank(product.display.tier)
      return wanted >= 0 && actual >= 0 && actual >= wanted - 1
    },
    deviation: (req, product) =>
      displayTierRank(product.display.tier) >
      displayTierRank(req.display.preference)
        ? null // better than requested - satisfied, nothing to apologize for
        : `Has a ${product.display.tier} display — one step below your ${req.display.preference} preference`,
    gap: (req, product) =>
      product.display.tier != null
        ? `Has a ${product.display.tier} display — you preferred ${req.display.preference}`
        : 'Display quality not stated',
  },
  {
    field: 'os',
    applicable: (req) => req.os != null && req.os.preferred != null,
    exact: (req, product) => product.os === req.os.preferred,
    // Operating system is never relaxed - it either matches or it does not.
    withinDeviation: () => false,
    deviation: () => null,
    gap: (req, product) =>
      product.os != null
        ? `Ships with ${product.os} — you preferred ${req.os.preferred}`
        : 'Operating system not stated',
  },
]



/**
 * Counts how many requirement groups one product satisfies, collecting the
 * factual deviation and gap notes.
 */
function requirementFit(requirements, product) {
  let satisfiedCount = 0
  const deviations = []
  const gaps = []
  for (const group of FIT_GROUPS) {
    if (!group.applicable(requirements)) continue
    if (group.exact(requirements, product)) {
      satisfiedCount += 1
      continue
    }
    const note = group.withinDeviation(requirements, product)
      ? group.deviation(requirements, product)
      : null
    if (note !== null) {
      satisfiedCount += 1
      if (note !== '') deviations.push(note)
    } else {
      gaps.push(group.gap(requirements, product))
    }
  }
  return { satisfiedCount, deviations, gaps }
}

/**
 * The top closest real products when no exact match exists (see header).
 * Ranked by satisfied requirement groups first, then the documented
 * recommendation ordering. Pure and deterministic.
 *
 * @param {object} requirements - normalized Buyer Requirements Profile.
 * @param {object[]} products - normalized catalog.
 * @returns {Array<{product: object, score: number, matchLabel: string,
 *   reasons: string[], compromises: string[], unknowns: string[],
 *   deviations: string[], satisfiedCount: number}>} at most 3 items.
 */
export function findClosestMatches(requirements, products) {
  return (Array.isArray(products) ? products : [])
    .map((product) => {
      const fit = requirementFit(requirements, product)
      const scored = scoreProduct(requirements, product)
      const score =
        scored.applicable === 0
          ? 0
          : Math.round((100 * scored.earned) / scored.applicable)
      return {
        product,
        score,
        // Closest matches are NEVER presented as exact matches.
        matchLabel: 'closest match',
        reasons: scored.reasons,
        // De-duplicated: the engine's own preference compromises plus the
        // fallback's deviation and gap notes.
        compromises: [
          ...new Set([...scored.compromises, ...fit.deviations, ...fit.gaps]),
        ],
        unknowns: scored.unknowns,
        deviations: fit.deviations,
        satisfiedCount: fit.satisfiedCount,
      }
    })
    .sort((a, b) => {
      if (b.satisfiedCount !== a.satisfiedCount) {
        return b.satisfiedCount - a.satisfiedCount
      }
      return compareRecommendations(a, b)
    })
    .slice(0, CLOSEST_MATCH_LIMIT)
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
  if (feasibilityResult.feasible) {
    return {
      feasible: true,
      closestMatches: false,
      recommendations: recommendProducts(
        requirements,
        feasibilityResult.matchingProducts,
      ),
      conflicts: feasibilityResult.conflicts,
      unmetPreferences: feasibilityResult.unmetPreferences,
    }
  }
  // No real product satisfies every hard requirement. Instead of an empty
  // list, return the top CLOSEST real alternatives (labelled 'closest
  // match', allowing only the documented controlled deviations) together
  // with the unchanged conflict diagnosis.
  const closestMatches = findClosestMatches(requirements, products)
  return {
    feasible: false,
    closestMatches: closestMatches.length > 0,
    recommendations: closestMatches,
    conflicts: feasibilityResult.conflicts,
    unmetPreferences: [],
  }
}