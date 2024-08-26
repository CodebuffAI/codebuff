import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useEffect, useState } from 'react'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { uniqBy } from 'lodash'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { LoadingCards } from 'web/components/contract/feed-contract-card'
import { GoodComment } from 'web/components/feed/good-comment'
import { Tabs } from 'web/components/layout/tabs'

const limit = 20
export default function CommentsPage() {
  return (
    <Page trackPageView={'comments page'}>
      <Tabs
        className={'p-2'}
        tabs={[
          {
            title: `GPT4-o's favorites`,
            content: <Comments justLikes={false} key={'claude'} />,
          },
          {
            title: `Manifold's favorites`,
            content: <Comments justLikes={true} key={'likes'} />,
            prerender: true,
          },
        ]}
      />
    </Page>
  )
}

const Comments = (props: { justLikes: boolean; key: string }) => {
  const { justLikes, key } = props
  const [page, setPage] = usePersistentInMemoryState(
    0,
    `comments-offset-${justLikes}`
  )
  const [dataInMemory, setDataInMemory] = usePersistentInMemoryState(
    { comments: [] as ContractComment[], contracts: [] as Contract[] },
    key
  )
  const { data } = useAPIGetter(
    'get-best-comments',
    {
      offset: page,
      justLikes: justLikes ? 1 : 0,
      limit,
      ignoreContractIds: dataInMemory.contracts.map((c) => c.id),
    },
    ['ignoreContractIds'],
    key
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
    const { comments, contracts } = data ?? {}
    setDataInMemory({
      comments: uniqBy([...dataInMemory.comments, ...(comments ?? [])], 'id'),
      contracts: uniqBy(
        [...dataInMemory.contracts, ...(contracts ?? [])],
        'id'
      ),
    })
  }, [JSON.stringify(data?.comments.map((c) => c.id))])
  const { comments, contracts } = dataInMemory

  const user = useUser()
  return (
    <Col className={'gap-2 p-4'}>
      {!comments.length && <LoadingCards />}
      {comments.map((comment) => {
        const contract = contracts.find(
          (contract) => contract.id === comment.contractId
        )
        if (!contract) return null

        return (
          <GoodComment
            key={comment.id + justLikes}
            contract={contract}
            comment={comment}
            trackingLocation={'comments page'}
            user={user}
          />
        )
      })}
      {comments.length > 0 && (
        <div className="relative">
          {loading && <LoadingIndicator />}
          <VisibilityObserver
            className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
            onVisibilityUpdated={(visible) => {
              if (visible && !loading) {
                setLoading(true)
                setPage(page + 1)
              }
            }}
          />
        </div>
      )}
    </Col>
  )
}
