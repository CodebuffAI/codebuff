import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRightIcon } from '@heroicons/react/solid'

import { Contract, contractPath } from 'common/contract'
import { Content } from '../widgets/editor'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { Spacer } from '../layout/spacer'

export const TEXT_MAX_HEIGHT = 120
export const NON_TEXT_MAX_HEIGHT = 120

export default function FeedContractCardDescription(props: {
  contract: Contract
  nonTextDescription?: boolean
}) {
  const { contract, nonTextDescription } = props
  const [isOverflowing, setIsOverflowing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // if content has images/embeds, have larger max height
  const maxHeight = nonTextDescription ? NON_TEXT_MAX_HEIGHT : TEXT_MAX_HEIGHT

  useEffectCheckEquality(() => {
    if (contentRef.current && contentRef.current.scrollHeight > maxHeight) {
      setIsOverflowing(true)
    }
  }, [contract.description])
  return (
    <div className="relative text-sm">
      <div
        ref={contentRef}
        className={`overflow-hidden`}
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <Spacer h={2} className="hidden sm:inline-block" />
        <Content size={'md'} content={contract.description} />
      </div>
      {isOverflowing && (
        <Col className="from-canvas-0 via-canvas-0 absolute bottom-0 left-0 right-0 h-12 justify-end bg-gradient-to-t via-30% to-transparent">
          <Row className="w-full justify-end">
            <Link
              href={contractPath(contract)}
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <span className=" text-ink-500 hover:text-primary-500 text-sm">
                Read more <ArrowRightIcon className="inline h-4 w-4" />
              </span>
            </Link>
          </Row>
        </Col>
      )}
    </div>
  )
}
