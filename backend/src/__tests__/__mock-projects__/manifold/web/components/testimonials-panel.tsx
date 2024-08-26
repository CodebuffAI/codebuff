import { useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import Link from 'next/link'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import clsx from 'clsx'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { MARKET_VISIT_BONUS_TOTAL, STARTING_BALANCE } from 'common/economy'
import SquiggleVertical from 'web/lib/icons/squiggle-vertical.svg'
import SquiggleHorizontal from 'web/lib/icons/squiggle-horizontal.svg'
import QuoteIcon from 'web/lib/icons/quote.svg'
import testimonials from '../public/testimonials/testimonials.json'
import { formatMoney } from 'common/util/format'

export function TestimonialsPanel() {
  const isMobile = useIsMobile()
  const [pageNumber, setPageNumber] = useState(0)
  const testimonialList = testimonials.testimonials
  const maxPage = testimonialList.length - 1
  const hasTestimonials = maxPage >= 0

  useEffect(() => {
    const newTimeoutId = setTimeout(
      () => setPageNumber(getNextPageNumber(pageNumber, maxPage)),
      8000
    )
    return () => clearTimeout(newTimeoutId)
  }, [pageNumber, maxPage])

  return (
    <>
      <div
        className={clsx(
          'flex h-96 w-full flex-col overflow-hidden drop-shadow-sm sm:mt-4 sm:h-64 sm:flex-row'
        )}
      >
        <div
          className={clsx(
            'relative z-30 h-[5%] w-full rounded-t-xl bg-indigo-200 sm:h-full sm:w-2/5 sm:rounded-l-xl sm:rounded-r-none'
          )}
        >
          <div className="group absolute left-8 top-8 z-30 sm:top-32">
            <Button
              className="absolute -left-1.5 bottom-1.5 z-10 transition-all ease-in-out focus:-left-0.5 focus:bottom-0.5 group-hover:-left-2 group-hover:bottom-2 focus:group-hover:-left-0.5 focus:group-hover:bottom-0.5"
              onClick={withTracking(firebaseLogin, 'landing page button click')}
              color="gradient-pink"
              size={isMobile ? 'xl' : '2xl'}
            >
              Sign up now!
            </Button>
            <div
              className={clsx(
                'text-ink-900 rounded-md bg-teal-200 dark:bg-teal-800',
                isMobile
                  ? 'px-6 py-2.5 text-base font-semibold'
                  : 'px-6 py-3 text-xl font-semibold'
              )}
            >
              Sign up now!
            </div>
          </div>
          <div className="absolute left-8 top-6 sm:top-48 md:left-8">
            <div className="hidden text-right text-sm text-black sm:inline">
              And get{'   '}
              <span className="relative z-10 font-semibold">
                {formatMoney(STARTING_BALANCE + MARKET_VISIT_BONUS_TOTAL)}
              </span>
              {'   '}
              to start trading!
            </div>
          </div>
        </div>
        <div className="relative h-[95%] w-full rounded-b-xl bg-indigo-700 sm:h-full sm:w-3/5 sm:rounded-l-none sm:rounded-r-xl">
          {hasTestimonials && (
            <Testimonial
              key={testimonialList[pageNumber].testimonial}
              {...testimonialList[pageNumber]}
            />
          )}
          {!isMobile && (
            <div className="absolute -left-0.5 bottom-0 z-20 h-full">
              <SquiggleVertical className={clsx('h-full text-indigo-200')} />
            </div>
          )}
          {isMobile && (
            <div className="absolute -top-0.5 right-0 z-10 w-full items-center">
              <SquiggleHorizontal className={clsx('text-indigo-200')} />
            </div>
          )}
          <div
            className={clsx(
              'absolute',
              isMobile ? 'right-0 h-full w-8' : 'bottom-0 h-6 w-full'
            )}
          >
            <div
              className={clsx(
                'z-50 ',
                isMobile ? 'ml-1 mt-32 flex flex-col' : 'ml-40 flex flex-row'
              )}
            >
              {testimonialList.map((testimonial, index) => (
                <PaginationCircle
                  key={testimonial.name}
                  currentPageNumber={pageNumber}
                  pageNumber={index}
                  onClick={() => {
                    setPageNumber(index)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function Testimonial(props: {
  testimonial: string
  name: string
  credit: string
  icon: string
  src: string
}) {
  const { testimonial, name, credit, icon, src } = props
  return (
    <div className="animate-slide-up-1 sm:animate-slide-in-1 absolute left-8 top-[20%] z-20 w-4/5 select-none text-white sm:top-2 sm:z-0">
      <QuoteIcon className="h-10 w-10 text-teal-200 dark:text-teal-800" />
      <div className="ml-8">{testimonial}</div>
      <Row className="justify-end">
        <QuoteIcon className="h-10 w-10 rotate-180 text-teal-200 dark:text-teal-800" />
      </Row>
      <Link href={src} target="_blank">
        <Row className="group mt-2 justify-end gap-2 ">
          <img
            src={icon}
            className="h-10 w-10 rounded-full drop-shadow-sm"
            alt=""
          />
          <Col className="text-sm">
            <div className="font-semibold transition-colors group-hover:text-teal-200">
              {name}
            </div>
            <div className="font-thin text-indigo-200">{credit}</div>
          </Col>
        </Row>
      </Link>
    </div>
  )
}

function getNextPageNumber(pageNumber: number, maxPage: number) {
  if (pageNumber + 1 <= maxPage) {
    return pageNumber + 1
  } else {
    return 0
  }
}

function PaginationCircle(props: {
  currentPageNumber: number
  pageNumber: number
  onClick: () => void
}) {
  const { currentPageNumber, pageNumber, onClick } = props
  return (
    <div onClick={() => onClick()} className="cursor-pointer p-1.5">
      <div
        className={clsx(
          'h-2 w-2 rounded-full transition-colors',
          currentPageNumber === pageNumber ? 'bg-white' : 'bg-indigo-400'
        )}
      />
    </div>
  )
}
