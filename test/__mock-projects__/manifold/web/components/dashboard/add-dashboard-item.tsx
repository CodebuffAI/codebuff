import { DashboardItem } from 'common/dashboard'
import { DashboardAddContract } from './dashboard-add-contract'
import { DashboardAddLink } from './dashboard-add-link'
import {
  DocumentIcon,
  ExternalLinkIcon,
  HashtagIcon,
  PlusIcon,
} from '@heroicons/react/outline'
import { useState } from 'react'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { BsQuestionLg } from 'react-icons/bs'
import { Button } from '../buttons/button'
import { ControlledTabs } from '../layout/tabs'
import clsx from 'clsx'
import { DashboardSetTopics } from './dashboard-set-topics'
import { Col } from '../layout/col'

export function AddItemCard(props: {
  items: DashboardItem[]
  setItems: (items: DashboardItem[]) => void
  topics: string[]
  setTopics: (topics: string[]) => void
}) {
  const { items, setItems, topics, setTopics } = props

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<0 | 1 | 2 | 3>(0)

  return (
    <div className="border-ink-200 flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-2">
      <div className="text-ink-500 text-sm">Add item</div>
      <div className="grid w-full grid-cols-2 gap-2 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
        <Button
          color="gray-outline"
          className="gap-1"
          onClick={() => {
            setTab(0)
            setOpen(true)
          }}
        >
          <BsQuestionLg className="h-5 w-5" />
          Question
        </Button>
        <Button
          color="gray-outline"
          className="gap-1"
          onClick={() => {
            setTab(1)
            setOpen(true)
          }}
        >
          <ExternalLinkIcon className="h-5 w-5" />
          Link
        </Button>

        <Button
          color="gray-outline"
          className="gap-1"
          onClick={() => {
            setItems([newTextItem(), ...items])
          }}
        >
          <DocumentIcon className="h-5 w-5" />
          Text
        </Button>
        <Button
          color="gray-outline"
          className="gap-1"
          onClick={() => {
            setTab(3)
            setOpen(true)
          }}
        >
          <HashtagIcon className="h-5 w-5" />
          Topic
        </Button>
      </div>
      <AddDashboardModal
        open={open}
        setOpen={setOpen}
        tab={tab}
        setTab={setTab}
        insertItems={(newItems) => {
          setItems([...newItems, ...items])
        }}
        topics={topics}
        setTopics={setTopics}
      />
    </div>
  )
}

const AddDashboardModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  tab: 0 | 1 | 2 | 3
  setTab: (tab: 0 | 1 | 2 | 3) => void
  insertItems: (items: DashboardItem[]) => void
  topics: string[]
  setTopics: (topics: string[]) => void
}) => {
  const { open, setOpen, tab, setTab, insertItems, topics, setTopics } = props

  return (
    <Modal open={open} setOpen={setOpen} size="lg">
      <Col
        className={clsx(MODAL_CLASS, 'flex h-[70vh] flex-col !items-stretch')}
      >
        <ControlledTabs
          activeIndex={tab}
          onClick={(title, index) => {
            setTab(index as 0 | 1 | 2 | 3)
            if (title === 'add text') {
              insertItems([newTextItem()])
              setOpen(false)
            }
          }}
          tabs={[
            {
              title: 'Add question',
              content: (
                <DashboardAddContract
                  addQuestions={(qs) => {
                    insertItems(qs)
                    setOpen(false)
                  }}
                />
              ),
            },
            {
              title: 'Add link',
              content: (
                <DashboardAddLink
                  addLink={(link) => {
                    insertItems(link ? [link] : [])
                    setOpen(false)
                  }}
                />
              ),
            },
            {
              title: 'Add text',
              content: null,
            },
            {
              title: 'Edit topics',
              content: (
                <DashboardSetTopics
                  topics={topics}
                  setTopics={setTopics}
                  onClose={() => setOpen(false)}
                />
              ),
            },
          ]}
        />
      </Col>
    </Modal>
  )
}

const newTextItem = () =>
  ({
    id: Math.random().toString(),
    type: 'text',
    content: {},
  } as const)

export const AddItemFloatyButton = (props: {
  position: number
  items: DashboardItem[]
  setItems?: (items: DashboardItem[]) => void
  topics: string[]
  setTopics?: (topics: string[]) => void
  className?: string
}) => {
  const { position, items, setItems, topics, setTopics, className } = props

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<0 | 1 | 2 | 3>(0)

  return (
    <>
      <button
        className={clsx(
          'bg-primary-600 hover:bg-primary-500 rounded-full p-3',
          className
        )}
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="text-ink-0 h-6 w-6" />
      </button>
      <AddDashboardModal
        open={open}
        setOpen={setOpen}
        tab={tab}
        setTab={setTab}
        insertItems={(newItems) => {
          const copy = [...items]
          copy.splice(position, 0, ...newItems)
          setItems?.(copy)
        }}
        topics={topics}
        setTopics={(topics) => setTopics?.(topics)}
      />
    </>
  )
}
