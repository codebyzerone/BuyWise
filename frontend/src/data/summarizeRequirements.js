/**
 * Plain-language summary of a Buyer Requirements Profile.
 *
 * Pipeline position:
 *   buildRequirements() -> PROFILE -> summarizeRequirements() -> interview
 *   completion screen ("Here's what we understood") -> getRecommendations()
 *
 * Presentation helper only: it reads the documented profile fields, never
 * invents data, and changes nothing the engines consume. Its job is to let a
 * first-time buyer check the interview's understanding before seeing laptops -
 * values the interview *suggested* are marked as suggestions.
 */

/** Display qualities, mirroring DISPLAY_TIERS (see productSchema.js). */
const DISPLAY_LABELS = {
  basic: 'Basic is fine',
  good: 'Good quality',
  'high-refresh': 'High refresh rate',
  oled: 'OLED / accurate colours',
}

/** Performance priorities, mirroring the interview's own wording. */
const PERFORMANCE_LABELS = {
  basic: 'Light use',
  balanced: 'Balanced',
  high: 'Demanding',
  maximum: 'Maximum',
}

/** Priority levels shared by portability and battery. */
const PRIORITY_LABELS = {
  'not-important': 'Not important',
  'somewhat-important': 'Nice to have',
  important: 'Important',
  'very-important': 'Very important',
}

/** GPU tiers (see GPU_TIERS in feasibility.js). */
const GPU_LABELS = {
  'entry-level': 'A basic dedicated GPU',
  'mid-range': 'A good mid-range GPU',
  'high-performance': 'A powerful GPU',
}

/** Operating systems (see OS_VALUES in productSchema.js). */
const OS_LABELS = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }

/** Main use cases as ResultsView.jsx labels them (frozen vocabulary). */
const USE_CASE_LABELS = {
  programming: 'Programming',
  gaming: 'Gaming',
  ai_ml: 'AI / ML',
  video_editing: 'Video editing / creative work',
  college_office: 'College / office',
}

const formatInr = (amount) => `₹${new Intl.NumberFormat('en-IN').format(amount)}`
const formatGb = (gb) =>
  gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`

/** "16 GB preferred" / "At least 32 GB - must have" style capacity text. */
function capacityText(section, addWord = null) {
  if (section == null || typeof section.minimumGb !== 'number') return null
  const minimum = section.minimumGb
  const preferred = section.preferredGb ?? minimum
  if (section.strict === true) return `At least ${formatGb(minimum)} - must have`
  const capacity =
    preferred > minimum
      ? `${formatGb(minimum)} (${formatGb(preferred)} preferred)`
      : formatGb(preferred)
  return addWord === null ? capacity : `${capacity} ${addWord}`
}

/** Graphics line text, from the stated model/tier or a dedicated-GPU flag. */
function graphicsText(gpu) {
  if (gpu == null) return null
  if (typeof gpu.specificModel === 'string' && gpu.specificModel !== '') {
    return `${gpu.specificModel} or better`
  }
  if (gpu.minimumTier != null) {
    return GPU_LABELS[gpu.minimumTier] ?? `${gpu.minimumTier} GPU or better`
  }
  return gpu.required ? 'A dedicated graphics card' : 'Built-in graphics is fine'
}

/**
 * @param {object} profile - normalized Buyer Requirements Profile.
 * @returns {Array<{key: string, label: string, value: string, note: string|null}>}
 *          Summary lines in reading order (empty array for invalid input).
 */
export function summarizeRequirements(profile) {
  if (profile == null || typeof profile !== 'object') return []

  /** Inference reasons, keyed by the field names buildRequirements records. */
  const suggestions = new Map(
    (Array.isArray(profile.derived) ? profile.derived : [])
      .filter((entry) => entry != null && typeof entry.field === 'string')
      .map((entry) => [entry.field, entry.reason]),
  )
  const suggested = (field) => {
    const reason = suggestions.get(field)
    return typeof reason === 'string' && reason !== ''
      ? `Suggested for ${reason}.`
      : null
  }

  const lines = []
  const add = (key, label, value, note = null) => {
    if (value === null || value === undefined || value === '') return
    lines.push({ key, label, value, note })
  }

  if (profile.budget != null && Number.isFinite(profile.budget.max)) {
    add(
      'budget',
      'Budget',
      formatInr(profile.budget.max),
      'Only laptops within this budget are shown.',
    )
  }

  const useCases = Array.isArray(profile.useCases) ? profile.useCases : []
  add(
    'useCases',
    'Main use',
    useCases.length > 0
      ? useCases.map((use) => USE_CASE_LABELS[use] ?? use).join(' + ')
      : null,
  )

  add(
    'performance',
    'Performance need',
    PERFORMANCE_LABELS[profile.performance?.priority] ?? null,
    suggested('performance'),
  )

  add(
    'ram',
    'Memory (RAM)',
    capacityText(profile.ram, 'preferred'),
    profile.ram?.strict === true
      ? 'You asked us to only show laptops that meet this.'
      : suggested('ram'),
  )

  add('storage', 'Storage', capacityText(profile.storage), suggested('storage'))

  add(
    'gpu',
    'Graphics',
    graphicsText(profile.gpu),
    profile.gpu?.strict === true
      ? 'You asked us to only show laptops that meet this.'
      : suggested('gpu'),
  )

  add(
    'display',
    'Display',
    DISPLAY_LABELS[profile.display?.preference] ?? null,
    suggested('display'),
  )

  add(
    'mobility',
    'Battery & portability',
    PRIORITY_LABELS[profile.portability?.priority] ?? null,
    suggested('portability & battery'),
  )

  add(
    'os',
    'Operating system',
    OS_LABELS[profile.os?.preferred] ?? null,
    profile.os?.strict === true
      ? 'You asked us to only show laptops that meet this.'
      : null,
  )

  if (profile.localAi != null && profile.localAi.required === true) {
    add(
      'localAi',
      'AI models',
      profile.localAi.modelSize === 'large'
        ? 'On the laptop - large models'
        : 'On the laptop - small or medium models',
    )
  }

  const software = Array.isArray(profile.software) ? profile.software : []
  add('software', 'Specific needs', software.join(', '))

  return lines
}