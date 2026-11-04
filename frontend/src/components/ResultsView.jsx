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
import { useState } from 'react'
import { summarizeRequirements } from '../data/summarizeRequirements.js'

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

/** Computed match score per ₹10,000 of price: score ÷ price × 10000.
 * Only when both price and score are known and price > 0. Returns null
 * when price or score is unknown/zero so no ratio is fabricated. */
function valueForMoney(score, price) {
  if (typeof score !== 'number' || typeof price !== 'number' || price <= 0) return null
  return Math.round((score / price) * 10000 * 10) / 10
}

/** Check if a price date is stale (older than 90 days or missing). */
function priceStalenessWarning(checkedAt) {
  if (checkedAt == null) return 'Price check date not stated'
  const checkedDate = new Date(checkedAt)
  const now = new Date()
  const diffDays = Math.floor((now - checkedDate) / (1000 * 60 * 60 * 24))
  if (diffDays > 90) return `Price last checked: ${formatDate(checkedAt)} (${diffDays} days ago)`
  return null
}

/** Format a checkedAt date into a readable string. */
function formatDate(isoString) {
  const date = new Date(isoString)
  return `${date.getDate()} ${date.toLocaleMonthString()} ${date.getFullYear()}`
}

/** Factual spec line for comparison tables - only what product data states. */
function specText(product, field) {
  switch (field) {
    case 'price':
      return typeof product.pricing?.currentPrice === 'number'
        ? formatPrice(product.pricing.currentPrice)
        : 'Price not stated'
    case 'cpu':
      return typeof product.cpu.model === 'string' && product.cpu.model !== ''
        ? product.cpu.model
        : 'CPU not stated'
    case 'gpu':
      if (typeof product.gpu.model === 'string' && product.gpu.model !== '') return product.gpu.model
      if (product.gpu.tier === 'integrated') return 'Integrated graphics'
      if (product.gpu.tier != null) return `${product.gpu.tier} GPU`
      return 'GPU not stated'
    case 'ram':
      return typeof product.ram?.capacityGb === 'number'
        ? formatGb(product.ram.capacityGb)
        : 'RAM not stated'
    case 'storage':
      return typeof product.storage?.capacityGb === 'number'
        ? formatGb(product.storage.capacityGb)
        : 'Storage not stated'
    case 'display':
      if (product.display?.tier != null) return product.display.tier
      const parts = []
      if (typeof product.display?.sizeInches === 'number') parts.push(`${product.display.sizeInches}"`)
      if (product.display?.resolution != null) parts.push(product.display.resolution)
      if (typeof product.display?.refreshRateHz === 'number') parts.push(`${product.display.refreshRateHz} Hz`)
      return parts.length > 0 ? parts.join(' · ') : 'Display not stated'
    case 'weight':
      return typeof product.physical?.weightKg === 'number'
        ? `${product.physical.weightKg} kg`
        : 'Weight not stated'
    case 'battery':
      return typeof product.battery?.capacityWh === 'number'
        ? `${product.battery.capacityWh} Wh`
        : 'Battery not stated'
    default:
      return 'Not stated'
  }
}

/** Highest factual value in a column for "best" highlighting.
 * 'cheapest' = lowest price; 'most' = highest numeric; null when none known. */
function bestInColumn(rows, field, direction) {
  const known = rows.filter((r) => {
    const v = specText(r.product, field)
    return v !== 'Not stated' && v !== 'Price not stated'
  })
  if (known.length === 0) return null
  return known.reduce((best, row) => {
    const v = parseFloat(specText(row.product, field).replace(/[^\d.-]/g, ''))
    if (isNaN(v)) return best
    if (direction === 'cheapest') return v < best.value ? { value: v, product: row.product } : best
    return v > best.value ? { value: v, product: row.product } : best
  }, { value: -Infinity, product: null })
}

/** Encode a requirements profile into URL query string. No compression needed
 * for the small profile object; JSON + encodeURIComponent is safe and readable. */
export function encodeProfileUrl(profile) {
  if (profile == null || typeof profile !== 'object') return ''
  return encodeURIComponent(JSON.stringify(profile))
}

/** Decode a requirements profile from URL query string. Returns null on any
 * invalid input so the caller can fall back to the landing page. */
export function decodeProfileUrl(value) {
  if (typeof value !== 'string' || value === '') return null
  try {
    const decoded = JSON.parse(decodeURIComponent(value))
    if (decoded == null || typeof decoded !== 'object' || Array.isArray(decoded)) return null
    return decoded
  } catch {
    return null
  }
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

function LaptopCard({
  recommendation,
  onSelect,
  isSelected,
  vfm,
  breakdown,
}) {
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

  const handleToggle = () => {
    if (onSelect) onSelect(product.id)
  }

  return (
    <article className={`results-card${isSelected ? ' results-card--selected' : ''}`}>
      <div className="results-card__head">
        <label
          className="results-card__select"
          title={`Add ${[product.brand, product.model].filter(Boolean).join(' ')} or remove from comparison`}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleToggle}
            disabled={!isSelected && selectedIds.size >= 3}
          />
          <span className="visually-hidden">Select for comparison</span>
        </label>
        <div>
          <h3 className="results-card__name">
            {[product.brand, product.model].filter(Boolean).join(' ')}
          </h3>
          <p className="results-card__price">
            {typeof product.pricing.currentPrice === 'number'
              ? formatPrice(product.pricing.currentPrice)
              : 'Price not stated'}
          </p>
          {vfm != null && (
            <p className="results-card__vfm">
              Match score per ₹10,000 of price: {vfm}
            </p>
          )}
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

      {breakdown != null && breakdown.length > 0 && (
        <div className="results-card__section results-card__breakdown">
          <p className="results-card__section-title">Score breakdown</p>
          <ul className="results-card__list">
            {breakdown.map((entry) => (
              <li key={entry.factor} className="results-card__breakdown-item">
                <span className="results-card__breakdown-factor">
                  {capitalize(entry.factor)}
                </span>
                <span className="results-card__breakdown-points">
                  {entry.earned}/{entry.applicable}
                </span>
                <span className="results-card__breakdown-note">
                  {entry.note}
                </span>
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
  const [selectedIds, setSelectedIds] = useState(new Set())

  const handleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 3) {
        next.add(id)
      }
      return next
    })
  }

  const handleCopyLink = async () => {
    const url = buildShareUrl(requirements)
    if (url === '') return
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard access may be blocked; URL is still available in the page.
    }
  }

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

      {requirements != null && (
        <AnswersToRequirements profile={requirements} />
      )}
      {selectedIds.size >= 2 && (
        <ComparisonTable
          recommendations={recommendations}
          selectedIds={selectedIds}
          onSelect={handleSelect}
        />
      )}
      <div className="results__grid">
        {recommendations.map((recommendation) => {
          const isSelected = selectedIds.has(recommendation.product.id)
          const price =
            typeof recommendation.product.pricing?.currentPrice === 'number'
              ? recommendation.product.pricing.currentPrice
              : null
          return (
            <LaptopCard
              key={recommendation.product.id}
              recommendation={recommendation}
              onSelect={handleSelect}
              isSelected={isSelected}
              vfm={
                recommendation.score != null && price != null && price > 0
                  ? valueForMoney(recommendation.score, price)
                  : null
              }
              breakdown={recommendation.breakdown}
            />
          )
        })}
      </div>

      <div className="results__footer">
        <button
          type="button"
          className="question-flow__button"
          onClick={onRestart}
        >
          Start over
        </button>
        {selectedIds.size > 0 && (
          <button
            type="button"
            className="question-flow__button question-flow__button--primary"
            onClick={handleCopyLink}
          >
            Copy results link
          </button>
        )}
      </div>
    </section>
  )
}

/** Transparency section: how the user's answers became requirement minimums. */
function AnswersToRequirements({ profile }) {
  if (profile == null || typeof profile !== 'object') return null

  const summary = summarizeRequirements(profile)
  const derived = Array.isArray(profile.derived) ? profile.derived : []

  return (
    <section className="results__transparency">
      <h2>How your answers became requirements</h2>
      <p>
        Your interview responses were converted into a structured requirements
        profile. Stated answers are used directly; values marked "suggested"
        were inferred from your workload and are suggestions, not guarantees.
      </p>
      <dl className="results__transparency-list">
        {summary.map((line) => (
          <div key={line.key} className="results__transparency-row">
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
            {line.note != null && (
              <span className="results__transparency-note">{line.note}</span>
            )}
          </div>
        ))}
        {derived.length > 0 && (
          <div className="results__transparency-derived">
            <p className="results__transparency-derived-title">
              Inferred from your workload (suggestions):
            </p>
            <ul className="results__transparency-derived-list">
              {derived.map((entry, idx) => (
                <li key={idx} className="results__transparency-derived-item">
                  {entry.field}: {entry.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </dl>
    </section>
  )
}

/** Side-by-side comparison table for up to 3 selected recommendations. */
function ComparisonTable({ recommendations, selectedIds }) {
  const selected = recommendations.filter((r) => selectedIds.has(r.product.id))
  if (selected.length < 2) return null

  const columns = [
    { field: 'price', label: 'Price', direction: 'cheapest' },
    { field: 'cpu', label: 'CPU' },
    { field: 'gpu', label: 'GPU' },
    { field: 'ram', label: 'RAM' },
    { field: 'storage', label: 'Storage' },
    { field: 'display', label: 'Display' },
    { field: 'weight', label: 'Weight' },
    { field: 'battery', label: 'Battery' },
  ]

  return (
    <section className="results__comparison">
      <h2>Side-by-side comparison</h2>
      <p>
        Factual specifications only - "best" highlights are numeric comparisons
        of stated data, not claims about real-world performance.
      </p>
      <table className="results__comparison-table">
        <thead>
          <tr>
            <th>Laptop</th>
            {columns.map((col) => (
              <th key={col.field} className="results__comparison-cell">
                {col.label}
              </th>
            ))}
            <th className="results__comparison-cell">Match score</th>
          </tr>
        </thead>
        <tbody>
          {selected.map((rec) => (
            <tr key={rec.product.id} className="results__comparison-row">
              <td className="results__comparison-name">
                {[rec.product.brand, rec.product.model]
                  .filter(Boolean)
                  .join(' ')}
              </td>
              {columns.map((col) => {
                const best = bestInColumn(selected, col.field, col.direction)
                const isBest =
                  best != null &&
                  rec.product.id === best.product.id &&
                  selected.length > 1
                return (
                  <td
                    key={col.field}
                    className={`results__comparison-cell${isBest ? ' results__comparison-best' : ''}`}
                  >
                    {specText(rec.product, col.field)}
                  </td>
                )
              })}
              <td className="results__comparison-cell results__comparison-score">
                {rec.score}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="results__comparison-notes">
        <p>
          Highlighted cells show the factual extreme in each column among the
          selected laptops where that data is known. No cell is highlighted
          when no product states a value for that field.
        </p>
      </div>
    </section>
  )
}

/** Build a shareable URL from the requirements profile. */
function buildShareUrl(profile) {
  if (typeof window === 'undefined' || window.location == null) return ''
  const encoded = encodeProfileUrl(profile)
  if (encoded === '') return ''
  const url = new URL(window.location.href)
  url.searchParams.set('requirements', encoded)
  return url.toString()
}