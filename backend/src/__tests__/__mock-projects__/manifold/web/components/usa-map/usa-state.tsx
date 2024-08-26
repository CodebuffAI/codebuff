import clsx from 'clsx'
import { MouseEventHandler } from 'react'
import { isColorLight } from './state-election-map'
import {
  ClickHandler,
  HIGHLIGHTED_OUTLINE_COLOR,
  SELECTED_OUTLINE_COLOR,
} from './usa-map'
import { StateDataType } from './usa-map-data'

type TextCoordinates = { x: number; y: number }

export const OFFSET_TEXT_COLOR = '#9E9FBD'
export const DEFAULT_STATE_FILL = '#e7dfe6'

export function USAState(props: {
  state: string
  stateData: StateDataType
  fill?: string
  onClickState?: ClickHandler
  onMouseEnterState?: () => void | undefined
  onMouseLeaveState?: () => void | undefined
  selected?: boolean
  hovered?: boolean
  patternTextColor?: string
}) {
  const {
    state,
    stateData,
    onClickState,
    onMouseEnterState,
    onMouseLeaveState,
    selected,
    hovered,
    patternTextColor,
  } = props

  const { dimensions, textCoordinates, abbreviation, line } = stateData
  const fill = props.fill ?? DEFAULT_STATE_FILL
  return (
    <>
      <path
        d={dimensions}
        fill={fill}
        data-name={state}
        className={clsx(
          !!onClickState
            ? 'cursor-pointer transition-all'
            : 'cursor-not-allowed'
        )}
        onClick={onClickState as MouseEventHandler<SVGPathElement> | undefined}
        id={state}
        stroke={
          !!selected
            ? SELECTED_OUTLINE_COLOR
            : hovered
            ? HIGHLIGHTED_OUTLINE_COLOR
            : undefined
        }
        strokeWidth={!!selected || !!hovered ? 2 : undefined}
        onMouseEnter={onMouseEnterState}
        onMouseLeave={onMouseLeaveState}
      />
      {StateText({
        line,
        textCoordinates,
        abbreviation,
        onMouseEnter: line ? onMouseEnterState : undefined,
        onMouseLeave: line ? onMouseLeaveState : undefined,
        isHovered: !!hovered,
        fill,
        onClick: line ? onClickState : undefined,
        selected,
        patternTextColor,
      })}
    </>
  )
}

export const StateText = (props: {
  line:
    | {
        x1: number
        y1: number
        x2: number
        y2: number
      }
    | undefined
  textCoordinates: TextCoordinates | undefined
  abbreviation: string
  onMouseEnter: (() => void) | undefined
  onMouseLeave: (() => void) | undefined
  isHovered: boolean
  fill: string
  onClick?: ClickHandler
  selected?: boolean
  patternTextColor?: string
}) => {
  const {
    line,
    textCoordinates,
    abbreviation,
    onMouseEnter,
    onMouseLeave,
    isHovered,
    fill,
    selected,
    onClick,
    patternTextColor,
  } = props
  if (!textCoordinates) return null // Return null if there are no textCoordinates

  const isFillLight = isColorLight(fill)
  const textColor = !!line
    ? isHovered || selected
      ? fill
      : OFFSET_TEXT_COLOR
    : patternTextColor
    ? patternTextColor
    : isFillLight
    ? '#1e293b'
    : '#FFF'

  return (
    <>
      {line && (!!isHovered || !!selected) && (
        <text
          key={`${abbreviation}-outline`}
          x={textCoordinates.x}
          y={textCoordinates.y}
          textAnchor="middle"
          fill={'#ffff'}
          stroke={'#ffff'}
          strokeWidth={2}
        >
          {abbreviation}
        </text>
      )}

      <text
        key={abbreviation}
        x={textCoordinates.x}
        y={textCoordinates.y}
        textAnchor="middle"
        fill={textColor}
        fontWeight={isFillLight ? 600 : 'normal'}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={line ? 'cursor-pointer' : 'pointer-events-none'}
        onClick={onClick as MouseEventHandler<SVGTextElement> | undefined}
      >
        {abbreviation}
      </text>
      {line && (
        <>
          {/* Outline Line - Only shown when hovered */}
          {(isHovered || selected) && (
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={'#fff'}
              strokeWidth={3}
            />
          )}

          {/* Regular Line */}
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={textColor}
            strokeWidth={1} // Assuming the regular line is thinner
          />
        </>
      )}
    </>
  )
}
