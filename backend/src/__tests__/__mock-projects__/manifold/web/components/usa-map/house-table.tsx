import clsx from 'clsx'
import { Answer, MultiSort, sortAnswers } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { CPMMMultiContract } from 'common/contract'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BiCaretDown, BiCaretUp } from 'react-icons/bi'
import { house2024 } from 'web/public/data/house-data'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { HouseBar } from './house-bar'
import { HouseStatus, houseProbToColor } from './house-table-helpers'
import { DATA } from './usa-map-data'

export function HouseTable(props: { liveHouseContract: CPMMMultiContract }) {
  const { liveHouseContract } = props
  const [sort, setSort] = useState<MultiSort>('alphabetical')

  const answers = liveHouseContract.answers.map((a) => ({
    ...a,
    prob: getAnswerProbability(liveHouseContract, a.id),
  }))

  const sortedAnswers = useMemo(
    () => sortAnswers(liveHouseContract, answers, sort),
    [answers, sort]
  )

  const [targetAnswer, setTargetAnswer] = useState<string | undefined>(
    undefined
  )
  const [hoverAnswer, setHoverAnswer] = useState<string | undefined>(undefined)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (targetAnswer && scrollRef.current) {
      const selectedElement = document.getElementById(targetAnswer)
      if (selectedElement) {
        scrollRef.current.scrollTop =
          selectedElement.offsetTop - scrollRef.current.offsetTop
      }
    }
  }, [targetAnswer, sort])

  const handleClick = (newTargetAnswer: string | undefined) =>
    setTargetAnswer(newTargetAnswer)

  const onMouseEnter = (hoverAnswer: string) => setHoverAnswer(hoverAnswer)
  const onMouseLeave = () => setHoverAnswer(undefined)
  return (
    <>
      <HouseBar
        liveAnswers={answers}
        liveHouseContract={liveHouseContract}
        handleClick={handleClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        targetAnswer={targetAnswer}
        hoveredAnswer={hoverAnswer}
      />
      <Row className="text-ink-500 bg-canvas-0 sticky top-9 mb-1 w-full justify-between text-sm">
        <Row>
          <button
            className="group flex w-[88px] flex-row items-center sm:w-[184px]"
            onClick={() => {
              if (sort == 'alphabetical') {
                setSort('prob-asc')
              } else {
                setSort('alphabetical')
              }
            }}
          >
            District{' '}
            <BiCaretDown
              className={clsx(
                ' text-ink-300 h-4 w-4 transition-colors',
                sort == 'alphabetical'
                  ? 'text-ink-500'
                  : 'group-hover:text-ink-500'
              )}
            />
          </button>
          <div>Incumbent</div>
        </Row>
        <button
          className="sm:w-22 group flex w-[121px]  flex-row items-center sm:hidden sm:justify-end"
          onClick={() => {
            if (sort == 'prob-desc') {
              setSort('prob-asc')
            } else {
              setSort('prob-desc')
            }
          }}
        >
          Odds{' '}
          <div className="relative">
            <BiCaretUp
              className={clsx(
                ' absolute -top-[6px] h-4 w-4 transition-colors',
                sort == 'prob-asc'
                  ? 'text-ink-500'
                  : 'group-hover:text-ink-500 text-ink-200 dark:text-ink-300'
              )}
            />
            <BiCaretDown
              className={clsx(
                ' -mb-[2px] h-4 w-4 transition-colors',
                sort == 'prob-desc'
                  ? 'text-ink-500'
                  : 'group-hover:text-ink-500 text-ink-200 dark:text-ink-300'
              )}
            />
          </div>
        </button>
        <Row className="hidden gap-4 sm:flex">
          <button
            className="text-azure-600 dark:text-azure-400 group flex w-24 flex-row items-center"
            onClick={() => {
              if (sort == 'prob-asc') {
                setSort('prob-desc')
              } else {
                setSort('prob-asc')
              }
            }}
          >
            Democratic{' '}
            <BiCaretDown
              className={clsx(
                ' h-4 w-4 transition-colors',
                sort == 'prob-asc'
                  ? 'text-azure-600 dark:text-azure-400'
                  : 'group-hover:text-azure-600 group-hover:dark:text-azure-400 text-ink-200 dark:text-ink-300'
              )}
            />
          </button>
          <button
            className="w-22 text-sienna-600 dark:text-sienna-400 group flex flex-row items-center justify-end"
            onClick={() => {
              if (sort == 'prob-desc') {
                setSort('prob-asc')
              } else {
                setSort('prob-desc')
              }
            }}
          >
            Republican{' '}
            <BiCaretDown
              className={clsx(
                ' h-4 w-4 transition-colors',
                sort == 'prob-desc'
                  ? 'text-sienna-600 dark:text-sienna-400'
                  : 'group-hover:text-sienna-600 group-hover:dark:text-sienna-400 text-ink-200 dark:text-ink-300'
              )}
            />
          </button>
        </Row>
      </Row>
      <Col className="h-80 overflow-y-scroll scroll-smooth" ref={scrollRef}>
        {sortedAnswers.map((answer, index) => {
          return (
            <HouseRow
              key={answer.text}
              id={answer.text}
              houseAnswer={answer}
              contract={liveHouseContract}
              isSelected={targetAnswer === answer.text}
              isHovered={hoverAnswer === answer.text}
              handleClick={handleClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              isFirst={index === 0}
            />
          )
        })}
      </Col>
    </>
  )
}

function HouseRow(props: {
  houseAnswer: Answer
  contract: CPMMMultiContract
  id: string
  isSelected: boolean
  isHovered: boolean
  handleClick: (newTargetAnswer: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  isFirst?: boolean
}) {
  const {
    houseAnswer,
    contract,
    id,
    isSelected,
    isHovered,
    handleClick,
    onMouseEnter,
    onMouseLeave,
    isFirst,
  } = props
  const { state, number } = extractDistrictInfo(houseAnswer.text)
  const fullState = DATA[state].name
  const houseData = house2024[houseAnswer.text.replace(/\s+/g, ' ')]

  return (
    <Row
      id={id}
      className={clsx(
        'border-ink-300 justify-between border-b py-2 transition-colors sm:py-0',
        isSelected ? 'bg-canvas-50' : isHovered ? 'bg-canvas-50/50' : '',
        isFirst ? 'border-t' : ''
      )}
      onClick={() => handleClick(houseAnswer.text)}
      onMouseEnter={() => onMouseEnter(houseAnswer.text)}
      onMouseLeave={onMouseLeave}
    >
      <Row className="items-center">
        <div
          className=" mr-2 h-full w-4 transition-colors sm:h-8"
          style={{
            background: houseProbToColor(houseAnswer.prob),
          }}
        />
        <div className="hidden w-32 sm:flex">{fullState}</div>
        <div className=" w-8 sm:hidden">{state}</div>
        <div className="w-8">{number}</div>

        <div className="w-40">
          {houseData?.status == 'OPEN' ? (
            <span>
              OPEN
              {houseData?.incumbentShort ? (
                <span className="text-ink-600">
                  {' '}
                  ({houseData.incumbentShort}{' '}
                  {houseData?.incumbentParty ? (
                    <span className="text-ink-400">
                      {' ' + houseData.incumbentParty.slice(0, 1)}
                    </span>
                  ) : (
                    ''
                  )}
                  )
                </span>
              ) : (
                <></>
              )}
            </span>
          ) : (
            houseData?.incumbentShort ?? houseData?.status ?? ''
          )}
          <span>
            {houseData?.incumbentParty && !houseData?.status ? (
              <span className="text-ink-400">
                {' ' + houseData.incumbentParty.slice(0, 1)}
              </span>
            ) : (
              ''
            )}
          </span>
        </div>
      </Row>
      <HouseStatus contract={contract} answer={houseAnswer} />
    </Row>
  )
}

interface DistrictInfo {
  state: string
  number: string
}

function extractDistrictInfo(input: string): DistrictInfo {
  const parts = input.split(' ')[0].split('-')
  const state = parts[0].trim()
  const number = parts[1].slice(0, 2).trim()

  if (state.length !== 2 || isNaN(Number(number))) {
    throw new Error('Invalid input format')
  }

  return {
    state,
    number,
  }
}
