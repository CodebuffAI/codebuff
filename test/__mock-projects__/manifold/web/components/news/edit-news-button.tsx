import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import { XIcon } from '@heroicons/react/outline'
import { BaseDashboard } from 'common/dashboard'
import { uniqBy } from 'lodash'
import { useEffect, useRef, useState } from 'react'
import { api, supabaseSearchDashboards } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Avatar } from '../widgets/avatar'
import { Input } from '../widgets/input'
import { Subtitle } from '../widgets/subtitle'
import { Title } from '../widgets/title'
import { Headline } from 'common/news'
import { DashboardEndpoints } from 'web/components/dashboard/dashboard-page'

export const EditNewsButton = (props: {
  defaultDashboards: Headline[]
  endpoint: DashboardEndpoints
}) => {
  const { defaultDashboards, endpoint } = props
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        // copy pasta'ed from header
        className="outline-none' max-w-[40ch] text-ellipsis whitespace-nowrap px-3 py-2 text-sm font-bold text-purple-600 hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-900 dark:hover:text-purple-400"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
      {open && (
        <EditNewsModal
          endpoint={endpoint}
          setOpen={setOpen}
          defaultDashboards={defaultDashboards}
        />
      )}
    </>
  )
}

const EditNewsModal = (props: {
  setOpen(open: boolean): void
  defaultDashboards: Headline[]
  endpoint: DashboardEndpoints
}) => {
  const { setOpen, defaultDashboards, endpoint } = props

  const [dashboards, setDashboards] = useState(defaultDashboards)

  const onDragEnd = (result: any) => {
    const { destination, source } = result
    if (!destination) return
    const newDashboards = [...dashboards]
    const [removed] = newDashboards.splice(source.index, 1)
    newDashboards.splice(destination.index, 0, removed)
    setDashboards(newDashboards)
  }

  return (
    <Modal
      setOpen={setOpen}
      open
      size="sm"
      className="bg-canvas-0 rounded-lg p-4"
    >
      <Col>
        <div className="flex items-start justify-between">
          <Title>News tabs</Title>
          <Button
            color="red"
            onClick={() => {
              api('set-news', {
                dashboardIds: dashboards.map((d) => d.id),
                endpoint,
              })
              setOpen(false)
            }}
          >
            Save for everyone
          </Button>
        </div>
        {/* search */}
        <DashboardFinder
          onSelect={(d) => {
            setDashboards((dashboards) =>
              uniqBy(
                [...dashboards, { id: d.id, title: d.title, slug: d.slug }],
                'id'
              )
            )
          }}
          selected={dashboards.map((d) => d.id)}
        />

        <Subtitle>Tab order</Subtitle>
        <DragDropContext
          onDragStart={() => window.navigator.vibrate?.(100)}
          onDragEnd={onDragEnd}
        >
          <Droppable droppableId="news-order">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="relative flex flex-col gap-1"
              >
                {dashboards.map((d, i) => (
                  <Draggable key={d.id} draggableId={d.id} index={i}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="bg-primary-100 flex justify-between rounded text-sm"
                      >
                        <div
                          className="grow px-2 py-1"
                          {...provided.dragHandleProps}
                        >
                          {d.title}
                        </div>
                        <button
                          className="text-ink-500 hover:text-ink-700 px-1 transition-colors"
                          onClick={() =>
                            setDashboards(
                              dashboards.filter((dd) => dd.id !== d.id)
                            )
                          }
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </Col>
    </Modal>
  )
}

const DashboardFinder = (props: {
  onSelect(dashboard: BaseDashboard): void
  selected: string[]
}) => {
  const { onSelect, selected } = props

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([] as BaseDashboard[])

  const requestId = useRef(0)
  useEffect(() => {
    const id = ++requestId.current
    const load = async () => {
      const results = await supabaseSearchDashboards({
        term: query,
        offset: 0,
        limit: 50,
      })
      if (id === requestId.current) {
        setResults(results)
      }
    }
    load()
  }, [query])

  return (
    <div className="flex flex-col">
      <Input
        type="text"
        inputMode="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search and add a dashboard"
      />

      <div className="mt-2 flex max-h-96 flex-col overflow-y-auto">
        {results
          .filter((d) => !selected.includes(d.id))
          .map((d) => (
            <button
              className="hover:bg-primary-200 flex items-start gap-2 rounded px-3 py-2 transition-colors"
              onClick={() => onSelect(d)}
              key={d.id}
            >
              <Avatar
                username={d.creatorUsername}
                avatarUrl={d.creatorAvatarUrl}
                size="2xs"
                className="mt-1"
              />
              <div className="text-left">{d.title}</div>
            </button>
          ))}
      </div>
    </div>
  )
}
