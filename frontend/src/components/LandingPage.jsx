import './LandingPage.css'

/**
 * Landing page - the entry screen shown before the laptop interview.
 *
 * Deliberately self-contained: the ONLY interaction is the CTA, which calls
 * onStart() so App.jsx mounts the EXISTING QuestionFlow. Interview questions,
 * the recommendation engine, ResultsView and the backend integration are not
 * touched by this component.
 */

const TRUST_POINTS = [
  { label: 'Real products', note: 'Curated listings with real prices' },
  { label: 'Smart matching', note: 'Requirements-first, preference-aware scoring' },
  { label: 'Conflict detection', note: 'Honest answers when nothing fits' },
]

const STEPS = [
  {
    number: '01',
    title: 'Tell us what you need',
    note: 'A short adaptive interview about your budget, workloads and must-haves.',
  },
  {
    number: '02',
    title: 'We analyze your requirements',
    note: 'Your answers become a structured profile with hard and soft requirements.',
  },
  {
    number: '03',
    title: 'Get matched laptops',
    note: 'Feasible laptops ranked by match quality, with reasons and compromises.',
  },
]

/** Small inline check icon (stroke = currentColor, no external assets). */
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M3 8.5 6.5 12 13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LandingPage({ onStart }) {
  return (
    <section className="landing" aria-label="BuyWise introduction">
      <header className="landing__header">
        <span className="landing__brand">
          <span className="landing__avatar" aria-hidden="true">
            M
          </span>
          <span className="landing__brand-name">BuyWise</span>
        </span>
      </header>

      <div className="landing__hero">
        <p className="landing__eyebrow">Laptop buying assistant</p>
        <h1 className="landing__headline">
          Find the laptop that&rsquo;s actually right for you.
        </h1>
        <p className="landing__sub">
          Tell us your budget, your work, your games and what matters to you.
          BuyWise turns those answers into laptop recommendations that
          genuinely fit &mdash; with clear, factual reasoning for every match.
        </p>
        <button type="button" className="landing__cta" onClick={onStart}>
          Find My Laptop <span className="landing__cta-arrow">&rarr;</span>
        </button>
        <ul className="landing__trust" aria-label="Why BuyWise">
          {TRUST_POINTS.map((point) => (
            <li key={point.label} className="landing__trust-item" title={point.note}>
              <CheckIcon />
              {point.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="landing__steps">
        {STEPS.map((step) => (
          <div key={step.number} className="landing__step">
            <span className="landing__step-number">{step.number}</span>
            <h2 className="landing__step-title">{step.title}</h2>
            <p className="landing__step-note">{step.note}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default LandingPage
