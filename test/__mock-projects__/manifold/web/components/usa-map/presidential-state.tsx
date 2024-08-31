import { Contract } from 'common/contract'
import { StateDataType } from './usa-map-data'
import { USAState } from './usa-state'
import { probToColor } from './state-election-map'

export type StateProps = {
  stateKey: string
  data: StateDataType
  stateContract: Contract | null
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | undefined | null
  hoveredState: string | undefined | null
}

export function PresidentialState(props: StateProps) {
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
        fill={probToColor(stateContract)}
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
  return <USAState key={stateKey} stateData={data} state={stateKey} />
}
