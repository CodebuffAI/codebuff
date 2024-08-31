import { XIcon } from '@heroicons/react/solid'
import { MAX_ANSWERS, MAX_ANSWER_LENGTH } from 'common/answer'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ExpandingInput } from '../widgets/expanding-input'
import { InfoTooltip } from '../widgets/info-tooltip'
import { OutcomeType } from 'common/contract'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'

export function MultipleChoiceAnswers(props: {
  answers: string[]
  setAnswers: (answers: string[]) => void
  addAnswersMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  setAddAnswersMode: (mode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE') => void
  shouldAnswersSumToOne: boolean
  setShouldAnswersSumToOne: (shouldAnswersSumToOne: boolean) => void
  outcomeType: OutcomeType
  placeholder?: string
}) {
  const {
    answers,
    setAnswers,
    addAnswersMode,
    setAddAnswersMode,
    shouldAnswersSumToOne,
    setShouldAnswersSumToOne,
    outcomeType,
    placeholder,
  } = props

  const setAnswer = (i: number, answer: string) => {
    const newAnswers = setElement(answers, i, answer)
    setAnswers(newAnswers)
  }

  const removeAnswer = (i: number) => {
    if (canRemoveAnswers) {
      const newAnswers = answers.slice(0, i).concat(answers.slice(i + 1))
      setAnswers(newAnswers)
    }
  }

  const addAnswer = () => setAnswer(answers.length, '')

  const focusAnswer = (i: number) => {
    const input = document.getElementById(`answer-input-${i}`)
    input?.focus()
  }
  const focusPrevAnswer = (i: number) => focusAnswer(i == 0 ? 0 : i - 1)
  const focusNextAnswer = (i: number) => {
    if (i == answers.length - 1) {
      addAnswer()
      setTimeout(() => focusAnswer(i + 1), 0) // focus after react removes the answer
    } else {
      focusAnswer(i + 1)
    }
  }

  const hasOther = shouldAnswersSumToOne && addAnswersMode !== 'DISABLED'
  const numAnswers = answers.length + (hasOther ? 1 : 0)

  const canRemoveAnswers =
    !shouldAnswersSumToOne ||
    numAnswers > 2 ||
    (numAnswers > 1 && addAnswersMode !== 'DISABLED')

  return (
    <Col className="gap-2">
      {answers.slice(0, answers.length).map((answer, i) => (
        <Row className="items-center gap-2 align-middle" key={i}>
          {i + 1}.{' '}
          <AnswerInput
            id={`answer-input-${i}`}
            value={answer}
            onChange={(e) => setAnswer(i, e.target.value)}
            onUp={() => focusPrevAnswer(i)}
            onDown={() => focusNextAnswer(i)}
            onDelete={() => removeAnswer(i)}
            placeholder={placeholder ?? `Option ${i + 1}`}
          />
          {canRemoveAnswers && (
            <button
              onClick={() => removeAnswer(i)}
              type="button"
              className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded-full border p-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              <XIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </Row>
      ))}

      {hasOther && (
        <Row className="items-center gap-2">
          {answers.length + 1}. <AnswerInput disabled value={'Other'} />
          <div className="mx-1.5">
            <InfoTooltip
              text={
                'The "Other" answer represents all answers that are not listed. New answers are split off from it.'
              }
            />
          </div>
        </Row>
      )}
      {numAnswers < MAX_ANSWERS && (
        <Row className="justify-end">
          <button
            type="button"
            onClick={addAnswer}
            className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            Add {outcomeType == 'POLL' ? 'option' : 'answer'}
          </button>
        </Row>
      )}

      {outcomeType !== 'POLL' && (
        <>
          <Col className="mb-4 items-start gap-2">
            <Row className="items-center gap-2">
              <div className="cursor-pointer">
                Who can add new answers later?
              </div>
              <div>
                <InfoTooltip
                  text={
                    'Determines who will be able to add new answers after question creation.' +
                    (shouldAnswersSumToOne
                      ? ' If enabled, then an "Other" answer will be included.'
                      : '')
                  }
                />
              </div>
            </Row>
            <ChoicesToggleGroup
              currentChoice={addAnswersMode}
              choicesMap={{
                'No one': 'DISABLED',
                You: 'ONLY_CREATOR',
                Anyone: 'ANYONE',
              }}
              setChoice={(c) => setAddAnswersMode(c as any)}
            />
          </Col>

          <Col className="items-start gap-2">
            <Row className="items-center gap-2">
              <div className="cursor-pointer">
                How many answers will be chosen?
              </div>
              <div>
                <InfoTooltip
                  text={
                    'If "One", then one answer will resolve to YES and all the others will resolve to NO. Otherwise, any number of answers can resolve to YES — they are independent.'
                  }
                />
              </div>
            </Row>
            <ChoicesToggleGroup
              currentChoice={shouldAnswersSumToOne ? 'true' : 'false'}
              choicesMap={{
                One: 'true',
                'Any number': 'false',
              }}
              setChoice={(choice) =>
                setShouldAnswersSumToOne(choice === 'true')
              }
            />
          </Col>
        </>
      )}
    </Col>
  )
}

const AnswerInput = (props: {
  id?: string
  disabled?: boolean
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onUp?: () => void
  onDown?: () => void
  onDelete?: () => void
  placeholder?: string
}) => {
  const { id, disabled, value, onChange, onUp, onDown, onDelete, placeholder } =
    props

  return (
    <ExpandingInput
      id={id}
      className="ml-2 w-full"
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={(e) => {
        if (e.key == 'ArrowUp' && !e.shiftKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          onUp?.()
        }
        if (e.key == 'ArrowDown' && !e.shiftKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          onDown?.()
        }
        if (e.key == 'Enter' && !e.shiftKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          onDown?.()
        }
        if (e.key == 'Backspace' && value === '' && !e.shiftKey && !e.altKey) {
          onDelete?.()
          onUp?.()
        }
      }}
      rows={1}
      maxLength={MAX_ANSWER_LENGTH}
    />
  )
}

const setElement = <T,>(array: T[], i: number, elem: T) => {
  const newArray = array.concat()
  newArray[i] = elem
  return newArray
}
