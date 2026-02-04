/**
 * Options list component that renders all question options
 * including the Custom option button
 */

import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { QuestionOption } from './question-option'
import { useTheme } from '../../../hooks/use-theme'
import { Button } from '../../button'
import { CUSTOM_OPTION_INDEX, SYMBOLS } from '../constants'

import type { AccordionAnswer } from './accordion-question'
import type { AskUserQuestion } from '../../../types/store'

export interface OptionsListProps {
  question: AskUserQuestion
  answer: AccordionAnswer | undefined
  optionIndent: number
  focusedOptionIndex: number | null
  isTypingCustom: boolean
  onSelectOption: (optionIndex: number) => void
  onToggleOption: (optionIndex: number) => void
  onFocusOption: (index: number | null) => void
}

export const OptionsList: React.FC<OptionsListProps> = memo(
  ({
    question,
    answer,
    optionIndent,
    focusedOptionIndex,
    isTypingCustom,
    onSelectOption,
    onToggleOption,
    onFocusOption,
  }) => {
    const theme = useTheme()
    const isMultiSelect = question.multiSelect

    const isCustomSelected = answer?.isCustom ?? false
    const isCustomFocused = focusedOptionIndex === question.options.length || isTypingCustom
    const selectedFg = theme.name === 'dark' ? '#ffffff' : '#000000'
    const customSymbol = isMultiSelect
      ? isCustomSelected
        ? SYMBOLS.CHECKBOX_CHECKED
        : SYMBOLS.CHECKBOX_UNCHECKED
      : isCustomSelected
        ? SYMBOLS.SELECTED
        : SYMBOLS.UNSELECTED
    const customFg = isCustomFocused ? '#000000' : isCustomSelected ? selectedFg : theme.muted
    const customAttributes = isCustomFocused || isCustomSelected ? TextAttributes.BOLD : undefined

    const handleOptionSelect = (optionIndex: number) => {
      if (isMultiSelect) {
        onToggleOption(optionIndex)
      } else {
        onSelectOption(optionIndex)
      }
    }

    const handleCustomClick = () => {
      if (isMultiSelect) {
        onToggleOption(CUSTOM_OPTION_INDEX)
      } else {
        onSelectOption(CUSTOM_OPTION_INDEX)
      }
    }

    return (
      <>
        {/* Multi-select hint */}
        {isMultiSelect && (
          <text style={{ fg: theme.muted, paddingLeft: optionIndent }}>
            (Select multiple options)
          </text>
        )}

        {/* Options */}
        {question.options.map((option, optionIndex) => {
          const isSelected = isMultiSelect
            ? answer?.selectedIndices?.has(optionIndex) ?? false
            : answer?.selectedIndex === optionIndex

          return (
            <QuestionOption
              key={optionIndex}
              option={option}
              indent={optionIndent}
              isSelected={isSelected}
              isFocused={focusedOptionIndex === optionIndex}
              isMultiSelect={isMultiSelect}
              onSelect={() => handleOptionSelect(optionIndex)}
              onMouseOver={() => onFocusOption(optionIndex)}
            />
          )
        })}

        {/* Custom option - uses checkbox style for multi-select questions */}
        <Button
          onClick={handleCustomClick}
          onMouseOver={() => onFocusOption(question.options.length)}
          style={{
            width: '100%',
            flexDirection: 'column',
            gap: 0,
            backgroundColor: isCustomFocused ? theme.primary : undefined,
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: optionIndent,
          }}
        >
          <text style={{ fg: customFg, attributes: customAttributes }}>
            {`${customSymbol} Custom`}
          </text>
          {isCustomFocused && (
            <text
              style={{
                fg: '#000000',
                marginLeft: 2,
              }}
            >
              Type your own answer
            </text>
          )}
        </Button>
      </>
    )
  },
)

OptionsList.displayName = 'OptionsList'
