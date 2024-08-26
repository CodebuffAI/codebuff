import { DATA } from './usa-map-data'
import { Row } from 'web/components/layout/row'
import { probToColor } from './state-election-map'
import { Col } from 'web/components/layout/col'
import { ChevronDownIcon } from '@heroicons/react/solid'
import { HIGHLIGHTED_OUTLINE_COLOR, SELECTED_OUTLINE_COLOR } from './usa-map'
import clsx from 'clsx'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import {
  MapContractsDictionary,
  StateElectionMarket,
} from 'web/public/data/elections-data'

export function ElectoralCollegeVisual(props: {
  sortedContractsDictionary: MapContractsDictionary
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | null | undefined
  hoveredState: string | null | undefined
}) {
  const {
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
    sortedContractsDictionary,
  } = props

  const isMobile = useIsMobile()
  return (
    <Col className="mt-2 w-full text-xs sm:text-base">
      <Col className="text-ink-700 mx-auto items-center">
        <div className="-mb-1">270 to win</div>
        <ChevronDownIcon className="h-5 w-5" />
      </Col>
      <Row className="overflow-none relative gap-[1px] rounded sm:gap-0.5">
        {Object.entries(sortedContractsDictionary).map(
          ([stateKey, contract], index) => {
            const fill = probToColor(contract) ?? ''
            const isHovered = hoveredState === stateKey
            const selected = targetState === stateKey
            return (
              <div
                key={contract!.id}
                className="relative h-5 transition-all"
                style={{
                  backgroundColor: fill,
                  width: `${(DATA[stateKey].electoralVotes / 538) * 100}%`,
                  outline:
                    isHovered || selected
                      ? `${isMobile ? '1px' : '2px'} solid ${
                          selected
                            ? SELECTED_OUTLINE_COLOR
                            : HIGHLIGHTED_OUTLINE_COLOR
                        }`
                      : 'none',
                }}
                onClick={() => handleClick(stateKey)}
                onMouseEnter={() => onMouseEnter(stateKey)}
                onMouseLeave={onMouseLeave}
              >
                {(isHovered || (selected && !hoveredState)) && (
                  <Row
                    className={clsx(
                      '0 text-ink-700 absolute top-6 z-20 gap-1 rounded py-1 transition-all',
                      index < 5
                        ? 'left-0'
                        : index > 45
                        ? 'right-0'
                        : '-left-[2rem]'
                    )}
                  >
                    <div className="whitespace-nowrap font-semibold">
                      {DATA[stateKey].abbreviation},
                    </div>
                    <div className="whitespace-nowrap">
                      {DATA[stateKey].electoralVotes} votes
                    </div>
                  </Row>
                )}
              </div>
            )
          }
        )}
      </Row>
    </Col>
  )
}

export function sortByDemocraticDiff(
  unsortedContractsDictionary: MapContractsDictionary,
  data?: StateElectionMarket[]
): MapContractsDictionary {
  return Object.entries(unsortedContractsDictionary)
    .map(([state, contract]) => {
      if (contract?.mechanism !== 'cpmm-multi-1')
        return { state, contract, ratio: 0 }
      const democraticAnswer = contract?.answers.find(
        (answer) =>
          answer.text === 'Democratic Party' ||
          answer.text.includes('Democratic Party')
      )
      const republicanAnswer = contract?.answers.find(
        (answer) =>
          answer.text === 'Republican Party' ||
          answer.text.includes('Republican Party')
      )
      let otherDem = null
      let otherRep = null
      if (
        data &&
        data.filter((d) => d.state === state) &&
        data.filter((d) => d.state === state)[0].otherParty
      ) {
        const otherAnswer = contract?.answers.find(
          (answer) => answer.text == 'Other'
        )
        if (
          data.filter((d) => d.state === state)[0].otherParty ==
          'Democratic Party'
        ) {
          otherDem = otherAnswer
        }
        if (
          data.filter((d) => d.state === state)[0].otherParty ==
          'Republican Party'
        ) {
          otherRep = otherAnswer
        }
      }
      const diff =
        democraticAnswer && republicanAnswer
          ? democraticAnswer.prob +
            (otherDem ? otherDem.prob : 0) -
            (republicanAnswer.prob + (otherRep ? otherRep.prob : 0))
          : 0
      return { state, contract, diff }
    })
    .sort((a, b) => b.diff! - a.diff!)
    .reduce((sortedData, data) => {
      sortedData[data.state] = data?.contract
      return sortedData
    }, {} as MapContractsDictionary)
}
