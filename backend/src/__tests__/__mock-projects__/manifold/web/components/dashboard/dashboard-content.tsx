import { useContracts } from 'web/hooks/use-contract'
import {
  DashboardNewsItemPlaceholder,
  MaybeDashboardNewsItem,
} from '../news/dashboard-news-item'
import { FeedContractCard } from '../contract/feed-contract-card'
import { useState } from 'react'
import { XCircleIcon } from '@heroicons/react/solid'
import { DashboardItem, DashboardQuestionItem } from 'common/dashboard'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { AddItemFloatyButton } from './add-dashboard-item'
import { LinkPreviews } from 'common/link-preview'
import { DashboardText } from './dashboard-text-card'
import { Contract } from 'common/contract'
import clsx from 'clsx'
import { TopicTag } from '../topics/topic-tag'
import { useGroupsFromIds } from 'web/hooks/use-group-supabase'

export const DashboardContent = (props: {
  items: DashboardItem[]
  previews?: LinkPreviews
  initialContracts?: Contract[]
  setItems?: (items: DashboardItem[]) => void
  topics: string[]
  setTopics?: (topics: string[]) => void
  isEditing?: boolean
  hideTopicLinks?: boolean
}) => {
  const {
    items,
    previews,
    initialContracts,
    isEditing,
    setItems,
    topics = [],
    setTopics,
    hideTopicLinks,
  } = props

  const questions = items.filter(
    (x): x is DashboardQuestionItem => x.type === 'question'
  )

  const slugs = questions.map((q) => q.slug)
  const contracts = useContracts(slugs, 'slug', initialContracts)

  const [hoverIndex, setHoverIndex] = useState<number>()
  const [hoverTop, setHoverTop] = useState<number>()

  return (
    <>
      {!isEditing ? (
        <div className="mb-4 flex flex-col gap-4">
          {items.map((item) => (
            <Card
              key={key(item)}
              item={item}
              previews={previews}
              contracts={contracts}
            />
          ))}
        </div>
      ) : (
        <DragDropContext
          onDragStart={() => window.navigator.vibrate?.(100)}
          onDragEnd={({ destination, source }) => {
            if (!destination) return
            const newItems = [...items]
            const [removed] = newItems.splice(source.index, 1)
            newItems.splice(destination.index, 0, removed)
            setItems?.(newItems)
          }}
        >
          <Droppable droppableId="dashboard">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="relative flex flex-col"
              >
                {items.map((item, index) => (
                  <Draggable
                    key={key(item)}
                    draggableId={key(item)}
                    index={index}
                  >
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="relative mb-4"
                        onMouseMove={(e) => {
                          if (
                            e.nativeEvent.offsetY <
                            e.currentTarget.offsetHeight / 2
                          ) {
                            setHoverIndex(index)
                            setHoverTop(e.currentTarget.offsetTop - 8)
                          } else {
                            setHoverIndex(index + 1)
                            setHoverTop(
                              e.currentTarget.offsetTop +
                                e.currentTarget.offsetHeight +
                                4
                            )
                          }
                        }}
                      >
                        <Card
                          item={item}
                          setItem={(newItem) => {
                            const newItems = [...items]
                            newItems[index] = newItem

                            setItems?.(newItems)
                          }}
                          previews={previews}
                          contracts={contracts}
                          isEditing
                        />
                        <RemoveButton
                          onClick={() => {
                            const newItems = [...items]
                            newItems.splice(index, 1)
                            setItems?.(newItems)
                          }}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {!snapshot.isDraggingOver &&
                  hoverIndex != null &&
                  hoverTop != null && (
                    <div
                      className="absolute -right-2 hidden -translate-y-1/2 translate-x-full transition-all md:block lg:-right-8"
                      style={{ top: hoverTop }}
                    >
                      <AddItemFloatyButton
                        key="floaty button"
                        position={hoverIndex}
                        items={items}
                        setItems={setItems}
                        topics={topics}
                        setTopics={setTopics}
                      />
                    </div>
                  )}

                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
      {!hideTopicLinks && topics.length > 0 && <TopicList topics={topics} />}
    </>
  )
}

const TopicList = (props: { topics: string[] }) => {
  const groups = useGroupsFromIds(props.topics)
  return (
    <div className="text-ink-700 text-md flex items-center gap-1 py-2">
      <span>See more questions:</span>
      {groups?.map((group) => (
        <TopicTag
          key={group.id}
          location={'dashboard page'}
          topic={group}
          className="bg-ink-100"
        />
      ))}
    </div>
  )
}

export const key = (item: DashboardItem) => {
  if (item.type === 'link') return item.url
  if (item.type === 'question') return item.slug
  return item.id
}

const Card = (props: {
  item: DashboardItem
  setItem?: (item: DashboardItem) => void
  previews?: LinkPreviews
  contracts: Contract[]
  isEditing?: boolean
}) => {
  const { item, setItem, previews, contracts, isEditing } = props
  if (item.type === 'link') {
    const preview = previews?.[item.url]

    return (
      <MaybeDashboardNewsItem
        url={item.url}
        preview={preview}
        className={clsx(isEditing && 'pointer-events-none')}
      />
    )
  }

  if (item.type === 'question') {
    const contract = contracts.find((c) => c.slug === item.slug)
    if (!contract) return <DashboardNewsItemPlaceholder pulse />
    return <FeedContractCard key={contract.id} contract={contract} />
  }

  if (item.type === 'text') {
    return (
      <DashboardText
        content={item.content}
        editing={isEditing}
        onSave={(content) => setItem?.({ ...item, content })}
      />
    )
  }

  // should be never
  return item
}

function RemoveButton(props: { onClick: () => void }) {
  return (
    <button
      className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0  transition-colors"
      onClick={props.onClick}
    >
      <XCircleIcon className="h-5 w-5" />
    </button>
  )
}
