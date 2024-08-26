import clsx from 'clsx'
import { LiteGroup } from 'common/group'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { MAX_SHOWN, MAX_SHOWN_MOBILE } from '../search/user-results'
import { removeEmojis } from 'common/util/string'

export const BrowseTopicPills = (props: {
  topics: LiteGroup[]
  currentTopicSlug?: string
  className?: string
  onClick: (slug: string) => void
}) => {
  const { topics, className, currentTopicSlug, onClick } = props
  const [showMore, setShowMore] = useState<boolean>(false)
  const isMobile = useIsMobile()
  const MAX_INIT_TOPICS = isMobile ? MAX_SHOWN_MOBILE : MAX_SHOWN
  const shownTopics = showMore ? topics : topics.slice(0, MAX_INIT_TOPICS)

  return (
    <Col className={className}>
      <Row className={clsx('flex-wrap gap-1 text-sm')}>
        {shownTopics.map((g) => (
          <button
            key={'pill-' + g.slug}
            onClick={() => onClick(g.slug)}
            className={clsx(
              'rounded p-1',
              currentTopicSlug === g.slug
                ? 'bg-primary-700 text-white'
                : 'bg-ink-100 hover:bg-ink-200 text-ink-600 '
            )}
          >
            {removeEmojis(g.name)}
          </button>
        ))}
        {topics.length > MAX_INIT_TOPICS && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-primary-700 bg-ink-100 hover:bg-ink-200 flex flex-row items-center gap-1 rounded p-2 py-1"
          >
            {showMore
              ? `Show less`
              : `Show ${topics.length - MAX_INIT_TOPICS} more`}
          </button>
        )}
      </Row>
    </Col>
  )
}
