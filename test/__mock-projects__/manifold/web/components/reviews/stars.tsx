import { StarIcon as StarOutline } from '@heroicons/react/outline'
import { StarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { range } from 'lodash'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useMutation } from 'web/hooks/use-mutation'
import { leaveReview } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { GradientContainer } from '../widgets/gradient-container'

export type Rating = 0 | 1 | 2 | 3 | 4 | 5

export const ReviewPanel = (props: {
  marketId: string
  author: string
  className?: string
  onSubmit: (rating: Rating) => void
}) => {
  const { marketId, author, className, onSubmit } = props
  const [rating, setRating] = useState<Rating>(0)

  const editor = useTextEditor({
    size: 'sm',
    placeholder: 'Add details (optional)',
  })

  const send = useMutation(leaveReview, {
    onError: (e) => {
      toast.error((e as any).message ?? 'Failed to save review. Try again.')
    },
    onSuccess: () => {
      toast.success('Review saved!')
    },
  })

  return (
    <GradientContainer className={className}>
      <Col className="items-center gap-2">
        <h2 className="text-primary-500 text-xl">Rate {author}</h2>
        <span className="text-sm italic">
          Did they honestly resolve the question?
        </span>

        <StarRating
          rating={rating}
          onClick={(rating: Rating) => {
            setRating(rating)
          }}
          className="my-3"
        />
        <TextEditor editor={editor} />
        <Button
          className="self-end"
          disabled={rating == 0}
          loading={send.isLoading}
          onClick={() => {
            send
              .mutate({ marketId, rating, review: editor?.getJSON() })
              .then(() => {
                onSubmit(rating)
              })
          }}
        >
          Submit
        </Button>
      </Col>
    </GradientContainer>
  )
}

export const StarRating = (props: {
  rating: Rating
  onClick: (rating: Rating) => void
  className?: string
}) => {
  const { rating, onClick, className } = props
  const [hoverRating, setHoverRating] = useState<number>(0)

  return (
    <div className={clsx('inline-flex align-top', className)}>
      {range(0, 5).map((i) => {
        return (
          <button
            className="relative"
            key={i}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onClick((i + 1) as Rating)
            }}
            onMouseEnter={() => setHoverRating(i + 1)}
            onMouseLeave={() => setHoverRating(0)}
          >
            {(i + 1 <= rating || i + 1 <= hoverRating) && (
              <StarIcon
                className="absolute h-8 w-8 text-yellow-500"
                viewBox={`0 0 20 20`}
              />
            )}
            <StarOutline className="text-ink-300 h-8 w-8" />
          </button>
        )
      })}
    </div>
  )
}

export const StarDisplay = (props: { rating: Rating; className?: string }) => {
  const { rating, className } = props

  return (
    <div className={clsx('inline-flex align-top', className)}>
      {range(0, 5).map((i) => {
        return (
          <div className="relative" key={i}>
            {i + 1 <= rating && (
              <StarIcon
                className="absolute h-4 w-4 text-yellow-500"
                viewBox={`0 0 20 20`}
              />
            )}
            <StarOutline className="text-ink-300 h-4 w-4" />
          </div>
        )
      })}
    </div>
  )
}
