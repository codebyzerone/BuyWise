/**
 * Feasibility engine.
 *
 * Answers exactly one question: "Can a product satisfy the user's
 * non-negotiable (strict) requirements?" It deliberately knows nothing about
 * scoring - ranking feasible products is the future recommendation engine's
 * job.
 *
 * Pipeline position:
 *   RAW ANSWERS -> NORMALIZED REQUIREMENTS -> FEASIBILITY -> SCORING
 *
 * Requirements shape: the normalized Buyer Requirements Profile produced by
 * src/data/buildRequirements.js (full schema documented there).
 *
 * Product shape: the normalized Product Schema from src/data/productSchema.js
 * (createEmptyProduct() there is the canonical shape). Fields consumed here:
 * {
 *   id: 'BUYWISE-TEST-01',
 *   pricing: { currentPrice: 75000 },  // rupees, plain number (null = unknown)
 *   gpu: { model: 'RTX 4050', tier: 'mid-range' }, // model null for iGPU-only
 *   ram: { capacityGb: 16 },
 *   storage: { capacityGb: 1024 },
 *   os: 'windows',                     // 'windows' | 'macos' | 'linux'
 *   display: { tier: 'good' },         // DISPLAY_TIERS vocabulary
 * }
 */

/**
 * Explicit GPU vocabulary with ordinal rankings.
 *
 * GPU names/tiers must never be compared alphabetically - compare ranks from
 * these ordered lists instead. Extend the lists as the catalog grows; unknown
 * models/tiers rank below every known entry, so unknown hardware can never
 * accidentally satisfy a strict requirement.
 */
export const GPU_TIERS = [
  'integrated',
  'entry-level',
  'mid-range',
  'high-performance',
]

export const GPU_MODELS = [
  'RTX 3050',
  'RTX 4050',
  'RTX 4060',
  'RTX 4070',
  'RTX 4080',
  'RTX 4090',
  'RTX 5090',
]

const gpuTierRank = (tier) => GPU_TIERS.indexOf(tier)
const gpuModelRank = (model) => GPU_MODELS.indexOf(model)

/** True when the product's normalized GPU satisfies the gpu requirement. */
function gpuSatisfies(product, gpu) {
  if (gpu.required) {
    // Integrated GPUs never satisfy a dedicated-GPU requirement.
    if (gpuTierRank(product.gpu?.tier) <= gpuTierRank('integrated')) {
      return false
    }
  }
  if (
    gpu.minimumTier &&
    gpuTierRank(product.gpu?.tier) < gpuTierRank(gpu.minimumTier)
  ) {
    return false
  }
  if (gpu.specificModel) {
    const needed = gpuModelRank(gpu.specificModel)
    const available = gpuModelRank(product.gpu?.model)
    if (needed >= 0 && (available < 0 || available < needed)) return false
  }
  return true
}

/** Rupee amounts formatted with Indian digit grouping: 80000 -> ₹80,000. */
const formatRupees = (amount) =>
  `₹${new Intl.NumberFormat('en-IN').format(amount)}`

/**
 * Hard (strict) constraints. A constraint is only enforced when its
 * `isApplicable` returns true - i.e. the field was asked and flagged strict.
 * Add new entries here as fields gain strict semantics; the engine loop does
 * not change. `describe` renders the requirement in plain language so joint
 * conflicts can name the clashing requirements.
 */
const HARD_CONSTRAINTS = [
  {
    field: 'budget',
    isApplicable: (req) =>
      req.budget?.strict === true && Number.isFinite(req.budget?.max),
    isSatisfied: (req, product) =>
      // Unknown (null) prices can never be verified against a hard budget.
      typeof product.pricing?.currentPrice === 'number' &&
      product.pricing.currentPrice <= req.budget.max,
    describe: (req) => `the ${formatRupees(req.budget.max)} maximum budget`,
    conflictReason: (req) =>
      `No available product is within the hard maximum budget of ${formatRupees(req.budget.max)}.`,
  },
  {
    field: 'ram',
    isApplicable: (req) =>
      req.ram?.strict === true && Number.isFinite(req.ram?.minimumGb),
    isSatisfied: (req, product) =>
      // Unknown (null) RAM can never be verified against a hard minimum.
      typeof product.ram?.capacityGb === 'number' &&
      product.ram.capacityGb >= req.ram.minimumGb,
    describe: (req) => `the hard minimum of ${req.ram.minimumGb} GB of RAM`,
    conflictReason: (req) =>
      `No available product offers at least ${req.ram.minimumGb} GB of RAM together with the other hard constraints.`,
  },
  {
    field: 'gpu',
    isApplicable: (req) => req.gpu != null && req.gpu.strict === true,
    isSatisfied: (req, product) => gpuSatisfies(product, req.gpu),
    describe: (req) =>
      req.gpu.specificModel
        ? `the requested ${req.gpu.specificModel}-or-better GPU`
        : req.gpu.minimumTier
          ? `the requested ${req.gpu.minimumTier}-or-better GPU`
          : 'the requested dedicated GPU',
    conflictReason: () =>
      'No available product satisfies the requested GPU requirement together with the current hard constraints.',
  },
  {
    field: 'os',
    isApplicable: (req) =>
      req.os != null && req.os.strict === true && req.os.preferred != null,
    isSatisfied: (req, product) => product.os === req.os.preferred,
    describe: (req) => `the required ${req.os.preferred} operating system`,
    conflictReason: (req) =>
      `No available product ships with ${req.os.preferred} as required.`,
  },
]

/**
 * Preferred (non-strict) requirements. When no feasible product satisfies a
 * preference it is reported in `unmetPreferences` - never as a failure.
 */
const PREFERENCES = [
  {
    field: 'ram',
    isApplicable: (req) =>
      req.ram != null &&
      req.ram.strict === false &&
      Number.isFinite(req.ram.minimumGb),
    expectedOf: (req) => `${req.ram.preferredGb ?? req.ram.minimumGb}GB`,
    actualOf: (product) => `${product.ram?.capacityGb}GB`,
    isSatisfied: (req, product) =>
      typeof product.ram?.capacityGb === 'number' &&
      product.ram.capacityGb >= (req.ram.preferredGb ?? req.ram.minimumGb),
  },
  {
    field: 'storage',
    isApplicable: (req) =>
      req.storage != null &&
      req.storage.strict === false &&
      Number.isFinite(req.storage.minimumGb),
    expectedOf: (req) => `${req.storage.preferredGb ?? req.storage.minimumGb}GB`,
    actualOf: (product) => `${product.storage?.capacityGb}GB`,
    isSatisfied: (req, product) =>
      typeof product.storage?.capacityGb === 'number' &&
      product.storage.capacityGb >=
        (req.storage.preferredGb ?? req.storage.minimumGb),
  },
  {
    field: 'gpu',
    isApplicable: (req) => req.gpu != null && req.gpu.strict === false,
    expectedOf: (req) =>
      req.gpu.specificModel ?? req.gpu.minimumTier ?? 'any dedicated GPU',
    actualOf: (product) => product.gpu?.model ?? product.gpu?.tier ?? 'integrated',
    isSatisfied: (req, product) => gpuSatisfies(product, req.gpu),
  },
  {
    field: 'display',
    isApplicable: (req) =>
      req.display != null &&
      req.display.strict === false &&
      req.display.preference != null,
    expectedOf: (req) => req.display.preference,
    actualOf: (product) => product.display?.tier ?? null,
    isSatisfied: (req, product) =>
      product.display?.tier === req.display.preference,
  },
  {
    field: 'os',
    isApplicable: (req) =>
      req.os != null && req.os.strict === false && req.os.preferred != null,
    expectedOf: (req) => req.os.preferred,
    actualOf: (product) => product.os,
    isSatisfied: (req, product) => product.os === req.os.preferred,
  },
]

/**
 * @param {object}   requirements - Normalized Buyer Requirements Profile.
 * @param {object[]} products     - Normalized product catalog entries.
 * @returns {{
 *   feasible: boolean,
 *   matchingProducts: object[],
 *   conflicts: Array<{ field: string, reason: string }>,
 *   unmetPreferences: Array<{ field: string, expected: unknown, actual: unknown }>,
 * }}
 */
export function checkFeasibility(requirements, products) {
  const applicableHard = HARD_CONSTRAINTS.filter((constraint) =>
    constraint.isApplicable(requirements),
  )

  const matchingProducts = products.filter((product) =>
    applicableHard.every((constraint) =>
      constraint.isSatisfied(requirements, product),
    ),
  )

  const conflicts = []
  if (matchingProducts.length === 0) {
    // Diagnose which hard requirements no product in the catalog can meet.
    for (const constraint of applicableHard) {
      const satisfiedByAny = products.some((product) =>
        constraint.isSatisfied(requirements, product),
      )
      if (!satisfiedByAny) {
        conflicts.push({
          field: constraint.field,
          reason: constraint.conflictReason(requirements),
        })
      }
    }

    // Joint diagnosis: every constraint may be satisfiable on its own while no
    // single product satisfies them all (e.g. a cheap-but-weak product and an
    // expensive-but-strong one). Name the clashing fields when a unique pair
    // explains it; otherwise fall back to a combined conflict.
    if (conflicts.length === 0 && applicableHard.length > 1) {
      const failingPairs = []
      for (let i = 0; i < applicableHard.length; i += 1) {
        for (let j = i + 1; j < applicableHard.length; j += 1) {
          const first = applicableHard[i]
          const second = applicableHard[j]
          const jointlySatisfied = products.some(
            (product) =>
              first.isSatisfied(requirements, product) &&
              second.isSatisfied(requirements, product),
          )
          if (!jointlySatisfied) {
            failingPairs.push([first, second])
          }
        }
      }

      if (failingPairs.length === 1) {
        const [first, second] = failingPairs[0]
        conflicts.push({
          field: `${first.field}+${second.field}`,
          reason: `No available product satisfies both ${first.describe(requirements)} and ${second.describe(requirements)}.`,
        })
      } else {
        conflicts.push({
          field: applicableHard.map((constraint) => constraint.field).join('+'),
          reason:
            'No available product satisfies all hard requirements simultaneously. The requirements conflict with the available products.',
        })
      }
    }
  }

  const unmetPreferences = []
  if (matchingProducts.length > 0) {
    for (const preference of PREFERENCES) {
      if (!preference.isApplicable(requirements)) continue
      const satisfiedByAny = matchingProducts.some((product) =>
        preference.isSatisfied(requirements, product),
      )
      if (!satisfiedByAny) {
        unmetPreferences.push({
          field: preference.field,
          expected: preference.expectedOf(requirements),
          actual: preference.actualOf(matchingProducts[0]),
        })
      }
    }
  }

  return {
    feasible: matchingProducts.length > 0,
    matchingProducts,
    conflicts,
    unmetPreferences,
  }
}