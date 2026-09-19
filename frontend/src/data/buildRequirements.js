/**
 * Converts raw interview answers into the normalized Buyer Requirements
 * Profile consumed by the downstream pipeline:
 *
 *   RAW ANSWERS -> NORMALIZED REQUIREMENTS -> FEASIBILITY -> SCORING
 *
 * Only questions that were actually asked (i.e. survived adaptive branching)
 * contribute to the profile; branch-skipped sections become `null` so
 * downstream consumers can tell "not asked" from "answered".
 *
 * STRICTNESS - hard requirement vs preference (see also HARD_CONSTRAINTS in
 * feasibility.js). The interview decides this explicitly, never implicitly:
 * - HARD (`strict: true`) is set ONLY for
 *   * the maximum budget (a stated maximum is a hard cap by definition), and
 *   * memory / graphics / operating system when the user answered the
 *     must-have question (`strictness`) with 'must-have'.
 *   Those are the only fields feasibility.js can enforce; storage has no hard
 *   constraint in the engine, so storage always stays a preference.
 * - Everything else is PREFERRED (`strict: false`): ordinary option choices
 *   and ALL inferred values. An inferred need is never promoted to a hard
 *   requirement.
 *
 * INTERVIEW -> PROFILE VOCABULARY
 * The interview offers richer use cases than the profile carries, because
 * ResultsView.jsx renders `useCases` from a fixed label map. They are mapped
 * onto that existing vocabulary here:
 *   college_everyday -> college_office     creative     -> video_editing
 *   professional     -> college_office     programming  -> programming
 *   gaming           -> gaming             ai_ml        -> ai_ml
 *   mixed            -> whichever workload the user named as most demanding
 * 'not-sure' style answers (not-sure, not_sure, not-needed, no-preference)
 * become null - an unknown stays unknown, never a guessed specification.
 *
 * CONSERVATIVE INFERENCE (preferences only, and only where the user did not
 * state the value themselves). Every rule exists because the chosen workload
 * genuinely needs it, and no rule invents a specific hardware model:
 *   heavy development (Android Studio / Docker / VMs / large projects)
 *       -> 16 GB memory and 512 GB storage wanted
 *   heavy gaming (AAA-style titles)      -> 16 GB, mid-range GPU preferred
 *   AI models running on the laptop      -> 16 GB (32 GB ideal for large
 *                                           models) and a dedicated GPU
 *   video editing / 3D / streaming       -> 16 GB, 512 GB-1 TB, good display
 *   college / everyday use on the move   -> portability & battery wanted
 * Inferred entries are listed in the profile's `derived` array so the
 * interview summary can present them as suggestions instead of implying the
 * user stated them.
 *
 * Deterministic text patterns only (no natural-language interpretation):
 * - "16GB upgradeable to 32 GB" -> ram.preferredGb = 32
 * - "RTX 4050 or better"        -> gpu.specificModel = "RTX 4050"
 * - comma/semicolon separated   -> software: string[]
 *
 * Example shape:
 * {
 *   category: 'laptop',
 *   budget: { max: 72000, strict: true },
 *   useCases: ['gaming', 'programming'],
 *   performance: { priority: 'high', strict: false },
 *   ram: { minimumGb: 16, preferredGb: 32, strict: false },
 *   storage: { minimumGb: 1024, preferredGb: 1024, strict: false },
 *   gpu: { required: true, minimumTier: 'mid-range',
 *          specificModel: 'RTX 4050', strict: false },
 *   localAi: null,
 *   portability: { priority: 'important', strict: false },
 *   battery: { priority: 'important', strict: false },
 *   display: { preference: 'good', strict: false },
 *   os: { preferred: 'windows', strict: false },
 *   software: ['VS Code', 'Docker'],
 *   additionalRequirements: '',
 *   derived: [{ field: 'ram', reason: 'Docker / containers' }],
 * }
 *
 * `derived` is informational only: feasibility.js and recommendations.js read
 * the documented requirement fields and ignore it entirely.
 */

import { GPU_TIERS } from '../engine/feasibility.js'
import { effectiveUses } from './laptopInterview.js'

/** Rupee budgets are five- or six-figure amounts; smaller numbers are prose. */
const MIN_PLAUSIBLE_BUDGET = 1000

/** e.g. "16GB upgradeable to 32 GB" -> 32 */
const UPGRADE_TARGET_PATTERN = /upgrad\w*\s+to\s+(\d+)\s*gb/i

/** e.g. "RTX 4050 or better" -> "RTX 4050" */
const GPU_MODEL_PATTERN = /\b(rtx|gtx)\s?(\d{4})\b/i

/** Selected storage ids mapped to gigabytes. */
const STORAGE_GB = { '256GB': 256, '512GB': 512, '1TB': 1024, '2TB+': 2048 }

/**
 * The stated budget maximum: the exact amount typed by the user wins, then the
 * selected option's `value`, then its numeric id, then - as a documented
 * fallback for a question-set mismatch - the answer's numeric id (the budget
 * question's option ids ARE the amounts, see laptopInterview.js). Returns NaN
 * when no plausible rupee amount can be read, so the caller leaves the budget
 * unknown instead of inventing one.
 */
function resolveBudget(option, answer) {
  const fromText = Number(String(answer?.customText ?? '').replace(/\D/g, ''))
  if (fromText >= MIN_PLAUSIBLE_BUDGET) return fromText
  if (option && typeof option.value === 'number') return option.value
  if (option && Number.isFinite(Number(option.id))) return Number(option.id)
  const fromId = Number(answer?.optionId)
  return Number.isFinite(fromId) && fromId >= MIN_PLAUSIBLE_BUDGET ? fromId : NaN
}

/** RAM/storage ids like "16GB" / "1TB" / "2TB+" -> gigabytes. */
function parseCapacityGb(id) {
  if (typeof STORAGE_GB[id] === 'number') return STORAGE_GB[id]
  const match = /^(\d+)gb$/i.exec(id ?? '')
  return match ? Number(match[1]) : null
}

/** "16GB upgradeable to 32 GB" -> 32, otherwise null. */
function parseUpgradeTargetGb(text) {
  const match = UPGRADE_TARGET_PATTERN.exec(text ?? '')
  return match ? Number(match[1]) : null
}

/** "RTX 4050 or better" -> "RTX 4050", otherwise null. */
function parseGpuModel(text) {
  const match = GPU_MODEL_PATTERN.exec(text ?? '')
  return match ? `${match[1].toUpperCase()} ${match[2]}` : null
}

/** "VS Code, Docker; GTA V" -> ['VS Code', 'Docker', 'GTA V'] */
function parseList(text) {
  return String(text ?? '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/** Interview-only answers that mean "you decide" - never a stated spec. */
const NOT_STATED_IDS = new Set([
  'not-sure',
  'not_sure',
  'not-needed',
  'no-preference',
])

/** True when the option id is a real answer (not an "unsure" placeholder). */
const isStated = (optionId) =>
  typeof optionId === 'string' && !NOT_STATED_IDS.has(optionId)

/**
 * Interview use-case ids -> the profile's `useCases` vocabulary. ResultsView.jsx
 * renders that vocabulary from its own fixed label map, so interview-only use
 * cases (creative, professional) are mapped onto the closest existing value;
 * 'mixed' is resolved to the workload the user named as most demanding.
 */
const USE_CASE_VOCABULARY = {
  college_everyday: 'college_office',
  professional: 'college_office',
  programming: 'programming',
  gaming: 'gaming',
  ai_ml: 'ai_ml',
  creative: 'video_editing',
}

/* ---------------------------------------------------------------------------
 * Conservative inference tables
 *
 * These translate the user's WORKLOAD answers into suggested requirement
 * values. They are deliberately coarse (capacities and GPU tiers, never
 * hardware models) and apply ONLY to sections the user left unknown - a stated
 * answer always wins. Every inferred value is a preference (strict: false).
 * ------------------------------------------------------------------------ */

/** Development workloads that mean "serious work on this machine". */
const HEAVY_DEV_WORKLOADS = [
  'android',
  'heavy_ides',
  'containers',
  'vms',
  'large_projects',
]

/** Creative workloads with large files and colour-critical output. */
const HEAVY_CREATIVE_WORKLOADS = ['video_editing', '3d_rendering', 'streaming']

/** AI workloads that are genuinely compute-heavy. */
const HEAVY_AI_WORKLOADS = ['deep_learning', 'computer_vision', 'nlp']

/** Gaming intensity -> the performance priority it implies. */
const PERFORMANCE_FROM_GAMING = {
  casual: 'basic',
  competitive: 'balanced',
  aaa: 'high',
  mixed: 'balanced',
}

const intersects = (ids, wanted) => wanted.some((id) => ids.includes(id))

/** True when the user plays heavy, demanding titles. */
const playsHeavyGames = (read) => read.optionId('gamingType') === 'aaa'

/** Largest of the suggested values (every suggestion is an "at least"). */
const largest = (suggestions, key) =>
  Math.max(...suggestions.map((suggestion) => suggestion[key]))

/** Joins the reasons of the winning suggestions into one plain sentence. */
const why = (suggestions) =>
  suggestions.map((suggestion) => suggestion.reason).join(', ')

/** Suggested memory (GB) - null when the workloads need nothing special. */
function inferMemory(read) {
  const suggestions = []
  if (read.optionId('localAi') === 'yes-large') {
    suggestions.push({
      minimumGb: 16,
      preferredGb: 32,
      reason: 'large AI models running on the laptop',
    })
  } else if (read.optionId('localAi') === 'yes-small') {
    suggestions.push({
      minimumGb: 16,
      preferredGb: 16,
      reason: 'AI models running on the laptop',
    })
  }
  if (playsHeavyGames(read)) {
    suggestions.push({ minimumGb: 16, preferredGb: 16, reason: 'heavy games' })
  }
  if (intersects(read.ids('programmingWorkload'), HEAVY_DEV_WORKLOADS)) {
    suggestions.push({
      minimumGb: 16,
      preferredGb: 16,
      reason: 'Android Studio, Docker, virtual machines or large projects',
    })
  }
  if (intersects(read.ids('aiWorkload'), HEAVY_AI_WORKLOADS)) {
    suggestions.push({
      minimumGb: 16,
      preferredGb: 16,
      reason: 'machine-learning work',
    })
  }
  if (intersects(read.ids('creativeWorkload'), HEAVY_CREATIVE_WORKLOADS)) {
    suggestions.push({ minimumGb: 16, preferredGb: 16, reason: 'video or 3D work' })
  }
  if (read.ids('professionalWorkload').includes('spreadsheets')) {
    suggestions.push({
      minimumGb: 16,
      preferredGb: 16,
      reason: 'large spreadsheets and data',
    })
  }
  if (suggestions.length === 0) return null
  return {
    minimumGb: largest(suggestions, 'minimumGb'),
    preferredGb: largest(suggestions, 'preferredGb'),
    reason: why(suggestions),
  }
}

/** Suggested storage (GB) - null when the workloads need nothing special. */
function inferStorage(read) {
  const suggestions = []
  if (read.optionId('localAi') === 'yes-large') {
    suggestions.push({
      minimumGb: 512,
      preferredGb: 1024,
      reason: 'large local AI models and datasets',
    })
  }
  if (playsHeavyGames(read)) {
    suggestions.push({
      minimumGb: 512,
      preferredGb: 1024,
      reason: 'large game libraries',
    })
  }
  if (intersects(read.ids('creativeWorkload'), HEAVY_CREATIVE_WORKLOADS)) {
    suggestions.push({
      minimumGb: 512,
      preferredGb: 1024,
      reason: 'video or 3D projects',
    })
  }
  if (intersects(read.ids('programmingWorkload'), HEAVY_DEV_WORKLOADS)) {
    suggestions.push({
      minimumGb: 512,
      preferredGb: 512,
      reason: 'development tools and project files',
    })
  }
  if (intersects(read.ids('creativeWorkload'), ['photo_editing', 'cad_design'])) {
    suggestions.push({
      minimumGb: 512,
      preferredGb: 512,
      reason: 'large media and design files',
    })
  }
  if (suggestions.length === 0) return null
  return {
    minimumGb: largest(suggestions, 'minimumGb'),
    preferredGb: largest(suggestions, 'preferredGb'),
    reason: why(suggestions),
  }
}

/**
 * Suggested GPU tier - null when a dedicated GPU would not help. Uses the
 * engine's ordered GPU_TIERS vocabulary; the strongest suggestion wins.
 */
function inferGpuTier(read) {
  const suggestions = []
  if (read.optionId('localAi') === 'yes-large') {
    suggestions.push({
      tier: 'mid-range',
      reason: 'large AI models running on the laptop',
    })
  } else if (read.optionId('localAi') === 'yes-small') {
    suggestions.push({
      tier: 'entry-level',
      reason: 'AI models running on the laptop',
    })
  }
  if (playsHeavyGames(read)) {
    suggestions.push({ tier: 'mid-range', reason: 'heavy games' })
  }
  if (intersects(read.ids('creativeWorkload'), ['video_editing', '3d_rendering'])) {
    suggestions.push({ tier: 'mid-range', reason: 'video or 3D work' })
  }
  if (suggestions.length === 0) return null
  const strongest = suggestions.reduce((best, suggestion) =>
    GPU_TIERS.indexOf(suggestion.tier) > GPU_TIERS.indexOf(best.tier)
      ? suggestion
      : best,
  )
  return { tier: strongest.tier, reason: why(suggestions) }
}

/** Suggested display tier - null when nothing points at a better panel. */
function inferDisplayTier(read) {
  if (intersects(read.ids('creativeWorkload'), ['video_editing', '3d_rendering'])) {
    return { tier: 'good', reason: 'video or 3D work' }
  }
  if (playsHeavyGames(read)) {
    return { tier: 'high-refresh', reason: 'heavy games' }
  }
  return null
}

/** Suggested portability / battery priority - null when nothing suggests it. */
function inferMobility(uses, read) {
  if (uses.includes('college_everyday')) {
    return { priority: 'important', reason: 'everyday use on the move' }
  }
  if (read.ids('professionalWorkload').includes('travel')) {
    return { priority: 'important', reason: 'frequent travel' }
  }
  return null
}

/** Suggested performance priority - null when no workload implies one. */
function inferPerformance(uses, read) {
  const gaming = PERFORMANCE_FROM_GAMING[read.optionId('gamingType')]
  if (uses.includes('gaming') && gaming !== undefined) {
    return { priority: gaming, reason: 'your gaming answer' }
  }
  if (read.optionId('localAi') === 'yes-large') {
    return { priority: 'high', reason: 'large AI models running on the laptop' }
  }
  const ai = read.ids('aiWorkload')
  if (intersects(ai, HEAVY_AI_WORKLOADS)) {
    return { priority: 'high', reason: 'heavy machine-learning work' }
  }
  if (ai.length > 0 && !ai.includes('not_sure')) {
    return { priority: 'balanced', reason: 'machine-learning work' }
  }
  const creative = read.ids('creativeWorkload')
  if (intersects(creative, HEAVY_CREATIVE_WORKLOADS)) {
    return { priority: 'high', reason: 'video or 3D work' }
  }
  if (creative.length > 0 && !creative.includes('not_sure')) {
    return { priority: 'balanced', reason: 'creative work' }
  }
  const dev = read.ids('programmingWorkload')
  if (intersects(dev, HEAVY_DEV_WORKLOADS)) {
    return {
      priority: 'high',
      reason: 'Android Studio, Docker, virtual machines or large projects',
    }
  }
  if (dev.length > 0 && !dev.includes('not_sure')) {
    return { priority: 'balanced', reason: 'software development' }
  }
  if (uses.includes('professional')) {
    return { priority: 'balanced', reason: 'professional work' }
  }
  return null
}

/**
 * Read-only accessors over the answers that survived branching. Everything
 * returns undefined / null for questions that were never asked.
 */
function createAnswerReader(answers, askedIds) {
  const answerFor = (id) => (askedIds.has(id) ? answers[id] : undefined)
  return {
    answerFor,
    optionId: (id) => answerFor(id)?.optionId ?? null,
    ids: (id) => {
      const answer = answerFor(id)
      return answer?.optionIds ?? (answer?.optionId ? [answer.optionId] : [])
    },
    text: (id) => answerFor(id)?.customText ?? '',
  }
}

/**
 * @param {object}   answers          - Answers map owned by QuestionFlow.
 * @param {object[]} askedQuestions   - The questions actually shown (i.e. the
 *                                      adaptive visible list at finish time).
 * @returns {object} Normalized Buyer Requirements Profile (see file header).
 */
export function buildRequirements(answers, askedQuestions) {
  const askedIds = new Set(askedQuestions.map((question) => question.id))
  const read = createAnswerReader(answers, askedIds)

  /** Records an inferred section in the profile's informational `derived`. */
  const derived = []
  const inferred = (field, suggestion) => {
    if (suggestion !== null) derived.push({ field, reason: suggestion.reason })
    return suggestion
  }

  const selectedOptionFor = (id) => {
    const answer = read.answerFor(id)
    if (!answer) return undefined
    return askedQuestions
      .find((question) => question.id === id)
      ?.options.find((option) => option.id === answer.optionId)
  }

  /* Identity ------------------------------------------------------------- */
  const interviewUses = effectiveUses(answers)
  const useCases = [
    ...new Set(
      interviewUses.map((use) => USE_CASE_VOCABULARY[use]).filter(Boolean),
    ),
  ]

  /* Budget (always the user's hard maximum) ------------------------------- */
  const budgetMax = resolveBudget(
    selectedOptionFor('budget'),
    read.answerFor('budget'),
  )
  const budget = Number.isFinite(budgetMax)
    ? { max: budgetMax, strict: true }
    : null

  /* The user's explicit "these choices are must-haves" switch -------------- */
  const mustHave = read.optionId('strictness') === 'must-have'
  /**
   * STRICTNESS INVARIANT:
   * A field may carry strict:true ONLY from an explicit supported MUST-HAVE
   * answer. Nothing inferred, nothing ordinary, nothing "not-sure" ever becomes
   * a hard requirement. Currently the only fields that can be hard are ram / gpu
   * / os when the user answered the must-have question with 'must-have'; if the
   * engine ever gains another hard constraint field, add it here rather than
   * scattering `mustHave` through the field's branch.
   */
  const HARD_FROM_MUST_HAVE = new Set(['ram', 'gpu', 'os'])
  const isHard = (field) => HARD_FROM_MUST_HAVE.has(field) && mustHave


  /* Performance ----------------------------------------------------------- */
  const performanceOption = selectedOptionFor('performancePriority')
  let performancePriority =
    performanceOption && isStated(performanceOption.id)
      ? performanceOption.id
      : null
  if (performancePriority === null) {
    performancePriority =
      inferred('performance', inferPerformance(interviewUses, read))?.priority ??
      null
  }
  const performance =
    performancePriority !== null
      ? { priority: performancePriority, strict: false }
      : null

  /* RAM ------------------------------------------------------------------- */
  const ramOption = selectedOptionFor('ram')
  const ramStatedGb = ramOption ? parseCapacityGb(ramOption.id) : null
  const ramUpgradeGb = ramOption ? parseUpgradeTargetGb(read.text('ram')) : null
  let ram = null
  if (ramStatedGb !== null) {
    ram = {
      minimumGb: ramStatedGb,
      preferredGb: Math.max(ramStatedGb, ramUpgradeGb ?? ramStatedGb),
      strict: isHard('ram'),
    }
  } else {
    const suggestion = inferred('ram', inferMemory(read))
    if (suggestion !== null) {
      ram = {
        minimumGb: suggestion.minimumGb,
        preferredGb: suggestion.preferredGb,
        strict: false,
      }
    }
  }

  /* Storage (never a hard requirement - the engine has no hard storage
     constraint, so a must-have answer still stays a preference) ------------- */
  const storageOption = selectedOptionFor('storage')
  const storageStatedGb = storageOption ? parseCapacityGb(storageOption.id) : null
  let storage = null
  if (storageStatedGb !== null) {
    storage = {
      minimumGb: storageStatedGb,
      preferredGb: storageStatedGb,
      strict: false,
    }
  } else {
    const suggestion = inferred('storage', inferStorage(read))
    if (suggestion !== null) {
      storage = {
        minimumGb: suggestion.minimumGb,
        preferredGb: suggestion.preferredGb,
        strict: false,
      }
    }
  }

  /* GPU ------------------------------------------------------------------- */
  const gpuOption = selectedOptionFor('gpu')
  const gpuStated = gpuOption ? gpuOption.id : null
  let gpu = null
  if (gpuStated === 'not-needed') {
    // The user explicitly needs no dedicated GPU: no preference to score.
    gpu = null
  } else if (gpuStated !== null && isStated(gpuStated)) {
    gpu = {
      required: true,
      minimumTier: gpuStated,
      specificModel: parseGpuModel(read.text('gpu')),
      strict: isHard('gpu'),
    }
  } else {
    const suggestion = inferred('gpu', inferGpuTier(read))
    if (suggestion !== null) {
      gpu = {
        required: true,
        minimumTier: suggestion.tier,
        specificModel: null,
        strict: false,
      }
    }
  }

  /** Option id of a priority question when it was actually answered. */
  const statedPriority = (id) => {
    const option = selectedOptionFor(id)
    return option && isStated(option.id) ? option.id : null
  }

  /* Local AI -------------------------------------------------------------- */
  const localAiOption = selectedOptionFor('localAi')
  const localAi =
    localAiOption && isStated(localAiOption.id)
      ? {
          required:
            localAiOption.id === 'yes-large' || localAiOption.id === 'yes-small',
          modelSize:
            localAiOption.id === 'yes-large'
              ? 'large'
              : localAiOption.id === 'yes-small'
                ? 'small-medium'
                : null,
          strict: false,
        }
      : null

  /* Portability & battery (asked together as `mobility`) -------------------- */
  const statedMobility = statedPriority('mobility')
  const statedPortability = statedPriority('portability')
  const statedBattery = statedPriority('battery')
  let mobilitySuggestion = null
  if (
    statedMobility === null &&
    statedPortability === null &&
    statedBattery === null
  ) {
    mobilitySuggestion = inferred(
      'portability & battery',
      inferMobility(interviewUses, read),
    )
  }
  const portabilityPriority =
    statedMobility ?? statedPortability ?? mobilitySuggestion?.priority ?? null
  const batteryPriority =
    statedMobility ?? statedBattery ?? mobilitySuggestion?.priority ?? null
  const portability =
    portabilityPriority !== null
      ? { priority: portabilityPriority, strict: false }
      : null
  const battery =
    batteryPriority !== null ? { priority: batteryPriority, strict: false } : null

  /* Display ---------------------------------------------------------------- */
  const displayOption = selectedOptionFor('display')
  let displayPreference =
    displayOption && isStated(displayOption.id) ? displayOption.id : null
  if (displayPreference === null) {
    displayPreference = inferred('display', inferDisplayTier(read))?.tier ?? null
  }
  const display =
    displayPreference !== null
      ? { preference: displayPreference, strict: false }
      : null

  /* OS (never inferred - "no preference" stays unknown) --------------------- */
  const osOption = selectedOptionFor('os')
  const osPreferred =
    osOption && osOption.id !== 'no-preference' ? osOption.id : null
  const os =
    osPreferred !== null ? { preferred: osPreferred, strict: isHard('os') } : null

  return {
    category: 'laptop',
    budget,
    useCases,
    performance,
    ram,
    storage,
    gpu,
    localAi,
    portability,
    battery,
    display,
    os,
    software: parseList(read.text('software')),
    additionalRequirements: read.text('additional').trim(),
    /** Suggested values - informational only, see the file header. */
    derived,
  }
}