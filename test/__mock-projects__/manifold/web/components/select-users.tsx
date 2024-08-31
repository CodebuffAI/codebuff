import { XIcon } from '@heroicons/react/outline'
import { Fragment, useRef, useEffect, useState } from 'react'
import clsx from 'clsx'
import { Menu, Transition } from '@headlessui/react'
import { Avatar } from 'web/components/widgets/avatar'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/widgets/user-link'
import { Input } from './widgets/input'
import { searchUsers, DisplayUser } from 'web/lib/supabase/users'
import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'

export function SelectUsers(props: {
  setSelectedUsers: (users: DisplayUser[]) => void
  selectedUsers: DisplayUser[]
  ignoreUserIds: string[]
  showSelectedUsersTitle?: boolean
  selectedUsersClassName?: string
  showUserUsername?: boolean
  maxUsers?: number
  searchLimit?: number
  className?: string
}) {
  const {
    ignoreUserIds,
    selectedUsers,
    setSelectedUsers,
    showSelectedUsersTitle,
    selectedUsersClassName,
    showUserUsername,
    maxUsers,
    className,
    searchLimit,
  } = props
  const [query, setQuery] = useState('')
  const [filteredUsers, setFilteredUsers] = useState<DisplayUser[]>([])

  const requestId = useRef(0)
  const queryReady = query.length > 1

  useEffect(() => {
    const id = ++requestId.current
    if (queryReady) {
      searchUsers(query, searchLimit ?? 5).then((results) => {
        // if there's a more recent request, forget about this one
        if (id === requestId.current) {
          setFilteredUsers(
            results.filter((user) => {
              return (
                !selectedUsers.some(({ name }) => name === user.name) &&
                !ignoreUserIds.includes(user.id)
              )
            })
          )
        }
      })
    } else {
      setFilteredUsers([])
    }
  }, [query, selectedUsers, ignoreUserIds])

  const shouldShow = maxUsers ? selectedUsers.length < maxUsers : true
  return (
    <Col className={className}>
      {shouldShow && (
        <>
          <Col className="relative mt-1 w-full rounded-md">
            <Input
              type="text"
              name="user name"
              id="user name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Ian Philips"
            />
          </Col>
          {queryReady && (
            <Menu
              as="div"
              className={clsx(
                'relative inline-block w-full overflow-y-scroll text-right',
                queryReady && 'h-56'
              )}
            >
              {({}) => (
                <Transition
                  show={queryReady}
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items
                    static={true}
                    className="divide-ink-100 bg-canvas-0 ring-ink-1000 absolute right-0 mt-2 w-full origin-top-right cursor-pointer divide-y rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none"
                  >
                    <div className="py-1">
                      {filteredUsers.map((user) => (
                        <Menu.Item key={user.id}>
                          {({ active }) => (
                            <button
                              className={clsx(
                                active
                                  ? 'bg-ink-100 text-ink-900'
                                  : 'text-ink-700',
                                'group flex w-full items-center px-4 py-2 text-sm'
                              )}
                              onClick={() => {
                                setQuery('')
                                setSelectedUsers([...selectedUsers, user])
                              }}
                            >
                              <Avatar
                                username={user.username}
                                avatarUrl={user.avatarUrl}
                                size={'xs'}
                                className={'mr-2'}
                              />
                              {user.name}
                              {showUserUsername && (
                                <span className={'text-ink-500 ml-1'}>
                                  @{user.username}
                                </span>
                              )}
                            </button>
                          )}
                        </Menu.Item>
                      ))}
                    </div>
                  </Menu.Items>
                </Transition>
              )}
            </Menu>
          )}
        </>
      )}
      {selectedUsers.length > 0 && (
        <>
          {showSelectedUsersTitle && (
            <div className={'mb-2'}>'Added members:'</div>
          )}
          <Row className={clsx('mt-2 flex-wrap gap-2', selectedUsersClassName)}>
            {selectedUsers.map((user) => (
              <Row key={user.id} className={'items-center gap-1'}>
                <Avatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size={'sm'}
                />
                <UserLink user={user} className="ml-1" />
                <Button
                  onClick={() =>
                    setSelectedUsers([
                      ...selectedUsers.filter(({ id }) => id != user.id),
                    ])
                  }
                  color={'gray-white'}
                  size={'xs'}
                >
                  <XIcon className="h-5 w-5" aria-hidden="true" />
                </Button>
              </Row>
            ))}
          </Row>
        </>
      )}
    </Col>
  )
}
