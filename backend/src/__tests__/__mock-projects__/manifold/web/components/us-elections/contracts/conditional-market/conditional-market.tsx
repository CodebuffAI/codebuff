import clsx from 'clsx'
import { BinaryContract, Contract, contractPath } from 'common/contract'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { PolicyContractType } from 'web/public/data/policy-data'
import { getDisplayProbability } from 'common/calculate'
import { GoTriangleUp } from 'react-icons/go'
import { getPercent } from 'common/util/format'
import { ClickFrame } from 'web/components/widgets/click-frame'
import Router from 'next/router'
import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'

export function Policy(props: {
  policy: PolicyContractType
  className?: string
  isFirst: boolean
  isLast: boolean
}) {
  const { policy, className, isLast } = props
  const { harrisContract, trumpContract, title } = policy
  if (!harrisContract || !trumpContract) {
    return <></>
  }

  const harrisPath = contractPath(harrisContract)
  const trumpPath = contractPath(trumpContract)

  const harrisProbability = Number(
    getPercent(getDisplayProbability(harrisContract as BinaryContract)).toFixed(
      0
    )
  )

  const trumpProbability = Number(
    getPercent(getDisplayProbability(trumpContract as BinaryContract)).toFixed(
      0
    )
  )

  return (
    <Row
      className={clsx(
        ' border-ink-300 w-full justify-between',
        !isLast && 'border-b',
        className
      )}
    >
      <Row className="border-ink-300 w-full items-center">{title}</Row>
      <Row className="items-center">
        <ConditionalPercent
          path={harrisPath}
          contract={harrisContract}
          className="bg-azure-500/20 dark:bg-azure-500/10 justify-end  px-4 py-2"
          isLargerPercent={harrisProbability > trumpProbability}
        />
      </Row>
      <Row className="items-center">
        <ConditionalPercent
          path={trumpPath}
          contract={trumpContract}
          className="bg-sienna-500/20 dark:bg-sienna-500/10 justify-end  px-4 py-2"
          isLargerPercent={trumpProbability > harrisProbability}
        />
      </Row>
    </Row>
  )
}

function ConditionalPercent(props: {
  path: string
  contract: Contract
  className?: string
  isLargerPercent?: boolean
}) {
  const { path, contract, className, isLargerPercent = false } = props
  return (
    <ClickFrame
      className={clsx(
        className,
        'text-ink-700 group flex h-full w-[120px] flex-row items-center gap-2'
      )}
      onClick={() => {
        Router.push(path)
      }}
    >
      <Row>
        {isLargerPercent ? (
          <GoTriangleUp className="text-ink-400 dark:text-ink-500 my-auto h-4 w-4" />
        ) : (
          <div className="h-4 w-4" />
        )}
        <ContractStatusLabel
          contract={contract}
          className={clsx(
            isLargerPercent && 'font-bold',
            'group-hover:text-primary-700 w-10 transition-colors'
          )}
        />
      </Row>
      <BinaryBetButton contract={contract as BinaryContract} />
    </ClickFrame>
  )
}

export function MobilePolicy(props: {
  policy: PolicyContractType
  className?: string
}) {
  const { policy, className } = props
  const { harrisContract, trumpContract, title } = policy
  if (!harrisContract || !trumpContract) {
    return <></>
  }

  const { shortName: harrisShortName, photo: harrisPhoto } =
    CANDIDATE_DATA['Kamala Harris'] ?? {}

  const { shortName: trumpShortName, photo: trumpPhoto } =
    CANDIDATE_DATA['Donald Trump'] ?? {}

  const harrisPath = contractPath(harrisContract)
  const trumpPath = contractPath(trumpContract)

  const harrisProbability = Number(
    getPercent(getDisplayProbability(harrisContract as BinaryContract)).toFixed(
      0
    )
  )

  const trumpProbability = Number(
    getPercent(getDisplayProbability(trumpContract as BinaryContract)).toFixed(
      0
    )
  )
  return (
    <Col className={clsx('bg-canvas-0 mb-2 rounded-lg px-4 py-2', className)}>
      <div className="font-semibold">{title}</div>

      <Row className={clsx(' gap-0.5', className)}>
        <div className="grow">
          <Link
            href={harrisPath}
            className="hover:text-primary-700  text-ink-700 hover:underline"
          >
            <Row className="gap-2">
              <Image
                src={harrisPhoto}
                alt={harrisShortName}
                width={40}
                height={40}
                className="h-10 w-10 object-fill"
              />
              <div className="py-2">Harris wins</div>
            </Row>
          </Link>
        </div>
        <ConditionalPercent
          path={harrisPath}
          contract={harrisContract}
          className="items-center justify-center py-2"
          isLargerPercent={harrisProbability > trumpProbability}
        />
      </Row>
      <Row className={clsx(' gap-0.5', className)}>
        <div className="grow">
          <Link
            href={trumpPath}
            className="hover:text-primary-700  text-ink-700 hover:underline"
          >
            <Row className="gap-2">
              <Image
                src={trumpPhoto}
                alt={trumpShortName}
                width={40}
                height={40}
                className="h-10 w-10 object-fill"
              />
              <div className="py-2">Trump wins</div>
            </Row>
          </Link>
        </div>
        <ConditionalPercent
          path={trumpPath}
          contract={trumpContract}
          className="  items-center justify-center py-2"
          isLargerPercent={trumpProbability > harrisProbability}
        />
      </Row>
    </Col>
  )
}

export const BinaryBetButton = (props: { contract: BinaryContract }) => {
  const { contract } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  function closePanel() {
    setOutcome(undefined)
  }

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
        className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
      >
        <Link
          className={clsx(
            'hover:text-primary-700 mb-4 grow items-start font-semibold transition-colors hover:underline sm:text-lg'
          )}
          href={contractPath(contract)}
        >
          {contract.question}
        </Link>
        <BuyPanel
          contract={contract}
          initialOutcome={outcome}
          onBuySuccess={() => setTimeout(closePanel, 500)}
          location={'contract page answer'}
          inModal={true}
          alwaysShowOutcomeSwitcher
        />
      </Modal>

      <Button
        size="2xs"
        color="indigo-outline"
        className="bg-primary-50 h-fit w-fit"
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'binary panel' })
          setOutcome('YES')
        }}
      >
        {capitalize(TRADE_TERM)}
      </Button>
    </>
  )
}
