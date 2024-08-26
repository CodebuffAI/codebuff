import { Contract } from 'common/contract'
import {
  ChooseStateButton,
  StateContractCard,
} from 'web/components/us-elections/contracts/state-contract-card'
import { EmptyStateContract } from './state-contract'
import { probToColor } from './state-election-map'
import { DATA } from './usa-map-data'
import { USAState } from './usa-state'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { Col } from 'web/components/layout/col'
import { StateProps } from './presidential-state'
import { currentSenate, senate2024 } from 'web/public/data/senate-state-data'

export function SenateState(props: StateProps) {
  const {
    stateKey,
    data,
    stateContract,
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
  } = props
  if (!!stateContract) {
    return (
      <USAState
        key={stateKey}
        stateData={data}
        state={stateKey}
        fill={probToColor(
          stateContract,
          senate2024.filter((s) => s.state === stateKey)[0]
        )}
        onClickState={() => {
          handleClick(stateKey)
        }}
        onMouseEnterState={() => {
          onMouseEnter(stateKey)
        }}
        onMouseLeaveState={() => {
          onMouseLeave()
        }}
        selected={!!targetState && targetState == stateKey}
        hovered={!!hoveredState && hoveredState == stateKey}
      />
    )
  }
  return (
    <USAState
      key={stateKey}
      stateData={data}
      state={stateKey}
      fill={getSenateFill(stateKey)}
      patternTextColor="#ffff"
      onClickState={() => {
        handleClick(stateKey)
      }}
      onMouseEnterState={() => {
        onMouseEnter(stateKey)
      }}
      onMouseLeaveState={() => {
        onMouseLeave()
      }}
      selected={!!targetState && targetState == stateKey}
      hovered={!!hoveredState && hoveredState == stateKey}
    />
  )
}

function getSenateFill(stateKey: string) {
  // Find the state in the currentSenate array
  const statesSenate = currentSenate.find((state) => state.state === stateKey)

  if (!statesSenate) return undefined // State not found

  // Determine fill based on party affiliation
  if (
    statesSenate.party1 === 'Democrat' &&
    statesSenate.party2 === 'Democrat'
  ) {
    return 'url(#crossHatchBlue)' // Assuming 'crossHatchBlue' is for Democrats
  } else if (
    statesSenate.party1 === 'Republican' &&
    statesSenate.party2 === 'Republican'
  ) {
    return 'url(#crossHatchRed)' // Assuming 'crossHatchRed' is for Republicans
  } else {
    return 'url(#crossHatchPurple)' // One of each party
  }
}

export function SenateCurrentOrContract(props: {
  targetContract: Contract | null
  targetState?: string | null
  hoveredState?: string | null
  setTargetState: (state?: string) => void
}) {
  const { targetContract, targetState, setTargetState, hoveredState } = props
  if (!targetContract) {
    return (
      <SenateCurrentCard
        state={hoveredState ?? targetState}
        setTargetState={setTargetState}
      />
    )
  }

  return (
    <StateContractCard
      contract={targetContract}
      customTitle={
        extractStateFromSenateContract(targetContract.question) ??
        targetContract.question
      }
      titleSize="lg"
      targetState={targetState}
      setTargetState={setTargetState}
    />
  )
}

export function SenateCurrentCard(props: {
  state?: string | null
  setTargetState: (state?: string) => void
}) {
  const { state, setTargetState } = props
  if (!state) {
    return <EmptyStateContract />
  }
  const stateName = DATA[state].name
  const currentSenators = currentSenate.find((s) => s.state === state)
  const { name1, party1, name2, party2 } = currentSenators ?? {
    name1: '',
    party1: '',
    name2: '',
    party2: '',
  }

  return (
    <Col className=" h-[183px] w-full">
      <Row className="w-full justify-between">
        <div className=" font-semibold sm:text-lg">{stateName}</div>
        <ChooseStateButton setTargetState={setTargetState} />
      </Row>
      <div className="text-ink-700 text-sm">No senate election in 2024</div>
      <Spacer h={4} />
      <Col>
        <div className="text-ink-500 text-sm">Current Senators</div>
        <span
          className={
            party1 == 'Republican' ? 'text-sienna-700' : 'text-azure-700'
          }
        >
          <span className="font-semibold">{name1}</span>, <span>{party1}</span>
        </span>
        <span
          className={
            party1 == 'Republican' ? 'text-sienna-700' : 'text-azure-700'
          }
        >
          <span className="font-semibold">{name2}</span>, <span>{party2}</span>
        </span>
      </Col>
    </Col>
  )
}

export function extractStateFromSenateContract(
  sentence: string
): string | undefined {
  // Adjusted regex to capture additional info in parentheses more flexibly
  const regex = /race in (.+?) in 2024(?: \((.+?)\))?/
  const match = sentence.match(regex)

  // If a match is found and has additional details, concatenate them; otherwise, return just the state
  return match ? (match[2] ? `${match[1]} (${match[2]})` : match[1]) : undefined
}
