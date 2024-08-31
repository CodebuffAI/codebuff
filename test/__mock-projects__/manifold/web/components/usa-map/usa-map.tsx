// https://github.com/jb-1980/usa-map-react
// MIT License

import clsx from 'clsx'
import { MouseEvent } from 'react'
import { Col } from 'web/components/layout/col'
import { StateProps } from './presidential-state'
import { DATA } from './usa-map-data'
import { MapContractsDictionary } from 'web/public/data/elections-data'

export const SELECTED_OUTLINE_COLOR = '#00f7ff'
export const HIGHLIGHTED_OUTLINE_COLOR = '#00f7ffb3'
const PATTERN_SIZE = 8
const DEM_BACKGROUND = '#4a5fa8'
const REP_BACKGROUND = '#9d3336'
const DEM_CROSSHATCH = '#262c45'
const REP_CROSSHATCH = '#3e1316'

export type ClickHandler<
  E = SVGPathElement | SVGTextElement | SVGCircleElement,
  R = any
> = (e: React.MouseEvent<E, MouseEvent>) => R

export const USAMap = (props: {
  mapContractsDictionary: MapContractsDictionary
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | undefined | null
  hoveredState: string | undefined | null
  CustomStateComponent: React.ComponentType<StateProps>
}) => {
  const {
    mapContractsDictionary,
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
    CustomStateComponent,
  } = props

  return (
    <Col className="gap-2">
      <div
        className={clsx('relative w-full')}
        style={{ paddingTop: '61.75%' /* (593 / 959) * 100 */ }}
      >
        <svg
          className="absolute left-0 top-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 959 593"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <pattern
              id="crossHatchRed"
              patternUnits="userSpaceOnUse"
              width={PATTERN_SIZE}
              height={PATTERN_SIZE}
            >
              <rect
                width={PATTERN_SIZE}
                height={PATTERN_SIZE}
                fill={REP_BACKGROUND}
              />
              {/* Horizontal line */}
              <line
                x1="0"
                y1="0"
                x2={PATTERN_SIZE}
                y2={PATTERN_SIZE}
                stroke={REP_CROSSHATCH}
                strokeWidth="2"
              />
              {/* Vertical line */}
              <line
                x1={PATTERN_SIZE}
                y1="0"
                x2="0"
                y2={PATTERN_SIZE}
                stroke={REP_CROSSHATCH}
                strokeWidth="2"
              />
            </pattern>
            <pattern
              id="crossHatchBlue"
              patternUnits="userSpaceOnUse"
              width={PATTERN_SIZE}
              height={PATTERN_SIZE}
            >
              {/* Horizontal line */}
              <rect
                width={PATTERN_SIZE}
                height={PATTERN_SIZE}
                fill={DEM_BACKGROUND}
              />
              <line
                x1="0"
                y1="0"
                x2={PATTERN_SIZE}
                y2={PATTERN_SIZE}
                stroke={DEM_CROSSHATCH}
                strokeWidth="2"
              />
              {/* Vertical line */}
              <line
                x1={PATTERN_SIZE}
                y1="0"
                x2="0"
                y2={PATTERN_SIZE}
                stroke={DEM_CROSSHATCH}
                strokeWidth="2"
              />
            </pattern>
          </defs>
          <g className="outlines">
            {Object.entries(DATA).map(([stateKey, data]) => {
              const stateContract = mapContractsDictionary[stateKey]
              return (
                <CustomStateComponent
                  key={stateKey}
                  stateKey={stateKey}
                  data={data}
                  stateContract={stateContract}
                  handleClick={handleClick}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  targetState={targetState}
                  hoveredState={hoveredState}
                />
              )
            })}
          </g>
        </svg>
      </div>
    </Col>
  )
}
