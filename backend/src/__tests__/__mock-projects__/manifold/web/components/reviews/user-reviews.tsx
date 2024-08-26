import { useQuery } from 'web/hooks/use-query'
import { getUserReviews } from 'web/lib/supabase/reviews'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Review } from './review'
import { Col } from '../layout/col'
import { useState } from 'react'
import { Row } from '../layout/row'
import { StarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { InfoTooltip } from '../widgets/info-tooltip'

function shorten(num: number) {
  return Math.ceil(num * 100) / 100
}

export function UserReviews(props: {
  userId: string
  rating: number
  averageRating: number
  reviewCount: number
}) {
  const { userId, rating, averageRating, reviewCount } = props
  const [open, setOpen] = useState(false)
  const shortenedRating = shorten(rating)
  return (
    <>
      <Row
        onClick={() => setOpen(true)}
        className=" text-primary-600 group cursor-pointer items-center gap-0.5 text-lg transition-colors sm:text-xl"
      >
        {shortenedRating}
        <StarIcon className="h-5 w-5" />
        <div className="text-ink-600 text-sm group-hover:underline">
          (<span>{reviewCount}</span>)
        </div>
      </Row>
      <UserReviewsModal
        userId={userId}
        rating={shortenedRating}
        averageRating={averageRating}
        open={open}
        setOpen={setOpen}
      />
    </>
  )
}

function RatingDisplay(props: {
  rating: number
  title: string
  tooltip: string
  className?: string
  ratingClassName?: string
}) {
  const { rating, title, tooltip, className, ratingClassName } = props
  return (
    <Col className={clsx(className, 'text-ink-600 items-center text-xs')}>
      <Row className="gap-0.5">
        {title} <InfoTooltip size={'sm'} text={tooltip} />
      </Row>
      <Row
        className={clsx(
          'sm:text-xl,ratingClassName items-center gap-0.5 text-lg font-semibold',
          ratingClassName
        )}
      >
        {rating}
        <StarIcon className="text-ink-600 h-5 w-5 font-normal" />
      </Row>
    </Col>
  )
}
export function UserReviewsModal(props: {
  userId: string
  rating: number
  averageRating: number
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { userId, rating, averageRating, open, setOpen } = props

  const reviews = useQuery(() => getUserReviews(userId))

  const shortenedAverage = shorten(averageRating)

  return (
    <Modal open={open} setOpen={setOpen}>
      <div className="bg-canvas-0 max-h-[90vh] overflow-y-auto rounded p-6">
        <Title className="mb-0 sm:mb-0">Reviews</Title>
        <Row className="-mt-4 mb-4 gap-1">
          <RatingDisplay
            title="Rating"
            tooltip={`Manifold's weighted rating`}
            rating={rating}
            className="w-1/2"
            ratingClassName={'text-primary-600'}
          />
          <div className="bg-ink-300 grow-y flex w-0.5" />
          <RatingDisplay
            title="Average"
            tooltip={`The average of all your ratings`}
            rating={shortenedAverage}
            className="w-1/2"
          />
        </Row>

        {reviews.isLoading && <LoadingIndicator className="text-center" />}

        <Col className="divide-ink-300 divide-y-2">
          {reviews.data?.map((review, i) => (
            <Review
              key={i}
              userId={review.reviewer_id}
              rating={review.rating}
              created={review.created_time}
              contractId={review.market_id}
              text={review.content as any}
            />
          ))}
        </Col>
      </div>
    </Modal>
  )
}
