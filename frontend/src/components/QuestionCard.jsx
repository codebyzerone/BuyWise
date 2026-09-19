import './QuestionCard.css'

/**
 * Reusable single-question card.
 *
 * Controlled component: the parent owns the answer state and passes the
 * current values down along with change callbacks, so it works unchanged for
 * any question that follows the schema in src/data/laptopInterview.js.
 *
 * @param {object}   props
 * @param {object}   props.question          - Question object (id, prompt,
 *                                             selectionType?, options,
 *                                             textInput?). `options` may be
 *                                             empty for text-first questions
 *                                             (input is the answer).
 * @param {string|null} props.selectedOptionId - Currently selected option id
 *                                             (single-select questions).
 * @param {string[]} [props.selectedOptionIds] - Currently selected option ids
 *                                             (selectionType: 'multiple').
 * @param {string}   props.customText        - Current free-text response.
 * @param {(optionId: string) => void} props.onOptionSelect
 * @param {(optionId: string) => void} [props.onOptionToggle]
 * @param {(text: string) => void} props.onCustomTextChange
 */
function QuestionCard({
  question,
  selectedOptionId = null,
  selectedOptionIds = [],
  customText,
  onOptionSelect,
  onOptionToggle,
  onCustomTextChange,
}) {
  const isMultiple = question.selectionType === 'multiple'
  const textInput = question.textInput
  const showTextInput =
    Boolean(textInput) &&
    (!textInput.showForOptionId ||
      textInput.showForOptionId === selectedOptionId)

  return (
    <fieldset className="question-card">
      <legend className="question-card__prompt">{question.prompt}</legend>

      {isMultiple && (
        <p className="question-card__hint">Select all that apply</p>
      )}

      {question.options.length > 0 && (
        <div className="question-card__options">
          {question.options.map((option) => {
            const isSelected = isMultiple
              ? selectedOptionIds.includes(option.id)
              : option.id === selectedOptionId

            return (
              <label
                key={option.id}
                className={`question-card__option${
                  isSelected ? ' question-card__option--selected' : ''
                }`}
              >
                <input
                  className="question-card__option-input"
                  type={isMultiple ? 'checkbox' : 'radio'}
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={isSelected}
                  onChange={() =>
                    isMultiple
                      ? onOptionToggle(option.id)
                      : onOptionSelect(option.id)
                  }
                />
                <span className="question-card__option-label">
                  {option.label}
                </span>
              </label>
            )
          })}
        </div>
      )}

      {showTextInput && (
        <div className="question-card__text">
          <label
            className="question-card__text-label"
            htmlFor={`question-${question.id}-text`}
          >
            {textInput.label}
          </label>
          {textInput.multiline ? (
            <textarea
              id={`question-${question.id}-text`}
              className="question-card__text-input question-card__text-input--multiline"
              rows={textInput.rows ?? 4}
              value={customText}
              placeholder={textInput.placeholder}
              onChange={(event) => onCustomTextChange(event.target.value)}
            />
          ) : (
            <input
              id={`question-${question.id}-text`}
              className="question-card__text-input"
              type="text"
              value={customText}
              placeholder={textInput.placeholder}
              onChange={(event) => onCustomTextChange(event.target.value)}
            />
          )}
        </div>
      )}
    </fieldset>
  )
}

export default QuestionCard
