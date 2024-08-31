import clsx from 'clsx'
import { CPMMMultiContract, Contract, MultiContract } from 'common/contract'
import { CongressCenter } from 'web/public/custom-components/congress_center'
import { CongressHouse } from 'web/public/custom-components/congress_house'
import { CongressSenate } from 'web/public/custom-components/congress_senate'
import { WhiteHouse } from 'web/public/custom-components/whiteHouse'
import { ReactNode, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { useLiveContractWithAnswers } from 'web/hooks/use-contract'
import {
  ElectoralCollegeVisual,
  sortByDemocraticDiff,
} from './electoral-college-visual'
import {
  SwingStateContract,
  StateContract,
  extractBeforeGovernorsRace,
  extractStateFromPresidentContract,
  EmptyStateContract,
} from './state-contract'
import { USAMap } from './usa-map'
import { PresidentialState } from './presidential-state'
import { SenateCurrentOrContract, SenateState } from './senate-state'
import { SenateBar } from './senate-bar'
import { Governor } from 'web/public/custom-components/governor'
import { GovernorState } from './governor-state'
import {
  MapContractsDictionary,
  swingStates,
} from 'web/public/data/elections-data'
import { HouseTable } from './house-table'

type MapMode = 'presidency' | 'senate' | 'house' | 'governor'

export function HomepageMap(props: {
  rawPresidencyStateContracts: MapContractsDictionary
  rawSenateStateContracts: MapContractsDictionary
  rawGovernorStateContracts: MapContractsDictionary
  houseContract: MultiContract
}) {
  const {
    rawPresidencyStateContracts,
    rawSenateStateContracts,
    rawGovernorStateContracts,
    houseContract,
  } = props

  const presidencyContractsDictionary = Object.keys(
    rawPresidencyStateContracts
  ).reduce((acc, key) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    acc[key] = useLiveContractWithAnswers(rawPresidencyStateContracts[key]!)
    return acc
  }, {} as MapContractsDictionary)

  const sortedPresidencyContractsDictionary = sortByDemocraticDiff(
    presidencyContractsDictionary
  )

  const senateContractsDictionary = Object.keys(rawSenateStateContracts).reduce(
    (acc, key) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      acc[key] = useLiveContractWithAnswers(rawSenateStateContracts[key]!)
      return acc
    },
    {} as MapContractsDictionary
  )

  const governorContractsDictionary = Object.keys(
    rawGovernorStateContracts
  ).reduce((acc, key) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    acc[key] = useLiveContractWithAnswers(rawGovernorStateContracts[key]!)
    return acc
  }, {} as MapContractsDictionary)

  const liveHouseContract = useLiveContractWithAnswers(houseContract)

  const [mode, setMode] = useState<MapMode>('presidency')

  const [targetState, setTargetState] = useState<string | undefined | null>(
    undefined
  )

  const [hoveredState, setHoveredState] = useState<string | undefined | null>(
    undefined
  )

  function handleClick(newTargetState: string | undefined) {
    if (targetState && newTargetState == targetState) {
      setTargetState(undefined)
    } else {
      setTargetState(newTargetState)
    }
  }

  function onMouseEnter(hoverState: string) {
    setHoveredState(hoverState)
  }

  function onMouseLeave() {
    setHoveredState(undefined)
  }

  return (
    <Col className="bg-canvas-0 rounded-xl p-4">
      <MapTab mode={mode} setMode={setMode} />
      {mode === 'presidency' ? (
        <>
          <div className="pointer-events-none mx-auto font-semibold sm:text-lg">
            Which party will win the US Presidency?
          </div>
          <ElectoralCollegeVisual
            sortedContractsDictionary={sortedPresidencyContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
          />
          <Spacer h={4} />
          <USAMap
            mapContractsDictionary={presidencyContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
            CustomStateComponent={PresidentialState}
          />
          {(!!hoveredState || !!targetState) &&
          !swingStates.includes(hoveredState ?? targetState!) ? (
            <StateContract
              targetContract={
                presidencyContractsDictionary[
                  hoveredState! ?? targetState
                ] as Contract
              }
              targetState={targetState}
              setTargetState={setTargetState}
              customTitleFunction={extractStateFromPresidentContract}
              includeHead
            />
          ) : (
            <SwingStateContract
              hoveredState={hoveredState}
              setHoveredState={setHoveredState}
              targetState={targetState}
              sortedPresidencyContractsDictionary={
                sortedPresidencyContractsDictionary
              }
            />
          )}
        </>
      ) : mode === 'governor' ? (
        <>
          <div className="pointer-events-none mx-auto font-semibold sm:text-lg">
            Which party will win the Governor's Race?
          </div>
          <Spacer h={4} />
          <USAMap
            mapContractsDictionary={governorContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
            CustomStateComponent={GovernorState}
          />
          {!!hoveredState || !!targetState ? (
            <StateContract
              targetContract={
                governorContractsDictionary[
                  hoveredState! ?? targetState
                ] as Contract
              }
              targetState={targetState}
              setTargetState={setTargetState}
              customTitleFunction={extractBeforeGovernorsRace}
            />
          ) : (
            <EmptyStateContract />
          )}
        </>
      ) : mode === 'house' ? (
        <>
          <div className="pointer-events-none mx-auto font-semibold sm:text-lg">
            Which party will win the House?
          </div>
          <HouseTable
            liveHouseContract={liveHouseContract as CPMMMultiContract}
          />
          <Spacer h={4} />
        </>
      ) : (
        <>
          <div className="pointer-events-none mx-auto font-semibold sm:text-lg">
            Which party will win Senate?
          </div>
          <SenateBar
            mapContractsDictionary={senateContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
          />
          <Spacer h={4} />
          <USAMap
            mapContractsDictionary={senateContractsDictionary}
            handleClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            targetState={targetState}
            hoveredState={hoveredState}
            CustomStateComponent={SenateState}
          />
          {!!hoveredState || !!targetState ? (
            <SenateCurrentOrContract
              targetContract={
                senateContractsDictionary[
                  hoveredState! ?? targetState
                ] as Contract
              }
              targetState={targetState}
              hoveredState={hoveredState}
              setTargetState={setTargetState}
            />
          ) : (
            <EmptyStateContract />
          )}
        </>
      )}
    </Col>
  )
}

function MapTab(props: { mode: MapMode; setMode: (mode: MapMode) => void }) {
  const { mode, setMode } = props
  return (
    <Row className="text-ink-600 mx-auto mb-4 gap-6 text-sm transition-colors">
      <MapTabButton
        onClick={() => setMode('presidency')}
        isActive={mode === 'presidency'}
        icon={
          <WhiteHouse
            height={9}
            className={clsx(
              '-mb-3',
              mode === 'presidency'
                ? 'fill-primary-700'
                : 'fill-ink-500 group-hover:fill-ink-700 transition-colors'
            )}
          />
        }
        text="Presidency"
      />
      <Row className="relative">
        <MapTabButton
          onClick={() => setMode('senate')}
          isActive={mode === 'senate'}
          icon={
            <CongressSenate
              height={9}
              className={clsx(
                '-mb-3 -mr-6',
                mode === 'senate'
                  ? 'fill-primary-700'
                  : 'fill-ink-500 group-hover:fill-ink-700 transition-colors'
              )}
            />
          }
          text="Senate"
        />
        <CongressCenter
          height={9}
          className={clsx('-ml-[15.5px] -mr-[13.5px]', 'fill-ink-500')}
        />
        <MapTabButton
          onClick={() => setMode('house')}
          isActive={mode === 'house'}
          className="items-start"
          icon={
            <CongressHouse
              height={9}
              className={clsx(
                '-mb-3 -ml-6',
                mode === 'house'
                  ? 'fill-primary-700'
                  : 'fill-ink-500 group-hover:fill-ink-700 transition-colors'
              )}
            />
          }
          text="House"
        />
      </Row>
      <MapTabButton
        onClick={() => setMode('governor')}
        isActive={mode === 'governor'}
        icon={
          <Governor
            height={7}
            className={clsx(
              '-mb-2 mt-1',
              mode === 'governor'
                ? 'fill-primary-700'
                : 'fill-ink-500 group-hover:fill-ink-700 transition-colors'
            )}
          />
        }
        text="Governor"
      />
    </Row>
  )
}

function MapTabButton(props: {
  onClick: () => void
  isActive: boolean
  icon: ReactNode
  text: string
  className?: string
}) {
  const { onClick, isActive, icon, text, className } = props
  return (
    <button
      onClick={onClick}
      className={clsx(
        'group flex flex-col items-center transition-colors',
        isActive ? 'text-primary-700' : 'text-ink-500 hover:text-ink-700 ',
        className
      )}
    >
      {icon}
      <div
        className={clsx(
          isActive &&
            'underline decoration-2 underline-offset-[7px] transition-all',
          'mt-0.5'
        )}
      >
        {text}
      </div>
    </button>
  )
}
