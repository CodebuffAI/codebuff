import { FullUser } from 'common/api/user-types'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import Link from 'next/link'
import { useState } from 'react'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export const MAX_SHOWN = 18
export const MAX_SHOWN_MOBILE = 9

export function UserResults(props: { userResults: FullUser[] }) {
  const { userResults } = props
  const [expanded, setExpanded] = useState(false)
  const isMobile = useIsMobile()
  const MAX_INIT_USERS = isMobile ? MAX_SHOWN_MOBILE : MAX_SHOWN
  const shownUsers = expanded
    ? userResults
    : userResults.slice(0, MAX_INIT_USERS)
  return (
    <Col className="mb-4 px-2 sm:px-0">
      <Row className="text-ink-500 items-center gap-1 text-sm">
        <hr className="border-ink-300 ml-2 grow sm:ml-0" />
        <span>
          {userResults.length} user{userResults.length > 1 && 's'}
        </span>
        <hr className="border-ink-300 mr-2 grow sm:mr-0" />
      </Row>
      <Row className="flex-wrap gap-1 text-sm">
        {shownUsers.map((u) => (
          <Link
            key={u.id}
            href={`/${u.username}`}
            className="bg-ink-200 hover:bg-ink-300 flex flex-row items-center gap-1 rounded-full py-1 pl-1 pr-2 transition-colors"
          >
            <Avatar
              key={u.id}
              username={u.username}
              avatarUrl={u.avatarUrl}
              size="2xs"
              className="-my-0.5 -mr-1 last:mr-0"
              noLink
            />
            {u.username}
          </Link>
        ))}
        {userResults.length > MAX_INIT_USERS && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-primary-700 bg-ink-200 hover:bg-ink-300 flex flex-row items-center gap-1 rounded-full p-2 py-1"
          >
            {expanded
              ? `Show less`
              : `Show ${userResults.length - MAX_INIT_USERS} more`}
          </button>
        )}
      </Row>
    </Col>
  )
}
