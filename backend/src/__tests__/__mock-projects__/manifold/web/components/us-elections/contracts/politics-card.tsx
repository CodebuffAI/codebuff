import clsx from 'clsx'
import { MultiContract, contractPath } from 'common/contract'
import Link from 'next/link'
import Router from 'next/router'
import { VisibilityIcon } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { useLiveContractWithAnswers } from 'web/hooks/use-contract'
import { track } from 'web/lib/service/analytics'
import { CandidatePanel } from './candidates-panel/candidates-panel'
import { SmallCandidatePanel } from './candidates-panel/small-candidate-panel'
import { PartyPanel } from './party-panel/party-panel'

export function PoliticsCard(props: {
  contract: MultiContract
  children?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  className?: string
  customTitle?: string
  titleSize?: 'lg'
  maxAnswers?: number
  viewType: 'PARTY' | 'CANDIDATE' | 'STATE' | 'SMALL CANDIDATE'
  excludeAnswers?: string[]
  panelClassName?: string
  includeHead?: boolean
}) {
  const {
    promotedData,
    trackingPostfix,
    customTitle,
    titleSize,
    className,
    maxAnswers,
    viewType,
    children,
    excludeAnswers,
    panelClassName,
    includeHead,
  } = props

  const contract = useLiveContractWithAnswers(props.contract)

  const path = contractPath(contract)

  const trackClick = () =>
    track(('click politics market card ' + trackingPostfix).trim(), {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
      isPromoted: !!promotedData,
    })

  function extractPhrase(inputString: string): string | null {
    const regex = /Who will win the (.+?)\?/
    const match = regex.exec(inputString)

    if (match && match[1]) {
      return match[1] // This is the extracted phrase.
    } else {
      return null // No match found.
    }
  }

  if (viewType == 'PARTY') {
    return (
      <Col
        className={clsx(
          className,
          'fade-in bg-canvas-0 group relative cursor-pointer gap-4 rounded-lg p-4'
        )}
      >
        <Link
          className={clsx(
            'hover:text-primary-700 grow items-start font-semibold transition-colors hover:underline sm:text-lg',
            titleSize === 'lg' && ' sm:text-3xl'
          )}
          href={path}
          onClick={trackClick}
        >
          {contract.question}
        </Link>

        {children}
        <ClickFrame
          onClick={(e) => {
            trackClick()
            Router.push(path)
            e.currentTarget.focus() // focus the div like a button, for style
          }}
        >
          <PartyPanel
            contract={contract}
            maxAnswers={maxAnswers ?? 2}
            includeNeedle
            includeHead={includeHead}
          />
        </ClickFrame>
      </Col>
    )
  }
  if (viewType == 'CANDIDATE') {
    return (
      <Col className={'group w-full flex-col gap-1.5 '}>
        {/* Title is link to contract for open in new tab and a11y */}
        <Link
          className={clsx(
            'hover:text-primary-700 grow items-start font-semibold transition-colors hover:underline sm:text-lg',
            titleSize === 'lg' && ' sm:text-3xl'
          )}
          href={path}
          onClick={trackClick}
        >
          <VisibilityIcon contract={contract} />{' '}
          {customTitle ? customTitle : extractPhrase(contract.question)}
        </Link>
        <CandidatePanel
          contract={contract}
          maxAnswers={8}
          excludeAnswers={excludeAnswers}
        />
      </Col>
    )
  }
  if (viewType == 'SMALL CANDIDATE') {
    return (
      <ClickFrame
        className={clsx(
          className,
          'fade-in bg-canvas-0 group relative cursor-pointer rounded-lg px-4 py-2'
        )}
        onClick={(e) => {
          trackClick()
          Router.push(path)
          e.currentTarget.focus() // focus the div like a button, for style
        }}
      >
        <Link
          className={clsx(
            'hover:text-primary-700 grow items-start font-semibold transition-colors hover:underline sm:text-lg ',
            titleSize === 'lg' && ' sm:text-3xl'
          )}
          href={path}
          onClick={trackClick}
        >
          {customTitle ?? contract.question}
        </Link>
        <Spacer h={4} />
        <SmallCandidatePanel
          contract={contract}
          maxAnswers={maxAnswers ?? 6}
          excludeAnswers={excludeAnswers}
          panelClassName={panelClassName}
        />
      </ClickFrame>
    )
  }
  return <></>
}
