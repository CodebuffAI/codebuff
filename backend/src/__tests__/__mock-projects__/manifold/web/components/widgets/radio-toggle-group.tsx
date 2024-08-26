import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import { orderBy } from 'lodash'
import { Row } from '../layout/row'

export function RadioToggleGroup(props: {
  currentChoice: number
  choicesMap: Record<string, number>
  setChoice: (p: number) => void
  className?: string
  toggleClassName?: string
  indexColors?: Record<number, string>
}) {
  const {
    currentChoice,
    setChoice,
    choicesMap,
    className,
    toggleClassName,
    indexColors,
  } = props

  const orderedChoicesMap = orderBy(
    Object.entries(choicesMap),
    ([_, choice]) => choice
  )

  const length = orderedChoicesMap.length
  return (
    <Row className="text-ink-300 dark:text-ink-600 mb-6 items-center gap-3 text-sm">
      {orderedChoicesMap[0][0]}
      <RadioGroup
        className={clsx(
          className,
          `flex w-full flex-row justify-between gap-2 rounded-md p-1 text-xs`
        )}
        value={currentChoice}
        onChange={setChoice}
      >
        {orderedChoicesMap.map(([choiceKey, choice], index) => (
          <RadioGroup.Option
            onClick={() => {
              if (currentChoice == choice) {
                setChoice(-1)
              }
            }}
            key={choiceKey}
            value={choice}
            className={({ disabled }) =>
              clsx(
                disabled ? 'cursor-not-allowed' : 'cursor-pointer ',
                ' mx-auto h-5 w-5 rounded-full  bg-opacity-20 ring-1 ring-opacity-70 transition-all dark:bg-opacity-20 dark:aria-checked:bg-opacity-100',
                ' aria-checked:bg-opacity-100 aria-checked:ring-8 aria-checked:ring-opacity-40 dark:aria-checked:ring-opacity-40',
                disabled
                  ? 'bg-ink-400 ring-ink-400'
                  : indexColors
                  ? indexColors[index]
                  : index == 0
                  ? `bg-rose-600 ring-rose-600 dark:bg-rose-500 dark:ring-rose-500`
                  : index == 1
                  ? `bg-rose-400 ring-rose-400`
                  : index == 2
                  ? `bg-stone-400 ring-stone-400 dark:bg-stone-500 dark:ring-stone-500`
                  : index == 3
                  ? `bg-teal-300 ring-teal-300 dark:bg-teal-200 dark:ring-teal-200 `
                  : `bg-teal-400 ring-teal-400`,

                toggleClassName
              )
            }
          />
        ))}
      </RadioGroup>
      {orderedChoicesMap[length - 1][0]}
    </Row>
  )
}
