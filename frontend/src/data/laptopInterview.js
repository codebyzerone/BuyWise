/**
 * BuyWise laptop-buying interview - question configuration.
 *
 * Single source of truth for the interview content AND its branching rules.
 * The flow engine (src/components/QuestionFlow.jsx) only understands the
 * schema below, so questions or rules can be added without touching any
 * component.
 *
 * Question schema:
 * {
 *   id: string     - Stable unique key; also the key used in the answers map.
 *   prompt: string - Question shown to the user, written for first-time buyers.
 *   summaryLabel?: string
 *                  - Short plain-language label for the completion screen's
 *                    requirement summary (e.g. 'Budget'). Presentational only.
 *   selectionType?: 'single' | 'multiple'
 *                  - How many options the user may pick. Defaults to
 *                    'single'. 'multiple' questions render checkboxes, show
 *                    a "Select all that apply" hint, and store `optionIds`.
 *   options: Array<{ id: string, label: string, value?: unknown }>
 *                  - Predefined options. `id` doubles as the machine-readable
 *                    answer value and MUST stay inside the engine vocabularies
 *                    listed below wherever one applies; `value` optionally
 *                    carries a payload (e.g. the numeric budget).
 *   textInput?: {  - Optional free-text field rendered below the options.
 *     label: string
 *     placeholder: string
 *     multiline?: boolean      - Textarea instead of single-line input.
 *     rows?: number            - Textarea height (default 4).
 *     showForOptionId?: string - Only render while this option is selected.
 *   }
 *   optional?: boolean - Next stays enabled even when nothing is entered
 *                        (used by text-first questions with empty options).
 *   isRelevant?: (answers) => boolean
 *                  - Adaptive branching predicate. The question is only shown
 *                    when the predicate passes; questions without one always
 *                    apply. Add new rules here - no engine changes required.
 * }
 *
 * ENGINE VOCABULARIES - these option ids are compared against product data by
 * feasibility.js / recommendations.js and must never be renamed:
 *   budget      numeric option ids + `value` (typed digits win, see
 *               buildRequirements.js)
 *   performance basic | balanced | high | maximum
 *   ram         8GB | 16GB | 32GB
 *   storage     256GB | 512GB | 1TB | 2TB+
 *   gpu         entry-level | mid-range | high-performance  (GPU_TIERS)
 *   display     basic | good | high-refresh | oled           (DISPLAY_TIERS)
 *   os          windows | macos | linux
 *   mobility    not-important | somewhat-important | important | very-important
 *               (answered once, applied to BOTH portability and battery;
 *                its label for 'somewhat-important' is "Nice to have")
 *   localAi     yes-large | yes-small | no-cloud
 * 'not-sure' style answers (not-sure, not_sure, not-needed, no-preference) are
 * interview-only: they translate to "unknown" (null) in the requirements
 * profile - never to a guessed specification.
 *
 * Answers map shape (owned by QuestionFlow):
 *   single-select: { optionId: string | null, customText: string }
 *   multi-select:  { optionIds: string[], customText: string }
 */

/** Any answer shape -> the selected option ids. */
const selectedIdsOf = (answer) =>
  answer?.optionIds ?? (answer?.optionId ? [answer.optionId] : [])

/** Selected primary-use ids ('mixed' means "several of these"). */
const selectedPrimaryUse = (answers) => selectedIdsOf(answers.primaryUse)

/**
 * Interview use cases with their relative demand (routing only - the
 * requirements profile maps these onto the engine vocabulary in
 * buildRequirements.js, because ResultsView.jsx renders that vocabulary).
 */
const DEMANDING_USE_CASES = ['programming', 'gaming', 'ai_ml', 'creative']

/**
 * The use cases that actually drive this interview: the selected primary uses,
 * with 'mixed' replaced by the workload the user named as most demanding.
 * Empty until a mixed-use user has answered that follow-up, which keeps the
 * workload questions hidden until the routing answer exists.
 */
export const effectiveUses = (answers) => {
  const primary = selectedPrimaryUse(answers)
  const uses = primary.filter((use) => use !== 'mixed')
  const heaviest = answers.mixedUseHeaviest?.optionId
  if (primary.includes('mixed') && heaviest !== undefined) uses.push(heaviest)
  return uses
}

/** True when ANY effective use case is one of `wanted`. */
const usesAny = (answers, ...wanted) =>
  wanted.some((use) => effectiveUses(answers).includes(use))

/** College / professional only: no demanding workload was selected. */
const isLightUseOnly = (answers) => {
  const uses = effectiveUses(answers)
  return uses.length > 0 && uses.every((use) => !DEMANDING_USE_CASES.includes(use))
}

/** True when the user chose a high or maximum performance priority. */
const wantsHighPerformance = (answers) =>
  ['high', 'maximum'].includes(answers.performancePriority?.optionId)

/** Interview-only answers that mean "you decide" - never a stated spec. */
const NOT_STATED_IDS = new Set([
  'not-sure',
  'not_sure',
  'not-needed',
  'no-preference',
])

/**
 * True when the user stated at least one spec the feasibility engine can
 * enforce (memory, graphics, operating system - see HARD_CONSTRAINTS in
 * feasibility.js). Drives the optional must-have question; storage is excluded
 * because no hard storage constraint exists in the engine.
 */
const hasStatedSpec = (answers) =>
  ['ram', 'gpu', 'os'].some((id) => {
    const optionId = answers[id]?.optionId
    return typeof optionId === 'string' && !NOT_STATED_IDS.has(optionId)
  })

/** Mixed use: which of the picked uses is the most demanding one. */
const mixedUseIsRelevant = (answers) => selectedPrimaryUse(answers).includes('mixed')

/** Workload questions that already state their own intensity. */
const SELF_RATED_USE_CASES = ['gaming', 'ai_ml', 'creative']

/**
 * Performance is asked directly only when no workload question already states
 * the intensity: gaming (gamingType), AI (aiWorkload) and creative work
 * (creativeWorkload) rate themselves, and college / everyday needs no
 * performance answer at all. How those answers become performance priorities is
 * documented in buildRequirements.js.
 */
const performanceIsRelevant = (answers) => {
  const uses = effectiveUses(answers)
  if (uses.some((use) => SELF_RATED_USE_CASES.includes(use))) return false
  return uses.some((use) => use === 'programming' || use === 'professional')
}

const programmingWorkloadIsRelevant = (answers) => usesAny(answers, 'programming')
const gamingTypeIsRelevant = (answers) => usesAny(answers, 'gaming')
const aiApproachIsRelevant = (answers) => usesAny(answers, 'ai_ml')
const creativeWorkloadIsRelevant = (answers) => usesAny(answers, 'creative')
const professionalWorkloadIsRelevant = (answers) =>
  isLightUseOnly(answers) && usesAny(answers, 'professional')
const collegePriorityIsRelevant = (answers) =>
  isLightUseOnly(answers) && usesAny(answers, 'college_everyday')

/**
 * A dedicated GPU is only worth asking about when the workload can use one:
 * gaming / AI / creative always, programming only when the user also asked for
 * high performance. College / office alone never sees this question.
 */
const gpuIsRelevant = (answers) =>
  usesAny(answers, 'gaming', 'ai_ml', 'creative') ||
  (usesAny(answers, 'programming') && wantsHighPerformance(answers))

/** Display quality matters for creative work, for heavier gaming, and when a
 *  college / everyday user said a bigger, better screen matters most. */
const displayIsRelevant = (answers) =>
  usesAny(answers, 'creative') ||
  ['aaa', 'competitive', 'mixed'].includes(answers.gamingType?.optionId) ||
  (usesAny(answers, 'college_everyday') &&
    answers.collegePriority?.optionId === 'big_screen')

/** Must-have vs closest-match is only meaningful once a spec was stated. */
const strictnessIsRelevant = (answers) => hasStatedSpec(answers)

export const laptopInterviewQuestions = [
  {
    id: 'primaryUse',
    summaryLabel: 'Main use',
    prompt: 'What will you mainly use your laptop for?',
    selectionType: 'multiple',
    options: [
      { id: 'college_everyday', label: 'College / everyday' },
      { id: 'programming', label: 'Programming / development' },
      { id: 'gaming', label: 'Gaming' },
      { id: 'ai_ml', label: 'AI / machine learning' },
      { id: 'creative', label: 'Creative work (video, photo, 3D, CAD)' },
      { id: 'professional', label: 'Professional work (office, business)' },
      { id: 'mixed', label: 'Mixed use - several of these' },
    ],
    textInput: {
      label: 'Anything specific about how you use it? (optional)',
      placeholder: 'e.g. full-stack web development plus light photo editing',
    },
  },
  {
    id: 'mixedUseHeaviest',
    summaryLabel: 'Most demanding task',
    prompt:
      'You picked several uses - which one will be the most demanding task?',
    isRelevant: mixedUseIsRelevant,
    options: [
      { id: 'college_everyday', label: 'Everyday browsing, documents and calls' },
      { id: 'professional', label: 'Office / business work' },
      { id: 'programming', label: 'Programming / development' },
      { id: 'creative', label: 'Creative work (video, photo, 3D, CAD)' },
      { id: 'gaming', label: 'Gaming' },
      { id: 'ai_ml', label: 'AI / machine learning' },
    ],
  },
  {
    id: 'budget',
    summaryLabel: 'Budget',
    prompt: 'What is the most you want to spend?',
    options: [
      { id: '50000', label: 'Under ₹50,000', value: 50000 },
      { id: '70000', label: '₹50,000 - ₹70,000', value: 70000 },
      { id: '90000', label: '₹70,000 - ₹90,000', value: 90000 },
      { id: '120000', label: '₹90,000 - ₹1,20,000', value: 120000 },
      { id: '150000', label: '₹1,20,000 or more', value: 150000 },
    ],
    textInput: {
      label: 'Or type your exact maximum budget. (optional)',
      placeholder: 'e.g. ₹72,000',
    },
  },
  {
    id: 'programmingWorkload',
    summaryLabel: 'Development work',
    prompt: 'What kind of development work will you do?',
    selectionType: 'multiple',
    isRelevant: programmingWorkloadIsRelevant,
    options: [
      { id: 'general', label: 'General coding and scripts' },
      { id: 'web', label: 'Web / app development' },
      { id: 'android', label: 'Android / mobile development (Android Studio)' },
      { id: 'heavy_ides', label: 'Heavy IDEs and large codebases' },
      { id: 'containers', label: 'Docker / containers' },
      { id: 'vms', label: 'Virtual machines' },
      { id: 'large_projects', label: 'Many things running at once' },
      { id: 'not_sure', label: 'Not sure yet' },
    ],
  },
  {
    id: 'gamingType',
    summaryLabel: 'Gaming',
    prompt: 'What kind of gaming do you do?',
    isRelevant: gamingTypeIsRelevant,
    options: [
      { id: 'casual', label: 'Casual - older or lighter games' },
      { id: 'competitive', label: 'Competitive / esports (Valorant, CS2, BGMI)' },
      { id: 'aaa', label: 'Heavy titles (GTA V, Cyberpunk 2077, Elden Ring)' },
      { id: 'mixed', label: 'A mix of these' },
      { id: 'not-sure', label: 'Not sure' },
    ],
    textInput: {
      label: 'Which games do you play? (optional)',
      placeholder: 'e.g. Valorant, GTA V, FIFA',
    },
  },
  {
    id: 'localAi',
    summaryLabel: 'AI models',
    prompt:
      'Will you run AI models on the laptop itself, or use online AI tools?',
    isRelevant: aiApproachIsRelevant,
    options: [
      {
        id: 'yes-large',
        label: 'On the laptop - large models (image generation, big language models)',
      },
      { id: 'yes-small', label: 'On the laptop - small or medium models' },
      { id: 'no-cloud', label: 'Online AI tools are enough' },
      { id: 'not-sure', label: 'Not sure yet' },
    ],
    textInput: {
      label: 'Which models, roughly? (optional)',
      placeholder: 'e.g. Stable Diffusion, Llama 3',
    },
  },

  {
    id: 'aiWorkload',
    summaryLabel: 'AI work',
    prompt: 'What kind of AI / machine-learning work is it?',
    selectionType: 'multiple',
    isRelevant: aiApproachIsRelevant,
    options: [
      { id: 'learning', label: 'Learning AI / ML' },
      { id: 'machine_learning', label: 'Machine-learning projects' },
      { id: 'deep_learning', label: 'Deep learning / neural networks' },
      { id: 'data_science', label: 'Data science and notebooks' },
      { id: 'computer_vision', label: 'Computer vision / image work' },
      { id: 'nlp', label: 'Language models / NLP' },
      { id: 'not_sure', label: 'Not sure yet' },
    ],
  },
  {
    id: 'creativeWorkload',
    summaryLabel: 'Creative work',
    prompt: 'What kind of creative work is it?',
    selectionType: 'multiple',
    isRelevant: creativeWorkloadIsRelevant,
    options: [
      { id: 'video_editing', label: 'Video editing' },
      { id: 'photo_editing', label: 'Photo editing' },
      { id: '3d_rendering', label: '3D modelling / rendering' },
      { id: 'cad_design', label: 'CAD / design work' },
      { id: 'streaming', label: 'Streaming / recording' },
      { id: 'not_sure', label: 'Not sure yet' },
    ],
  },
  {
    id: 'collegePriority',
    summaryLabel: 'What matters day to day',
    prompt: 'What matters most for your everyday laptop?',
    isRelevant: collegePriorityIsRelevant,
    options: [
      { id: 'portability', label: 'Easy to carry, with long battery life' },
      { id: 'big_screen', label: 'A bigger, better screen' },
      { id: 'storage', label: 'Plenty of space for files and media' },
      { id: 'value', label: 'Best all-round value for the money' },
      { id: 'not-sure', label: 'Not sure' },
    ],
  },
  {
    id: 'professionalWorkload',
    summaryLabel: 'Work involves',
    prompt: 'What will your work involve?',
    selectionType: 'multiple',
    isRelevant: professionalWorkloadIsRelevant,
    options: [
      { id: 'office', label: 'Documents, email and presentations' },
      { id: 'spreadsheets', label: 'Large spreadsheets / data' },
      { id: 'calls', label: 'Lots of video calls' },
      { id: 'travel', label: 'Frequent travel' },
      { id: 'business_tools', label: 'Business or accounting software' },
      { id: 'not_sure', label: 'Not sure yet' },
    ],
  },
  {
    id: 'performancePriority',
    summaryLabel: 'Performance need',
    prompt: 'How demanding are the tasks you will run?',
    isRelevant: performanceIsRelevant,
    options: [
      { id: 'basic', label: 'Light - browsing, documents, streaming' },
      { id: 'balanced', label: 'Balanced - everyday work plus some heavier tasks' },
      { id: 'high', label: 'Demanding - big projects and heavy tools' },
      { id: 'maximum', label: 'Maximum - the heaviest workloads I can afford' },
      { id: 'not-sure', label: 'Not sure' },
    ],
  },
  {
    id: 'ram',
    summaryLabel: 'Memory (RAM)',
    prompt: 'How much memory (RAM) do you think you need?',
    options: [
      { id: '8GB', label: '8 GB - light use (browsing, documents)' },
      { id: '16GB', label: '16 GB - recommended for most people' },
      { id: '32GB', label: '32 GB - heavy multitasking, virtual machines or AI' },
      { id: 'not-sure', label: 'Not sure - pick for me' },
    ],
    textInput: {
      label: 'Know an exact figure? (optional)',
      placeholder: 'e.g. 16 GB, upgradeable to 32 GB',
    },
  },
  {
    id: 'storage',
    summaryLabel: 'Storage',
    prompt: 'How much storage do you need?',
    options: [
      { id: '256GB', label: '256 GB - light use, files mostly online' },
      { id: '512GB', label: '512 GB - recommended for most people' },
      { id: '1TB', label: '1 TB - lots of games, videos or projects' },
      { id: '2TB+', label: '2 TB or more - very large libraries' },
      { id: 'not-sure', label: 'Not sure - pick for me' },
    ],
    textInput: {
      label: 'Any specific storage requirement? (optional)',
      placeholder: 'e.g. 512 GB SSD plus a 1 TB HDD',
    },
  },
  {
    id: 'gpu',
    summaryLabel: 'Graphics',
    prompt: 'Do you need a dedicated graphics card (GPU)?',
    isRelevant: gpuIsRelevant,
    options: [
      { id: 'not-needed', label: 'No - built-in graphics is enough' },
      { id: 'entry-level', label: 'Yes - a basic dedicated GPU is enough' },
      { id: 'mid-range', label: 'Yes - a good mid-range GPU' },
      { id: 'high-performance', label: 'Yes - a powerful GPU' },
      { id: 'not-sure', label: 'Not sure - choose for me' },
    ],
    textInput: {
      label: 'A specific graphics card in mind? (optional)',
      placeholder: 'e.g. RTX 4050 or better',
    },
  },
  {
    id: 'strictness',
    summaryLabel: 'Spec choices',
    prompt: 'Should we only show laptops that match these choices?',
    isRelevant: strictnessIsRelevant,
    options: [
      { id: 'preferences', label: 'No - show me the closest matches (recommended)' },
      {
        id: 'must-have',
        label:
          'Yes - only laptops that meet my memory, graphics and operating-system choices',
      },
      { id: 'not-sure', label: 'Not sure' },
    ],
  },
  {
    id: 'mobility',
    summaryLabel: 'Battery & portability',
    prompt: 'How important are long battery life and easy carrying?',
    options: [
      { id: 'not-important', label: 'Not important - it mostly stays on a desk' },
      { id: 'somewhat-important', label: 'Nice to have' },
      { id: 'important', label: 'Important - I move around a lot' },
      { id: 'very-important', label: 'Very important - I carry it every day' },
      { id: 'not-sure', label: 'Not sure' },
    ],
  },
  {
    id: 'display',
    summaryLabel: 'Display',
    prompt: 'What kind of screen do you want?',
    isRelevant: displayIsRelevant,
    options: [
      { id: 'basic', label: 'Basic is fine' },
      { id: 'good', label: 'Good quality - sharp and comfortable' },
      { id: 'high-refresh', label: 'High refresh rate - smoother gaming' },
      { id: 'oled', label: 'OLED / accurate colours - best for creative work' },
      { id: 'not-sure', label: 'Not sure' },
    ],
    textInput: {
      label: 'Any specific display requirement? (optional)',
      placeholder: 'e.g. 15.6-inch OLED with 100% DCI-P3',
    },
  },
  {
    id: 'os',
    summaryLabel: 'Operating system',
    prompt: 'Which operating system do you want?',
    options: [
      { id: 'windows', label: 'Windows - most apps and games' },
      { id: 'macos', label: 'macOS - Apple laptops' },
      { id: 'linux', label: 'Linux' },
      { id: 'no-preference', label: 'No preference / not sure' },
    ],
  },
  {
    id: 'software',
    summaryLabel: 'Specific needs',
    prompt: 'Anything specific your laptop must handle?',
    options: [],
    optional: true,
    textInput: {
      label:
        'List the apps, games, tools or requirements that matter (optional).',
      placeholder:
        'e.g. Android Studio, Docker, Valorant and GTA V, need 1 TB storage',
      multiline: true,
      rows: 3,
    },
  },
]