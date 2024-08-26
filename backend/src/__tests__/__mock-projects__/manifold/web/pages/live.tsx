import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ActivityLog } from 'web/components/activity-log'
import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import { TRADE_TERM } from 'common/envs/constants'

export default function LivePage() {
  const [topicSlug, setTopicSlug] = usePersistentQueryState('topic', '')
  const topicFromRouter = useTopicFromRouter(topicSlug)
  return (
    <Page trackPageView={'live page'}>
      <SEO
        title="Live"
        description={`Watch all site activity live, including ${TRADE_TERM}s, comments, and new questions.`}
        url="/live"
      />

      <Col className="w-full max-w-3xl gap-4 self-center sm:pb-4">
        <Row
          className={
            'w-full items-center justify-between pt-1 sm:justify-start sm:gap-4'
          }
        >
          <span className="text-primary-700 line-clamp-1 shrink px-1 text-2xl">
            {topicFromRouter ? topicFromRouter.name : 'Site'} activity feed
          </span>
          <TopicSelector
            setSelectedGroup={(group) => {
              setTopicSlug(group.slug)
            }}
            className={'!w-40 shrink-0 sm:!w-56'}
            placeholder={'Filter by topic'}
          />
        </Row>
        <ActivityLog
          count={30}
          topicSlugs={topicSlug ? [topicSlug] : undefined}
        />
      </Col>
    </Page>
  )
}
