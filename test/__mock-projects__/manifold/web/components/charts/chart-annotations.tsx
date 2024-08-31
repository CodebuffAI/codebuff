import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { FaArrowTrendDown, FaArrowTrendUp } from 'react-icons/fa6'
import toast from 'react-hot-toast'
import { TbPencilPlus } from 'react-icons/tb'

import {
  ControlledCarousel,
  useCarousel,
} from 'web/components/widgets/carousel'
import { ReadChartAnnotationModal } from 'web/components/annotate-chart'
import { useEvent } from 'web/hooks/use-event'
import { Avatar } from 'web/components/widgets/avatar'
import { UserHovercard } from '../user/user-hovercard'
import { useIsClient } from 'web/hooks/use-is-client'
import { type ChartAnnotation } from 'common/supabase/chart-annotations'
import { formatPercent } from 'common/util/format'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Button } from '../buttons/button'
import { PointerMode } from './helpers'

export const ChartAnnotations = (props: {
  annotations: ChartAnnotation[]
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
}) => {
  const { annotations, hoveredAnnotation, setHoveredAnnotation } = props
  const [carouselRef, setCarouselRef] = useState<HTMLDivElement | null>(null)
  const { onScroll, scrollLeft, scrollRight, atFront, atBack } =
    useCarousel(carouselRef)

  return (
    <ControlledCarousel
      className={clsx('relative', 'max-w-full gap-1')}
      ref={setCarouselRef}
      onScroll={onScroll}
      scrollLeft={scrollLeft}
      scrollRight={scrollRight}
      atFront={atFront}
      atBack={atBack}
    >
      {annotations.map((a) => (
        <ChartAnnotation
          key={a.id}
          annotation={a}
          hovered={a.id === hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
          carouselRef={carouselRef}
        />
      ))}
    </ControlledCarousel>
  )
}

const ChartAnnotation = (props: {
  annotation: ChartAnnotation
  hovered: boolean
  setHoveredAnnotation?: (id: number | null) => void
  carouselRef: HTMLDivElement | null
}) => {
  const { annotation, hovered, carouselRef, setHoveredAnnotation } = props
  const {
    text,
    user_avatar_url,
    user_id,
    creator_id,
    creator_avatar_url,
    id,
    prob_change,
    creator_username,
    event_time,
    user_username,
  } = annotation
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isClient = useIsClient()

  const scrollIntoView = useEvent(() => {
    const card = ref.current
    if (!hovered || !carouselRef || !card) return

    const cardLeft = card.offsetLeft
    const cardWidth = card.offsetWidth
    const carouselScrollLeft = carouselRef.scrollLeft
    const carouselWidth = carouselRef.offsetWidth

    const cardRight = cardLeft + cardWidth
    const scrollRight = carouselScrollLeft + carouselWidth

    if (cardLeft < carouselScrollLeft) {
      carouselRef.scroll({ left: cardLeft, behavior: 'smooth' })
    } else if (cardRight > scrollRight) {
      carouselRef.scroll({
        left: cardRight - carouselWidth,
        behavior: 'smooth',
      })
    }
  })

  useEffect(() => {
    if (hovered) scrollIntoView()
  }, [hovered])

  return (
    <Col
      className={clsx(
        'cursor-pointer rounded-md border-2',
        hovered ? 'border-indigo-600' : 'dark:border-ink-500 border-ink-200'
      )}
      ref={ref}
      onMouseOver={() => setHoveredAnnotation?.(id)}
      onMouseLeave={() => setHoveredAnnotation?.(null)}
      onClick={() => setOpen(true)}
    >
      <div className={'relative w-[175px] p-1'}>
        <div className={'h-16 overflow-hidden p-1 text-sm'}>
          <UserHovercard userId={user_id ?? creator_id}>
            <Avatar
              avatarUrl={user_avatar_url ?? creator_avatar_url}
              username={user_username ?? creator_username}
              noLink={true}
              size={'2xs'}
              className={'float-left mr-1 mt-0.5'}
            />
          </UserHovercard>
          <span className={'break-anywhere text-sm'}>{text}</span>
        </div>
        <div
          className={clsx(
            'bg-canvas-0 absolute bottom-[0.15rem] right-[0.15rem] justify-end rounded-sm py-0.5',
            prob_change !== null ? 'pl-2 pr-1' : 'px-1'
          )}
        >
          <Row className={'text-ink-500 items-center'}>
            {prob_change !== null && (
              <Row className={'gap-1 text-xs'}>
                <Row
                  className={clsx(
                    'items-center gap-1',
                    prob_change > 0 ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {prob_change > 0 ? (
                    <FaArrowTrendUp className={'h-3.5 w-3.5'} />
                  ) : (
                    <FaArrowTrendDown className={'h-3.5 w-3.5'} />
                  )}
                  {prob_change > 0 ? '+' : ''}
                  {formatPercent(prob_change)}
                </Row>{' '}
                on
              </Row>
            )}
            <span className={'ml-1 shrink-0 text-xs'}>
              {isClient &&
                new Date(event_time).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
            </span>
          </Row>
        </div>
      </div>
      {open && (
        <ReadChartAnnotationModal
          open={open}
          setOpen={setOpen}
          chartAnnotation={annotation}
        />
      )}
    </Col>
  )
}

export const EditChartAnnotationsButton = (props: {
  pointerMode: PointerMode
  setPointerMode: (mode: PointerMode) => void
}) => {
  const { pointerMode, setPointerMode } = props
  return (
    <Button
      color={pointerMode === 'annotate' ? 'yellow' : 'gray-white'}
      onClick={() => {
        setPointerMode(pointerMode === 'annotate' ? 'zoom' : 'annotate')
        if (pointerMode !== 'annotate')
          toast('Click on the chart to add an annotation.', {
            icon: <TbPencilPlus className={'h-5 w-5 text-green-500'} />,
          })
      }}
      size={'xs'}
    >
      <TbPencilPlus className={clsx('h-[1.2rem] w-[1.2rem]')} />
    </Button>
  )
}
