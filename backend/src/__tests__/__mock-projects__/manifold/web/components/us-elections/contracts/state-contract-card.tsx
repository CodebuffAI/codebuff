import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'
import { useState } from 'react'

import { Contract, MultiContract, contractPath } from 'common/contract'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { track } from 'web/lib/service/analytics'
import { DATA, StateDataType } from '../../usa-map/usa-map-data'
import { PartyPanel } from './party-panel/party-panel'

// This is not live updated from the object, so expects to be passed a contract with updated stuff
export function StateContractCard(props: {
  contract: Contract
  targetState?: string | null
  setTargetState: (state?: string) => void
  children?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  className?: string
  /** whether this card is small, like in card grids.*/
  small?: boolean
  hide?: () => void
  showGraph?: boolean
  hideBottomRow?: boolean
  customTitle?: string
  titleSize?: 'lg'
  barColor?: string
  includeHead?: boolean
}) {
  const {
    promotedData,
    trackingPostfix,
    className,

    customTitle,
    titleSize,
    contract,
    setTargetState,
    includeHead,
  } = props

  const path = contractPath(contract)

  const trackClick = () =>
    track(('click state card ' + trackingPostfix).trim(), {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
      isPromoted: !!promotedData,
    })

  return (
    <ClickFrame
      className={clsx(
        className,
        'relative rounded-xl',
        'cursor-pointer ',
        'fade-in group'
      )}
      onClick={(e) => {
        trackClick()
        Router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
    >
      <Col className={'w-full flex-col gap-1.5 '}>
        <Row className={'w-full justify-between'}>
          {/* Title is link to contract for open in new tab and a11y */}
          <Link
            className={clsx(
              'hover:text-primary-700 grow items-start font-semibold transition-colors hover:underline sm:text-lg ',
              titleSize === 'lg' && ' sm:text-3xl'
            )}
            href={path}
            onClick={trackClick}
          >
            <VisibilityIcon contract={contract} />{' '}
            {customTitle ? customTitle : contract.question}
          </Link>
          <Col className="grow-y justify-end">
            <ChooseStateButton setTargetState={setTargetState} />
          </Col>
        </Row>
      </Col>

      <div className="w-full overflow-hidden pt-2">
        <PartyPanel
          contract={contract as MultiContract}
          maxAnswers={3}
          includeHead={includeHead}
        />
      </div>
    </ClickFrame>
  )
}

export function ChooseStateButton(props: {
  setTargetState: (state?: string) => void
}) {
  const { setTargetState } = props
  const [openStateSelectModal, setOpenStateSelectModal] =
    useState<boolean>(false)
  return (
    <>
      <button
        className="bg-primary-100 text-primary-700 h-fit whitespace-nowrap rounded px-2 py-1 text-xs sm:hidden"
        onClick={() => {
          setOpenStateSelectModal(true)
        }}
      >
        Choose state
      </button>
      <Modal
        open={openStateSelectModal}
        setOpen={setOpenStateSelectModal}
        className={MODAL_CLASS}
      >
        {/* Select a state */}
        <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'text-left')}>
          {Object.values(DATA)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((state: StateDataType) => {
              return (
                <button
                  key={state.name}
                  onClick={() => {
                    setTargetState(state.abbreviation)
                    setOpenStateSelectModal(false)
                  }}
                  className="hover:bg-primary-100 flex w-full flex-row items-start  rounded px-4 py-2"
                >
                  {state.name}
                </button>
              )
            })}
        </Col>
      </Modal>
    </>
  )
}
