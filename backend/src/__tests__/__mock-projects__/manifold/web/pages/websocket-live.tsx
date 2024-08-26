import { useState } from 'react'
import { usePagination } from 'web/hooks/use-pagination'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { buttonClass } from 'web/components/buttons/button'
import { ServerMessage } from 'common/api/websockets'

const LIVE_TOPICS = [
  'global/new-bet',
  'global/new-contract',
  'global/new-comment',
  'global/new-subsidy',
] as const
type LiveTopic = (typeof LIVE_TOPICS)[number]

type ReceivedMessage = {
  contents: ServerMessage<'broadcast'>
  clientRecvTime: number
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  hour12: false,
  minute: 'numeric',
  second: 'numeric',
  fractionalSecondDigits: 3,
  timeZone: 'America/Los_Angeles',
})

function StatusLabel(props: { topic: LiveTopic; error?: Error }) {
  const { topic, error } = props
  return (
    <h1 className="flex flex-row gap-2">
      <span>{topic}</span>
      <span>{error ? ` -- ${error.toString()}` : ''}</span>
    </h1>
  )
}

function MessageHeader() {
  return (
    <tr className="bg-stone-800">
      <th className="w-24 pr-2 text-right">
        T<sub>Client</sub>
      </th>
      <th className="pr-2">Data</th>
    </tr>
  )
}

function MessageRow(props: { msg: ReceivedMessage }) {
  const { msg } = props
  return (
    <tr>
      <td className="w-24 pr-2 text-right">
        {timeFormatter.format(msg.clientRecvTime)}
      </td>
      <td className="max-w-full pr-2">
        <pre className="whitespace-nowrap3 max-w-full overflow-x-hidden text-ellipsis">
          {JSON.stringify(msg.contents.data)}
        </pre>
      </td>
    </tr>
  )
}
export default function WebsocketLivePage() {
  return (
    <Page trackPageView={false}>
      <SEO
        title="API websocket live test"
        description=""
        url="/websocket-live"
      />
      {LIVE_TOPICS.map((t) => (
        <RealtimeLog key={t} topic={t} />
      ))}
    </Page>
  )
}

function RealtimeLog(props: { topic: LiveTopic }) {
  const { topic } = props
  const [enabled, setEnabled] = useState(true)
  const [messages, setMessages] = useState<ReceivedMessage[]>([])
  const [error, setError] = useState<Error | undefined>()
  useApiSubscription({
    enabled,
    topics: [topic],
    onBroadcast: (msg) => {
      const message = { contents: msg, clientRecvTime: Date.now() }
      setMessages((ms) => [message, ...ms])
    },
    onError: (err) => {
      setError(err)
    },
  })
  const pagination = usePagination({
    prefix: messages,
    q: async () => [],
    pageSize: 10,
  })
  return (
    <div className="text-md flex w-full flex-col">
      <StatusLabel topic={topic} error={error} />
      <table className="w-full table-fixed border-collapse border border-slate-600">
        <thead>
          <MessageHeader />
        </thead>
        <tbody>
          {pagination.items.map((m, i) => (
            <MessageRow key={i} msg={m} />
          ))}
        </tbody>
      </table>
      <div className="my-2 flex flex-row">
        <button
          className={buttonClass('lg', 'gray-outline')}
          onClick={() => {
            setEnabled(!enabled)
          }}
        >
          {enabled ? 'Kill' : 'Resume'}
        </button>
        <PaginationNextPrev {...pagination} />
      </div>
    </div>
  )
}
