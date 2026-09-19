/**
 * BuyWise API request -> normalized Buyer Requirements Profile.
 *
 * Pipeline position (backend mirrors the frontend pipeline):
 *   API REQUEST -> NORMALIZED REQUIREMENTS -> FEASIBILITY -> SCORING
 *
 * The engine (frontend/src/engine) is REUSED unchanged; this module only maps
 * and validates the wire format into the exact normalized profile shape the
 * frontend's buildRequirements.js produces (full schema documented there).
 *
 * TWO accepted request shapes (fields may be freely mixed):
 *
 * 1. SIMPLE FLAT SHAPE (documented API contract):
 * {
 *   "budget": 90000,        // INR maximum; a hard cap by definition
 *   "ram": 16,              // GB wanted
 *   "storage": 512,         // GB wanted
 *   "gpu": "mid-range",     // GPU_TIERS value, case-insensitive
 *   "gpuModel": "RTX 4050", // optional specific minimum GPU model
 *   "os": "Windows",        // case-insensitive
 *   "workloads": ["AI/ML", "Programming"]
 * }
 *
 * 2. FULL NORMALIZED PROFILE (what the frontend interview produces, e.g.
 *    budget: { max, strict }, ram: { minimumGb, preferredGb, strict }, ...):
 *    accepted as-is after light validation, so the frontend can later POST
 *    its profile verbatim without any backend change.
 *
 * STRICTNESS follows the frontend conventions (buildRequirements.js):
 * only the flat budget is hard (`strict: true` - a stated maximum is a hard
 * cap by definition); ram/storage/gpu/os mapped from flat fields are
 * preferences (`strict: false`). Callers who need hard ram/gpu/os constraints
 * send the full-profile object form with `strict: true`.
 *
 * Unknown values stay absent - never invented (same rule as the schema).
 */

import { GPU_TIERS } from '../../frontend/src/engine/feasibility.js'
import {
  DISPLAY_TIERS,
  OS_VALUES,
} from '../../frontend/src/data/productSchema.js'

/** The profile's useCases vocabulary (see buildRequirements.js). */
export const USE_CASES = [
  'college_office',
  'video_editing',
  'programming',
  'gaming',
  'ai_ml',
]

/** Case-insensitive workload spellings -> profile useCases values. */
const WORKLOAD_ALIASES = {
  ai_ml: [
    'ai/ml',
    'ai-ml',
    'ai_ml',
    'ai',
    'ml',
    'machine learning',
    'machine-learning',
  ],
  programming: ['programming', 'programming / development', 'development', 'coding', 'dev'],
  gaming: ['gaming', 'games', 'gaming / esports'],
  college_office: [
    'college_office',
    'college/office',
    'college',
    'college / everyday',
    'college_everyday',
    'everyday',
    'daily use',
    'professional',
    'office',
    'office / business',
    'business',
  ],
  video_editing: [
    'video_editing',
    'video editing',
    'creative',
    'creative work',
    'video',
    'photo editing',
    '3d',
    '3d rendering',
    'cad',
    'design',
  ],
}

/** Case-insensitive GPU tier spellings -> GPU_TIERS values. */
const GPU_TIER_ALIASES = {
  integrated: 'integrated',
  igpu: 'integrated',
  'entry-level': 'entry-level',
  entry: 'entry-level',
  'entry level': 'entry-level',
  basic: 'entry-level',
  'mid-range': 'mid-range',
  mid: 'mid-range',
  midrange: 'mid-range',
  'mid range': 'mid-range',
  'high-performance': 'high-performance',
  high: 'high-performance',
  'high end': 'high-performance',
  'high-end': 'high-performance',
  highperformance: 'high-performance',
  dedicated: 'entry-level',
}

const MIN_PLAUSIBLE_BUDGET = 1000
const MIN_RAM_GB = 1
const MAX_RAM_GB = 256
const MIN_STORAGE_GB = 1
const MAX_STORAGE_GB = 16384

const asTrimmedString = (value) =>
  typeof value === 'string' ? value.trim() : null

/** Accepts 90000 or "90000" (numeric strings are a common client mistake). */
function parsePositiveNumber(value) {
  const number =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) ? number : null
}

function parseTier(value) {
  const text = asTrimmedString(value)
  if (text === null) return null
  const normalized = GPU_TIER_ALIASES[text.toLowerCase()]
  return GPU_TIERS.includes(normalized) ? normalized : null
}

function parseOs(value) {
  const text = asTrimmedString(value)
  if (text === null) return null
  const lowered = text.toLowerCase()
  if (lowered.includes('window') || lowered.startsWith('win')) return 'windows'
  if (lowered.includes('mac') || lowered === 'osx' || lowered === 'darwin') {
    return 'macos'
  }
  if (lowered.includes('linux') || lowered.includes('ubuntu')) return 'linux'
  return OS_VALUES.includes(lowered) ? lowered : null
}

/** Maps free-text workload names onto the profile's useCases vocabulary. */
function mapWorkload(value) {
  const text = asTrimmedString(value)
  if (text === null) return null
  const lowered = text.toLowerCase()
  for (const [useCase, aliases] of Object.entries(WORKLOAD_ALIASES)) {
    if (aliases.some((alias) => alias === lowered)) return useCase
  }
  return null
}

/**
 * Validates and maps the request body into the normalized Buyer Requirements
 * Profile consumed by the engine.
 *
 * @param {unknown} body - Parsed JSON request body.
 * @returns {{
 *   requirements: object | null,
 *   errors: string[],
 *   warnings: string[],
 * }} requirements is null when the request is invalid.
 */
export function normalizeRequirements(body) {
  const errors = []
  const warnings = []
  const envelope =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? body
      : null

  if (envelope === null) {
    return {
      requirements: null,
      errors: ['Request body must be a JSON object with laptop requirements.'],
      warnings,
    }
  }

  /* Phase B envelope: POST /recommend may wrap the requirements object
     { "requirements": { ... } } (API Gateway contract); the flat shape
     (fields at the top level) stays supported for direct/backward use. */
  let input = envelope
  if (envelope.requirements !== undefined) {
    if (
      envelope.requirements === null ||
      typeof envelope.requirements !== 'object' ||
      Array.isArray(envelope.requirements)
    ) {
      return {
        requirements: null,
        errors: ['"requirements" must be a JSON object with laptop requirements.'],
        warnings,
      }
    }
    input = envelope.requirements
  }

  const KNOWN_FIELDS = new Set([
    'budget',
    'ram',
    'storage',
    'gpu',
    'gpuModel',
    'os',
    'workloads',
    'useCases',
    'category',
    'performance',
    'localAi',
    'portability',
    'battery',
    'display',
    'software',
    'additionalRequirements',
    'derived',
  ])
  for (const field of Object.keys(input)) {
    if (!KNOWN_FIELDS.has(field)) {
      warnings.push(`Ignored unknown field "${field}".`)
    }
  }

  const requirements = { category: 'laptop', useCases: [], derived: [] }
  let mappedFieldCount = 0

  /* Budget: flat number = hard maximum; object = full-profile form. --------- */
  const budgetInput = input.budget
  if (budgetInput !== undefined && budgetInput !== null) {
    if (typeof budgetInput === 'number' || typeof budgetInput === 'string') {
      const max = parsePositiveNumber(budgetInput)
      if (max === null || max < MIN_PLAUSIBLE_BUDGET) {
        errors.push(
          `"budget" must be a maximum budget in INR of at least ${MIN_PLAUSIBLE_BUDGET}.`,
        )
      } else {
        requirements.budget = { max, strict: true }
        mappedFieldCount += 1
      }
    } else if (typeof budgetInput === 'object') {
      const max = parsePositiveNumber(budgetInput.max)
      if (max === null || max < MIN_PLAUSIBLE_BUDGET) {
        errors.push(
          `"budget.max" must be a maximum budget in INR of at least ${MIN_PLAUSIBLE_BUDGET}.`,
        )
      } else {
        requirements.budget = { max, strict: budgetInput.strict === true }
        mappedFieldCount += 1
      }
    } else {
      errors.push('"budget" must be a number or a { max, strict } object.')
    }
  }

  /* RAM / storage: flat number = preference; object = full-profile form. ---- */
  for (const field of ['ram', 'storage']) {
    const fieldInput = input[field]
    if (fieldInput === undefined || fieldInput === null) continue
    const bounds =
      field === 'ram'
        ? { min: MIN_RAM_GB, max: MAX_RAM_GB }
        : { min: MIN_STORAGE_GB, max: MAX_STORAGE_GB }
    if (typeof fieldInput === 'number' || typeof fieldInput === 'string') {
      const gb = parsePositiveNumber(fieldInput)
      if (gb === null || gb < bounds.min || gb > bounds.max) {
        errors.push(
          `"${field}" must be a capacity in GB between ${bounds.min} and ${bounds.max}.`,
        )
      } else {
        requirements[field] = { minimumGb: gb, preferredGb: gb, strict: false }
        mappedFieldCount += 1
      }
    } else if (typeof fieldInput === 'object') {
      const minimum = parsePositiveNumber(fieldInput.minimumGb)
      const preferred =
        parsePositiveNumber(fieldInput.preferredGb ?? fieldInput.minimumGb) ??
        minimum
      if (minimum === null || minimum < bounds.min || minimum > bounds.max) {
        errors.push(
          `"${field}.minimumGb" must be a capacity in GB between ${bounds.min} and ${bounds.max}.`,
        )
      } else {
        requirements[field] = {
          minimumGb: minimum,
          preferredGb: preferred,
          strict: fieldInput.strict === true,
        }
        mappedFieldCount += 1
      }
    } else {
      errors.push(
        `"${field}" must be a number or a { minimumGb, preferredGb, strict } object.`,
      )
    }
  }

  /* GPU: flat tier string, or full-profile object. --------------------------- */
  const gpuInput = input.gpu
  if (gpuInput !== undefined && gpuInput !== null) {
    if (typeof gpuInput === 'string') {
      const tier = parseTier(gpuInput)
      if (tier === null) {
        errors.push(
          `"gpu" must be one of: ${GPU_TIERS.join(', ')} (case-insensitive).`,
        )
      } else {
        requirements.gpu = {
          required: tier !== 'integrated',
          minimumTier: tier,
          specificModel: null,
          strict: false,
        }
        mappedFieldCount += 1
      }
    } else if (typeof gpuInput === 'object') {
      const tier =
        gpuInput.minimumTier !== undefined && gpuInput.minimumTier !== null
          ? parseTier(gpuInput.minimumTier)
          : null
      if (gpuInput.minimumTier != null && tier === null) {
        errors.push(`"gpu.minimumTier" must be one of: ${GPU_TIERS.join(', ')}.`)
      } else if (tier !== null || gpuInput.required === true) {
        requirements.gpu = {
          required: gpuInput.required !== false,
          minimumTier: tier,
          specificModel: asTrimmedString(
            input.gpuModel ?? gpuInput.specificModel,
          ),
          strict: gpuInput.strict === true,
        }
        mappedFieldCount += 1
      } else {
        errors.push('"gpu" needs a "minimumTier" or "required: true".')
      }
    } else {
      errors.push(
        '"gpu" must be a tier string or a { required, minimumTier, strict } object.',
      )
    }
  }

  /* OS: flat string or full-profile object (never inferred). ----------------- */
  const osInput = input.os
  if (osInput !== undefined && osInput !== null) {
    const preferredRaw =
      typeof osInput === 'object' ? osInput.preferred : osInput
    if (preferredRaw === undefined || preferredRaw === null) {
      errors.push('"os.preferred" is required when "os" is an object.')
    } else {
      const preferred = parseOs(preferredRaw)
      if (preferred === null) {
        errors.push(
          `"os" must be one of: ${OS_VALUES.join(', ')} (case-insensitive).`,
        )
      } else {
        requirements.os = {
          preferred,
          strict: typeof osInput === 'object' && osInput.strict === true,
        }
        mappedFieldCount += 1
      }
    }
  }

  /* Workloads / use cases -> profile useCases vocabulary. -------------------- */
  const rawUses = Array.isArray(input.workloads)
    ? input.workloads
    : Array.isArray(input.useCases)
      ? input.useCases
      : null
  if (rawUses !== null) {
    const useCases = []
    for (const raw of rawUses) {
      const mapped = USE_CASES.includes(raw) ? raw : mapWorkload(raw)
      if (mapped === null) {
        if (asTrimmedString(raw) !== null) {
          warnings.push(`Ignored unrecognized workload "${raw}".`)
        }
        continue
      }
      if (!useCases.includes(mapped)) useCases.push(mapped)
    }
    requirements.useCases = useCases
    if (input.workloads !== undefined) mappedFieldCount += 1
  }

  /* Optional preference passthroughs (light validation only). --------------- */
  const displayInput = input.display
  if (displayInput !== null && typeof displayInput === 'object') {
    const preference = asTrimmedString(displayInput.preference)
    if (preference !== null && DISPLAY_TIERS.includes(preference)) {
      requirements.display = { preference, strict: false }
    } else if (preference !== null) {
      warnings.push(`Ignored unrecognized display preference "${preference}".`)
    }
  }
  for (const field of ['portability', 'battery']) {
    const fieldInput = input[field]
    if (fieldInput !== null && typeof fieldInput === 'object') {
      const priority = asTrimmedString(fieldInput.priority)
      if (priority !== null) requirements[field] = { priority, strict: false }
    }
  }
  if (Array.isArray(input.software)) {
    requirements.software = input.software.filter(
      (item) => asTrimmedString(item) !== null,
    )
  }
  if (asTrimmedString(input.additionalRequirements) !== null) {
    requirements.additionalRequirements = asTrimmedString(
      input.additionalRequirements,
    )
  }

  if (errors.length > 0) {
    return { requirements: null, errors, warnings }
  }

  if (mappedFieldCount === 0) {
    return {
      requirements: null,
      errors: [
        'At least one requirement is required. Send fields such as: budget, ram, storage, gpu, os, workloads.',
      ],
      warnings,
    }
  }

  return { requirements, errors, warnings }
}





