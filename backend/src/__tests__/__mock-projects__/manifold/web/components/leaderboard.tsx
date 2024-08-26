import clsx from 'clsx'
import { Table } from './widgets/table'
import { Title } from './widgets/title'
import { sortBy } from 'lodash'
import { UserAvatarAndBadge } from './widgets/user-link'
import { ReactNode } from 'react'

interface LeaderboardEntry {
  id: string
  username: string
  name: string
  avatarUrl?: string
  rank?: number | null
}

export function Leaderboard<T extends LeaderboardEntry>(props: {
  title: string
  entries: T[]
  columns: {
    header: string | ReactNode
    renderCell: (entry: T) => any
  }[]
  className?: string
  maxToShow?: number
  highlightUsername?: string
}) {
  const { title, columns, className, highlightUsername } = props
  const maxToShow = props.maxToShow ?? props.entries.length
  const entries = sortBy(
    props.entries.slice(0, maxToShow),
    (entry) => entry.rank
  )
  return (
    <div className={clsx('w-full px-1', className)}>
      <Title>{title}</Title>
      {entries.length === 0 ? (
        <div className="text-ink-500 ml-2">None yet</div>
      ) : (
        <div className="overflow-x-auto">
          {/* zebra stripes */}
          <Table className="[&>tbody_tr:nth-child(odd)]:bg-canvas-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                {columns.map((column, index) => (
                  <th key={index}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr
                  key={index}
                  className={
                    entry.username === highlightUsername
                      ? '!bg-indigo-400/20'
                      : ''
                  }
                >
                  <td className={'w-[4.5rem] min-w-[4.5rem] '}>
                    {entry.rank ? entry.rank : index + 1}
                  </td>
                  <td>
                    <UserAvatarAndBadge
                      className="overflow-hidden max-[400px]:max-w-[160px] sm:max-w-[200px] xl:max-w-none"
                      user={entry}
                    />
                  </td>
                  {columns.map((column, index) => (
                    <td key={index}>{column.renderCell(entry)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  )
}
