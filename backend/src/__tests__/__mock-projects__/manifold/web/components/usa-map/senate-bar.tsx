import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { partition } from 'lodash'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { currentSenate, senate2024 } from 'web/public/data/senate-state-data'
import { sortByDemocraticDiff } from './electoral-college-visual'
import { probToColor } from './state-election-map'
import { HIGHLIGHTED_OUTLINE_COLOR, SELECTED_OUTLINE_COLOR } from './usa-map'

export function SenateBar(props: {
  mapContractsDictionary: MapContractsDictionary
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | null | undefined
  hoveredState: string | null | undefined
}) {
  const sortedContractsDictionary = sortByDemocraticDiff(
    props.mapContractsDictionary,
    senate2024
  )
  const { handleClick, onMouseEnter, onMouseLeave, targetState, hoveredState } =
    props

  const isMobile = useIsMobile()
  const [republicans, democrats] = partition(
    currentSenate,
    ({ party1 }) => party1 === 'Republican'
  )

  return (
    <Col className="mt-2 w-full text-xs sm:text-base">
      <Col className="text-ink-700 mx-auto items-center">
        <div className="-mb-1 ">50 to win</div>
        <ChevronDownIcon className="h-5 w-5" />
      </Col>
      <Row className="overflow-none relative gap-[1px] rounded sm:gap-0.5">
        {democrats.map(({ state }) => {
          return (
            <StateBar
              key={state}
              handleClick={handleClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              targetState={targetState}
              hoveredState={hoveredState}
              state={state}
              backgroundImage={`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%234a5fa8'/%3E%3Cline x1='0' y1='0' x2='8' y2='8' stroke='%23262c45' stroke-width='2'/%3E%3Cline x1='8' y1='0' x2='0' y2='8' stroke='%23262c45' stroke-width='2'/%3E%3C/svg%3E")`}
              width={`${(1 / 50) * 100}%`}
              isMobile={isMobile}
            />
          )
        })}
        {Object.entries(sortedContractsDictionary).map(
          ([stateKey, contract]) => {
            const fill = probToColor(
              contract,
              senate2024.filter((s) => s.state === stateKey)[0]
            )
            return (
              <StateBar
                key={stateKey}
                handleClick={handleClick}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                targetState={targetState}
                hoveredState={hoveredState}
                state={stateKey}
                fill={fill}
                width={`${(1 / 50) * 100}%`}
                isMobile={isMobile}
              />
            )
          }
        )}
        {republicans.map(({ state }) => {
          return (
            <StateBar
              key={state}
              handleClick={handleClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              targetState={targetState}
              hoveredState={hoveredState}
              state={state}
              backgroundImage={`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%239d3336'/%3E%3Cline x1='0' y1='0' x2='8' y2='8' stroke='%233e1316' stroke-width='2'/%3E%3Cline x1='8' y1='0' x2='0' y2='8' stroke='%233e1316' stroke-width='2'/%3E%3C/svg%3E")`}
              width={`${(1 / 50) * 100}%`}
              isMobile={isMobile}
            />
          )
        })}
      </Row>
    </Col>
  )
}

export function StateBar(props: {
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | null | undefined
  hoveredState: string | null | undefined
  state: string
  fill?: string
  backgroundImage?: string
  width: string
  isMobile: boolean
  displayState?: (state: string) => string
}) {
  const {
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
    state,
    backgroundImage,
    fill,
    width,
    isMobile,
    displayState,
  } = props
  const selected = targetState === state
  const isHovered = hoveredState === state

  return (
    <div
      key={state}
      className="relative h-5 transition-all"
      style={{
        backgroundImage: backgroundImage,
        backgroundColor: fill,
        width: width,
        outline:
          isHovered || selected
            ? `${isMobile ? '1px' : '2px'} solid ${
                selected ? SELECTED_OUTLINE_COLOR : HIGHLIGHTED_OUTLINE_COLOR
              }`
            : 'none',
      }}
      onClick={() => handleClick(state)}
      onMouseEnter={() => onMouseEnter(state)}
      onMouseLeave={onMouseLeave}
    >
      {(isHovered || (selected && !hoveredState)) && (
        <Row
          className={clsx(
            '0 text-ink-700 absolute left-0 top-6 z-20 gap-1 rounded py-1 transition-all'
          )}
        >
          <div className="whitespace-nowrap font-semibold">
            {displayState ? displayState(state) : state}
          </div>
        </Row>
      )}
    </div>
  )
}
