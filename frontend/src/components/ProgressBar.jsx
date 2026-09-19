import './ProgressBar.css'

/**
 * Progress indicator for the question flow.
 *
 * @param {number} current - 1-based index of the visible question.
 * @param {number} total   - Total number of questions.
 */
function ProgressBar({ current, total }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div
      className="progress-bar"
      role="status"
      aria-label={`Question ${current} of ${total}`}
    >
      <span className="progress-bar__label">
        Question {current} of {total}
      </span>
      <div className="progress-bar__track" aria-hidden="true">
        <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default ProgressBar
