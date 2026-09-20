/**
 * Results screen.
 *
 * Pipeline position:
 *   interview answers -> buildRequirements() -> getRecommendations()
 *   -> <ResultsView/> (this component)
 *
 * Renders EXACTLY what the recommendation engine returns - factual reasons,
 * compromises and conflicts only. It never claims "best laptop", "perfect
 * laptop" or "guaranteed performance". Exact matches render as before; when
 * feasibility finds no exact match, the engine's closest-match fallback is
 * rendered instead ("Closest matches" + the ACTUAL conflict diagnosis +
 * per-card compromise notes) - every alternative still states why it
 * differs. When nothing at all can be suggested, the conflicts are shown
 * together with a restart ("Change your requirements").
 */

import './ResultsView.css'

/** Interview use-case ids -> display labels (see laptopInterview.js). */
const USE_CASE_LABELS = {
  programming: 'Programming',
  gaming: 'Gaming',
  ai_ml: 'AI / ML',
  video_editing: 'Video Editing',
  college_office: 'College / Office',
}

const FIELD_LABELS = {
  ram: 'RAM',
  storage: 'Storage',
  gpu: 'GPU',
  display: 'Display',
  os: 'Operating system',
}

const formatPrice = (amount) =>
  `₹${new Intl.NumberFormat('en-IN').format(amount)}`
const formatGb = (gb) =>
  gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`
const capitalize = (word) =>
  typeof word === 'string' && word !== ''
    ? word.charAt(0).toUpperCase() + word.slice(1)
    : ''

/** Compact requirement summary chips, e.g. "₹80,000 budget · 16 GB RAM". */
function requirementChips(requirements) {
  if (requirements == null || typeof requirements !== 'object') return []
  const chips = []
  if (Number.isFinite(requirements.budget?.max)) {
    chips.push(`${formatPrice(requirements.budget.max)} budget`)
  }
  if (Number.isFinite(requirements.ram?.minimumGb)) {
    chips.push(`${formatGb(requirements.ram.minimumGb)} RAM`)
  }
  if (Number.isFinite(requirements.storage?.minimumGb)) {
    chips.push(`${formatGb(requirements.storage.minimumGb)} storage`)
  }
  if (requirements.gpu?.specificModel) {
    chips.push(`${requirements.gpu.specificModel} or better`)
  } else if (requirements.gpu?.minimumTier) {
    chips.push(`${capitalize(requirements.gpu.minimumTier)} GPU`)
  } else if (requirements.gpu?.required) {
    chips.push('Dedicated GPU')
  }
  if (requirements.display?.preference) {
    chips.push(`${capitalize(requirements.display.preference)} display`)
  }
  if (requirements.os?.preferred) {
    chips.push(capitalize(requirements.os.preferred))
  }
  for (const use of Array.isArray(requirements.useCases)
    ? requirements.useCases
    : []) {
    chips.push(USE_CASE_LABELS[use] ?? capitalize(use))
  }
  return chips
}

/** Short factual spec strings - only what the product data actually states. */
function gpuText(product) {
  if (typeof product.gpu.model === 'string' && product.gpu.model !== '') {
    return product.gpu.model
  }
  if (product.gpu.tier === 'integrated') return 'Integrated graphics'
  if (product.gpu.tier != null) return `${product.gpu.tier} GPU`
  return null
}

function displayText(product) {
  const parts = []
  if (typeof product.display.sizeInches === 'number') {
    parts.push(`${product.display.sizeInches}"`)
  }
  if (product.display.resolution != null) parts.push(product.display.resolution)
  if (typeof product.display.refreshRateHz === 'number') {
    parts.push(`${product.display.refreshRateHz}Hz`)
  }
  if (product.display.panel != null) parts.push(product.display.panel)
  return parts.length > 0 ? parts.join(' · ') : null
}

const cpuText = (product) =>
  [product.cpu.brand, product.cpu.model].filter(Boolean).join(' ') || null
const memoryText = (product, section) => {
  const capacity = product[section].capacityGb
  if (typeof capacity !== 'number') return null
  const type = product[section].type
  return type != null ? `${formatGb(capacity)} ${type}` : formatGb(capacity)
}

function LaptopCard({ recommendation }) {
  const product = recommendation.product
  const purchaseUrl =
    typeof product.source?.productUrl === 'string' &&
    product.source.productUrl.trim() !== ''
      ? product.source.productUrl
      : null

  const specs = [
    ['CPU', cpuText(product)],
    ['GPU', gpuText(product)],
    ['RAM', memoryText(product, 'ram')],
    ['Storage', memoryText(product, 'storage')],
    ['Display', displayText(product)],
  ]

  return (
    <article className="results-card">
      <div className="results-card__head">
        <div>
          <h3 className="results-card__name">
            {[product.brand, product.model].filter(Boolean).join(' ')}
          </h3>
          <p className="results-card__price">
            {typeof product.pricing.currentPrice === 'number'
              ? formatPrice(product.pricing.currentPrice)
              : 'Price not stated'}
          </p>
        </div>
        <span className="results-card__score" title="Preference match score">
          {recommendation.score} · {recommendation.matchLabel}
        </span>
      </div>

      <dl className="results-card__specs">
        {specs.map(([label, value]) => (
          <div key={label} className="results-card__spec">
            <dt>{label}</dt>
            <dd>{value ?? 'Not stated'}</dd>
          </div>
        ))}
      </dl>

      {recommendation.reasons.length > 0 && (
        <div className="results-card__section">
          <p className="results-card__section-title">Why this matches</p>
          <ul className="results-card__list">
            {recommendation.reasons.slice(0, 4).map((reason) => (
              <li key={reason} className="results-card__reason">
                ✓ {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendation.compromises.length > 0 && (
        <div className="results-card__section">
          <p className="results-card__section-title">Compromise</p>
          <ul className="results-card__list">
            {recommendation.compromises.map((compromise) => (
              <li key={compromise} className="results-card__compromise">
                ⚠ {compromise}
              </li>
            ))}
          </ul>
        </div>
      )}

      {purchaseUrl !== null ? (
        <a
          className="results-card__buy"
          href={purchaseUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View / Buy
        </a>
      ) : (
        <button type="button" className="results-card__buy" disabled>
          Link unavailable
        </button>
      )}
    </article>
  )
}

/**
 * Results screen. Pure presentation over the recommendation-engine output:
 * - feasible:  summary chips + one minimal card per recommendation
 * - closest:   "Closest matches" + the ACTUAL feasibility conflicts +
 *              per-card compromise notes (engine closest-match fallback)
 * - zero:      "No exact match found" + the ACTUAL feasibility conflicts
 *              + "Change your requirements" (restart - never auto-relaxing)
 * - error:     graceful fallback for invalid results / runtime failures
 *
 * @param {object}   props.result        - getRecommendations() output.
 * @param {object}   props.requirements  - normalized requirements profile.
 * @param {boolean}  props.hasError      - true when the pipeline failed.
 * @param {Function} props.onRestart     - full reset back to the interview.
 */
export default function ResultsView({ result, requirements, hasError, onRestart }) {
  const chips = requirementChips(requirements)
  const recommendations =
    result != null && Array.isArray(result.recommendations)
      ? result.recommendations
      : []
  const conflicts =
    result != null && Array.isArray(result.conflicts) ? result.conflicts : []

  /* Engine closest-match fallback: feasibility found NO exact match, but
     real alternatives exist (labelled 'closest match'). They render in the
     normal results layout, headed "Closest matches", with the conflict
     diagnosis kept visible. */
  const closestMatches =
    result != null &&
    result.feasible === false &&
    result.closestMatches === true &&
    recommendations.length > 0

  if (hasError || result == null || typeof result !== 'object') {
    return (
      <section className="results">
        <div className="results__empty">
          <h1>Something went wrong</h1>
          <p>
            We could not prepare your laptop matches. This is not a
            recommendation - please start over.
          </p>
          <button
            type="button"
            className="question-flow__button question-flow__button--primary"
            onClick={onRestart}
          >
            Start over
          </button>
        </div>
      </section>
    )
  }

  if (!result.feasible && !closestMatches) {
    return (
      <section className="results">
        <div className="results__empty">
          <h1>No exact match found</h1>
          {chips.length > 0 && (
            <ul className="results__chips">
              {chips.map((chip) => (
                <li key={chip} className="results__chip">
                  {chip}
                </li>
              ))}
            </ul>
          )}
          {conflicts.length > 0 ? (
            <div className="results__conflicts">
              <p className="results__conflicts-title">What conflicted:</p>
              <ul className="results__conflicts-list">
                {conflicts.map((conflict) => (
                  <li key={`${conflict.field}-${conflict.reason}`}>
                    {conflict.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>No laptop in the current catalog satisfies your requirements.</p>
          )}
          <p className="results__empty-note">
            Your requirements were not changed. Adjust them and search again.
          </p>
          <button
            type="button"
            className="question-flow__button question-flow__button--primary"
            onClick={onRestart}
          >
            Change your requirements
          </button>
        </div>
      </section>
    )
  }

  const unmetPreferences = Array.isArray(result.unmetPreferences)
    ? result.unmetPreferences
    : []

  if (recommendations.length === 0) {
    return (
      <section className="results">
        <div className="results__empty">
          <h1>No exact match found</h1>
          <p>No laptops could be scored for your requirements.</p>
          <button
            type="button"
            className="question-flow__button question-flow__button--primary"
            onClick={onRestart}
          >
            Change your requirements
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="results">
      <header className="results__header">
        <h1>{closestMatches ? 'Closest matches' : 'Your laptop matches'}</h1>
        {chips.length > 0 && (
          <ul className="results__chips" aria-label="Your requirements">
            {chips.map((chip) => (
              <li key={chip} className="results__chip">
                {chip}
              </li>
            ))}
          </ul>
        )}
        <p className="results__count">
          {closestMatches
            ? `No laptop meets every requirement. These ${
                recommendations.length === 1 ? 'is' : 'are'
              } the ${recommendations.length} closest ${
                recommendations.length === 1 ? 'laptop' : 'laptops'
              } in the catalog, ranked by how many of your requirements they satisfy.`
            : `${recommendations.length} ${
                recommendations.length === 1 ? 'laptop' : 'laptops'
              } match your requirements, ordered by match quality.`}
        </p>
        {closestMatches && conflicts.length > 0 && (
          <div className="results__conflicts">
            <p className="results__conflicts-title">What conflicted:</p>
            <ul className="results__conflicts-list">
              {conflicts.map((conflict) => (
                <li key={`${conflict.field}-${conflict.reason}`}>
                  {conflict.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {unmetPreferences.length > 0 && (
          <p className="results__unmet">
            Note:{' '}
            {unmetPreferences
              .map(
                (preference) =>
                  `${FIELD_LABELS[preference.field] ?? preference.field} preference (${preference.expected}) was not matched`,
              )
              .join('; ')}
            .
          </p>
        )}
      </header>

      <div className="results__grid">
        {recommendations.map((recommendation) => (
          <LaptopCard
            key={recommendation.product.id}
            recommendation={recommendation}
          />
        ))}
      </div>

      <div className="results__footer">
        <button
          type="button"
          className="question-flow__button"
          onClick={onRestart}
        >
          Start over
        </button>
      </div>
    </section>
  )
}