import { Component, useState } from 'react'
import QuestionFlow from './components/QuestionFlow.jsx'
import ResultsView from './components/ResultsView.jsx'
import { laptopInterviewQuestions } from './data/laptopInterview.js'
import { buildRequirements } from './data/buildRequirements.js'
import { summarizeRequirements } from './data/summarizeRequirements.js'
import { getRecommendations } from './engine/recommendations.js'
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
 *   QuestionFlow finishes -> onComplete(profile) -> getRecommendations()
 *   (against the REAL laptop catalog) -> stored in state -> <ResultsView/>.
 * "Start over" / "Change your requirements" clears every piece of state and
 * remounts QuestionFlow (key={runId}), fully resetting answers and position.
 */
function App() {
  const [recommendation, setRecommendation] = useState(null)
  const [requirements, setRequirements] = useState(null)
  const [hasError, setHasError] = useState(false)
  const [runId, setRunId] = useState(0)

  const handleComplete = (profile) => {
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

  /** Complete reset: answers, position, requirements, recommendations. */
  const handleRestart = () => {
    setRecommendation(null)
    setRequirements(null)
    setHasError(false)
    setRunId((id) => id + 1)
  }

  const showResults = recommendation !== null || hasError

  return (
    <main className="quiz-page">
      <header className="quiz-header">
        <span className="quiz-header__brand">BuyWise</span>
        <span className="quiz-header__tagline">
          {showResults ? 'Laptop matches' : 'Laptop buying interview'}
        </span>
      </header>
      <FlowErrorBoundary key={runId} onReset={handleRestart}>
        {showResults ? (
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