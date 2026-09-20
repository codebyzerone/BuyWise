import { Component, useState } from 'react'
import QuestionFlow from './components/QuestionFlow.jsx'
import ResultsView from './components/ResultsView.jsx'
import LandingPage from './components/LandingPage.jsx'
import { laptopInterviewQuestions } from './data/laptopInterview.js'
import { buildRequirements } from './data/buildRequirements.js'
import { summarizeRequirements } from './data/summarizeRequirements.js'
import { getRecommendations } from './engine/recommendations.js'
import {
  fetchRecommendations,
  isBackendConfigured,
} from './api/fetchRecommendations.js'
import { laptopCatalog } from './data/laptopCatalog.js'
import './App.css'

/**
 * Catches unexpected render/runtime errors so one failure never crashes the
 * whole application. Remounted (key={runId}) by "Start over", which also
 * clears its error state.
 */
class FlowErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="question-flow">
          <div className="question-flow__summary">
            <p className="question-flow__summary-eyebrow">Something went wrong</p>
            <h2>We could not show your results</h2>
            <p className="question-flow__summary-sub">
              An unexpected error occurred while preparing your laptop matches.
              Please start over.
            </p>
            <div className="question-flow__summary-actions">
              <button
                type="button"
                className="question-flow__button question-flow__button--primary"
                onClick={this.props.onReset}
              >
                Start over
              </button>
            </div>
          </div>
        </section>
      )
    }
    return this.props.children
  }
}

/**
 * App shell: interview -> requirements -> recommendations -> results.
 *
 * Flow (no page reload, pure React state):
 *   Landing page -> CTA -> QuestionFlow finishes -> onComplete(profile)
 *   -> recommendations -> stored in state -> <ResultsView/>.
 * "Start over" / "Change your requirements" clears every piece of state and
 * remounts QuestionFlow (key={runId}), fully resetting answers and position
 * (within the interview, exactly as before - it does NOT return to the
 * landing page).
 *
 * PHASE C - recommendation source:
 *   - VITE_BUYWISE_API_URL set  -> the deployed backend (API Gateway ->
 *     Lambda -> the same engine) is the source of results. A minimal
 *     in-place loading state is shown while the request runs.
 *   - Not set, or API failure  -> the local engine computes recommendations
 *     exactly as before, so behavior without the API is unchanged and the
 *     deployed demo can never break because of the backend.
 */
function App() {
  const [recommendation, setRecommendation] = useState(null)
  const [requirements, setRequirements] = useState(null)
  const [hasError, setHasError] = useState(false)
  const [runId, setRunId] = useState(0)
  const [isRecommending, setIsRecommending] = useState(false)
  const [showLanding, setShowLanding] = useState(true)

  /** Landing CTA -> hand over to the EXISTING interview flow. */
  const startInterview = () => setShowLanding(false)

  /** The original synchronous local pipeline - unchanged behavior. */
  const applyLocalRecommendations = (profile) => {
    try {
      if (profile == null || typeof profile !== 'object') {
        throw new Error('invalid requirements profile')
      }
      if (!Array.isArray(laptopCatalog) || laptopCatalog.length === 0) {
        throw new Error('laptop catalog is empty')
      }
      const recommendationResult = getRecommendations(profile, laptopCatalog)
      if (
        recommendationResult == null ||
        typeof recommendationResult.feasible !== 'boolean' ||
        !Array.isArray(recommendationResult.recommendations) ||
        !Array.isArray(recommendationResult.conflicts)
      ) {
        throw new Error('invalid recommendation result')
      }
      setRecommendation(recommendationResult)
      setRequirements(profile)
      setHasError(false)
    } catch {
      // Never crash the app: show the graceful error state instead.
      setRecommendation(null)
      setRequirements(null)
      setHasError(true)
    }
  }

  const handleComplete = (profile) => {
    if (!isBackendConfigured()) {
      applyLocalRecommendations(profile)
      return
    }
    // Backend is the source of results; fetchRecommendations resolves to
    // null on ANY failure and the local engine takes over seamlessly.
    setIsRecommending(true)
    fetchRecommendations(profile)
      .then((payload) => {
        if (payload !== null) {
          setRecommendation(payload)
          setRequirements(profile)
          setHasError(false)
        } else {
          applyLocalRecommendations(profile)
        }
      })
      .finally(() => setIsRecommending(false))
  }

  /** Complete reset: answers, position, requirements, recommendations. */
  const handleRestart = () => {
    setRecommendation(null)
    setRequirements(null)
    setHasError(false)
    setIsRecommending(false)
    setRunId((id) => id + 1)
  }

  const showResults = recommendation !== null || hasError

  return showLanding ? (
    <LandingPage onStart={startInterview} />
  ) : (
    <main className="quiz-page">
      <header className="quiz-header">
        <span className="quiz-header__brand">BuyWise</span>
        <span className="quiz-header__tagline">
          {isRecommending || showResults ? 'Laptop matches' : 'Laptop buying interview'}
        </span>
      </header>
      <FlowErrorBoundary key={runId} onReset={handleRestart}>
        {isRecommending ? (
          /* Minimal in-place loading state - reuses existing summary styles. */
          <section className="question-flow">
            <div className="question-flow__summary">
              <p className="question-flow__summary-eyebrow">BuyWise</p>
              <h2>Finding laptops that match your requirements…</h2>
              <p className="question-flow__summary-sub">
                Your requirements are being checked against the current catalog
                by the BuyWise recommendation engine. This takes a moment.
              </p>
            </div>
          </section>
        ) : showResults ? (
          <ResultsView
            result={recommendation}
            requirements={requirements}
            hasError={hasError}
            onRestart={handleRestart}
          />
        ) : (
          <QuestionFlow
            key={runId}
            questions={laptopInterviewQuestions}
            buildProfile={buildRequirements}
            summarizeProfile={summarizeRequirements}
            onComplete={handleComplete}
          />
        )}
      </FlowErrorBoundary>
    </main>
  )
}

export default App