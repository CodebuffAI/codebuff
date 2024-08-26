import { Topic, MAX_GROUPS_PER_MARKET } from 'common/group'
import toast from 'react-hot-toast'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { TopicSelector } from './topic-selector'
import { useState } from 'react'
import { XIcon } from '@heroicons/react/outline'
import { TopicTag } from 'web/components/topics/topic-tag'

export function ContractTopicsList(props: {
  canEdit: boolean
  canEditTopic: (groupId: string) => boolean
  topics: Topic[]
  addTopic: (topic: Topic) => Promise<void>
  removeTopic: (topic: Topic) => Promise<void>
}) {
  const { canEditTopic, canEdit, topics, addTopic, removeTopic } = props

  const [error, setError] = useState<string>('')

  return (
    <Col className={'gap-2'}>
      <span className={'text-primary-700 text-xl'}>Topics</span>
      <Col className="h-96 justify-between overflow-auto">
        <Col>
          {topics.length === 0 && (
            <Col className="text-ink-400">No topics yet...</Col>
          )}
          <Row className="my-2 flex-wrap gap-3">
            {topics.map((t) => {
              return (
                <TopicTag
                  location={'categories list'}
                  key={t.id}
                  topic={t}
                  className="bg-ink-100"
                >
                  {canEditTopic(t.id) && (
                    <button
                      onClick={() => {
                        toast.promise(removeTopic(t), {
                          loading: `Removing question from "${t.name}"`,
                          success: `Successfully removed question from "${t.name}"!`,
                          error: `Error removing category. Try again?`,
                        })
                      }}
                    >
                      <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
                    </button>
                  )}
                </TopicTag>
              )
            })}
          </Row>
          {canEdit && (
            <Col className={'my-2 items-center justify-between p-0.5'}>
              <Row className="text-ink-400 w-full justify-start text-sm">
                Add topics
              </Row>
              <TopicSelector
                selectedIds={topics.map((g) => g.id)}
                max={MAX_GROUPS_PER_MARKET}
                setSelectedGroup={(topic) =>
                  topic &&
                  addTopic(topic).catch((e) => {
                    console.error(e.message)
                    setError(e.message)
                  })
                }
              />
              <span className={'text-error text-sm'}>{error}</span>
            </Col>
          )}
        </Col>
      </Col>
    </Col>
  )
}
