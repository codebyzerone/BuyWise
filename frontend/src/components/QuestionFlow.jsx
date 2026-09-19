import { useState } from 'react'
import ProgressBar from './ProgressBar.jsx'
import QuestionCard from './QuestionCard.jsx'
import './QuestionFlow.css'

/**
 * Adaptive question-flow engine.
 *
 * Renders exactly one question at a time and keeps every answer in local
 * React state, keyed by question id:
 *
 *   single-select: { optionId: string | null, customText: string }
 *   multi-select:  { optionIds: string[], customText: string }
 *
 * Adaptive branching contract: a question may define
 *   isRelevant(answers) => boolean
 * Questions whose predicate fails are skipped during navigation and excluded
 * from the final summary, so branching rules live entirely in the question
 * configuration (see src/data/laptopInterview.js).
 *
 * @param {object[]}   questions    - Question objects (see
 *                                    src/data/laptopInterview.js).
 * @param {Function} [buildProfile] - Optional (answers, askedQuestions) =>
 *                                    structured requirements profile rendered
 *                                    on the completion screen.
 * @param {Function} [summarizeProfile] - Optional (profile) =>
 *                                    Array<{ key, label, value, note }>
 *                                    plain-language summary lines shown above
 *                                    the answers on the completion screen.
 * @param {Function} [onComplete]   - Optional (profile, askedQuestions) =>
 *                                    handed the finished profile so the host
 *                                    app can continue the flow (e.g. run the
 *                                    recommendation engine). The interview
 *                                    itself is unchanged without it.
 */
function QuestionFlow({ questions, buildProfile, summarizeProfile, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [isFinished, setIsFinished] = useState(false)

  // Adaptive branching: keep only questions relevant to the answers so far.
  const visibleQuestions = questions.filter(
    (question) => !question.isRelevant || question.isRelevant(answers),
  )
  const totalSteps = visibleQuestions.length

  if (totalSteps === 0) {
    return null
  }

  // Guards against a branch change shrinking the visible list mid-interview.
  const step = Math.min(stepIndex, totalSteps - 1)
  const currentQuestion = visibleQuestions[step]
  const currentAnswer =
    answers[currentQuestion.id] ?? {
      optionId: null,
      optionIds: [],
      customText: '',
    }
  const isTextFirst = currentQuestion.options.length === 0
  const isMultiple = currentQuestion.selectionType === 'multiple'
  const canProceed = currentQuestion.optional
    ? true
    : isMultiple
      ? currentAnswer.optionIds.length > 0
      : isTextFirst
        ? currentAnswer.customText.trim() !== ''
        : currentAnswer.optionId !== null
  const isLastStep = step === totalSteps - 1

  const handleOptionSelect = (optionId) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        optionId,
        customText: prev[currentQuestion.id]?.customText ?? '',
      },
    }))
  }

  /** Multi-select questions: add/remove one option id, keep the free text. */
  const handleOptionToggle = (optionId) => {
    setAnswers((prev) => {
      const previous = prev[currentQuestion.id]
      const currentIds = previous?.optionIds ?? []
      const optionIds = currentIds.includes(optionId)
        ? currentIds.filter((id) => id !== optionId)
        : [...currentIds, optionId]

      return {
        ...prev,
        [currentQuestion.id]: {
          optionIds,
          customText: previous?.customText ?? '',
        },
      }
    })
  }

  const handleCustomTextChange = (customText) => {
    setAnswers((prev) => {
      const previous = prev[currentQuestion.id]
      // Keep the selection shape of the current question intact: multi-select
      // answers carry optionIds, single-select answers carry optionId.
      const selection = isMultiple
        ? { optionIds: previous?.optionIds ?? [] }
        : { optionId: previous?.optionId ?? null }

      return {
        ...prev,
        [currentQuestion.id]: { ...selection, customText },
      }
    })
  }

  const handleBack = () => {
    setStepIndex(Math.max(0, step - 1))
  }

  const handleNext = () => {
    if (!canProceed) return
    if (isLastStep) {
      setIsFinished(true)
    } else {
      setStepIndex(step + 1)
    }
  }

  const handleRestart = () => {
    setStepIndex(0)
    setAnswers({})
    setIsFinished(false)
  }

  if (isFinished) {
    const profile = buildProfile
      ? buildProfile(answers, visibleQuestions)
      : null
    const summaryLines = summarizeProfile ? summarizeProfile(profile) : []

    return (
      <section className="question-flow">
        <div className="question-flow__summary">
          <p className="question-flow__summary-eyebrow">Interview complete</p>
          <h1>Here&apos;s what we understood</h1>
          <p className="question-flow__summary-sub">
            Check this summary, then find your matches. Nothing is final yet -
            you can go back and change any answer.
          </p>
          {summaryLines.length > 0 && (
            <ul className="question-flow__summary-list">
              {summaryLines.map((line) => (
                <li key={line.key} className="question-flow__summary-item">
                  <span className="question-flow__summary-question">
                    {line.label}
                  </span>
                  <span className="question-flow__summary-answer">
                    {line.value}
                  </span>
                  {typeof line.note === 'string' && line.note !== '' && (
                    <span className="question-flow__summary-note">
                      {line.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="question-flow__summary-data">
            <summary>What you answered</summary>
            <ul className="question-flow__summary-list">
              {visibleQuestions.map((question) => {
                const answer = answers[question.id]
                const selectedIds =
                  answer?.optionIds ??
                  (answer?.optionId ? [answer.optionId] : [])
                const selectedLabels = question.options
                  .filter((option) => selectedIds.includes(option.id))
                  .map((option) => option.label)
                const customText = answer?.customText?.trim() ?? ''

                return (
                  <li key={question.id} className="question-flow__summary-item">
                    <span className="question-flow__summary-question">
                      {question.prompt}
                    </span>
                    <span className="question-flow__summary-answer">
                      {selectedLabels.length > 0
                        ? selectedLabels.join(', ')
                        : customText !== ''
                          ? customText
                          : 'Not specified'}
                    </span>
                    {selectedLabels.length > 0 && customText !== '' && (
                      <span className="question-flow__summary-note">
                        {customText}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </details>
          {profile && (
            <details className="question-flow__summary-data">
              <summary>View normalized requirements</summary>
              <pre>{JSON.stringify(profile, null, 2)}</pre>
            </details>
          )}
          <div className="question-flow__summary-actions">
            {onComplete && profile && (
              <button
                type="button"
                className="question-flow__button question-flow__button--primary"
                onClick={() => onComplete(profile, visibleQuestions)}
              >
                Find my laptop matches
              </button>
            )}
            <button
              type="button"
              className="question-flow__button"
              onClick={() => setIsFinished(false)}
            >
              Back to the questions
            </button>
            <button
              type="button"
              className="question-flow__button"
              onClick={handleRestart}
            >
              Retake interview
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="question-flow">
      <ProgressBar current={step + 1} total={totalSteps} />

      {/* Keyed remount replays the entrance animation on every question. */}
      <div className="question-flow__step" key={currentQuestion.id}>
        <QuestionCard
          question={currentQuestion}
          selectedOptionId={currentAnswer.optionId}
          selectedOptionIds={currentAnswer.optionIds}
          customText={currentAnswer.customText}
          onOptionSelect={handleOptionSelect}
          onOptionToggle={handleOptionToggle}
          onCustomTextChange={handleCustomTextChange}
        />
      </div>

      <div className="question-flow__nav">
        <button
          type="button"
          className="question-flow__button"
          onClick={handleBack}
          disabled={step === 0}
        >
          Back
        </button>
        <button
          type="button"
          className="question-flow__button question-flow__button--primary"
          onClick={handleNext}
          disabled={!canProceed}
        >
          {isLastStep ? 'Finish' : 'Next'}
        </button>
      </div>
    </section>
  )
}

export default QuestionFlow