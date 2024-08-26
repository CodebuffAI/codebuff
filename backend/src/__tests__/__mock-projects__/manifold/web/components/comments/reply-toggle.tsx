import clsx from 'clsx'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import { formatMoney } from 'common/util/format'

export function ReplyToggle(props: {
  seeReplies: boolean
  numComments: number
  childrenBountyTotal?: number
  onSeeReplyClick?: () => void
}) {
  const { seeReplies, numComments, childrenBountyTotal, onSeeReplyClick } =
    props

  if (numComments === 0 && !childrenBountyTotal) return null

  return (
    <button
      className="text-ink-500 hover:text-primary-500 flex items-center gap-2 text-sm transition-colors"
      onClick={onSeeReplyClick}
    >
      <div
        className={clsx(
          numComments === 0 ? 'hidden' : 'flex select-none items-center gap-1'
        )}
      >
        <TriangleDownFillIcon
          className={clsx(
            'h-2 w-2 transition-transform',
            seeReplies ? '' : 'rotate-[-60deg]'
          )}
        />
        {numComments} {numComments === 1 ? 'reply' : 'replies'}
      </div>
      {childrenBountyTotal != null && childrenBountyTotal > 0 && (
        <span className="text-teal-600 opacity-70">
          +{formatMoney(childrenBountyTotal)}
        </span>
      )}
    </button>
  )
}
