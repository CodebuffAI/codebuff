import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Fragment, useEffect, useRef, useState } from 'react'
import { IconButton } from 'web/components/buttons/button'
import { DisplayUser } from 'common/api/user-types'
import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import clsx from 'clsx'
import { Menu, Transition } from '@headlessui/react'
import { Avatar } from 'web/components/widgets/avatar'
import { Row } from 'web/components/layout/row'
import { TbUserSearch } from 'react-icons/tb'
import { User } from 'common/user'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { Contract } from 'common/contract'
import { XIcon } from '@heroicons/react/solid'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Tooltip } from 'web/components/widgets/tooltip'
import { track } from 'web/lib/service/analytics'

export const UserPositionSearchButton = (props: {
  contract: Contract
  currentUser: User | null | undefined
  displayUser: DisplayUser | null | undefined
  setDisplayUser: (user: DisplayUser | undefined) => void
}) => {
  const { contract, displayUser, currentUser, setDisplayUser } = props

  const [term, setTerm] = useState<string>('')
  const { data: users, refresh } = useAPIGetter('search-contract-positions', {
    contractId: contract.id,
    term,
    limit: 5,
  })
  const [searchUsers, setSearchUsers] = useState(false)
  useEffect(() => {
    refresh()
  }, [term])
  const metrics = useSavedContractMetrics(contract)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <Row className={'flex-row-reverse items-center'}>
      {!searchUsers && displayUser ? (
        <DropdownMenu
          icon={
            <div
              className={
                'hover:bg-ink-200 cursor-pointer rounded-lg px-2 py-1.5'
              }
            >
              <Tooltip text={'Change or clear user positions'}>
                <Avatar
                  username={displayUser.username}
                  avatarUrl={displayUser.avatarUrl}
                  size={'xs'}
                  noLink={true}
                />
              </Tooltip>
            </div>
          }
          menuWidth={'w-36'}
          items={[
            {
              icon: <XIcon className={'h-4 w-4'} />,
              name: 'Clear user',
              onClick: () => {
                setDisplayUser(undefined)
              },
            },
            {
              icon: <TbUserSearch className={'h-4 w-4'} />,
              name: 'Change user',
              onClick: () => {
                setSearchUsers(true)
              },
            },
          ]}
        />
      ) : (
        <IconButton
          size={'xs'}
          onClick={() => {
            track('click graph user positions button')
            if (searchUsers) {
              setSearchUsers(false)
              setTerm('')
            } else if (metrics && currentUser) {
              setDisplayUser(currentUser)
            } else if (!searchUsers) {
              setSearchUsers(true)
            }
          }}
        >
          {searchUsers ? (
            <XIcon className={'h-5 w-5'} />
          ) : (
            <Tooltip text={'Graph user positions'}>
              <TbUserSearch className={'h-5 w-5'} />
            </Tooltip>
          )}
        </IconButton>
      )}
      {searchUsers && (
        <Col className={'relative mr-1 h-9'}>
          <Input
            ref={ref}
            autoFocus={true}
            placeholder={'Search users'}
            type={'text'}
            className={'w-full'}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {users && (
            <Menu
              as="div"
              className={clsx(
                'relative inline-block text-right',
                users?.length && 'z-20 h-56'
              )}
            >
              {({}) => (
                <Transition
                  show={users?.length > 0}
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
                    className="divide-ink-100 bg-canvas-0 ring-ink-1000 absolute -right-20 mt-2 w-48 origin-top-right cursor-pointer divide-y  rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none sm:right-0 sm:w-full"
                  >
                    <div className="py-1">
                      {users.map((user) => (
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
                                setTerm('')
                                setDisplayUser(user)
                                setSearchUsers(false)
                              }}
                            >
                              <Avatar
                                username={user.username}
                                avatarUrl={user.avatarUrl}
                                size={'xs'}
                                className={'mr-2'}
                              />
                              {user.name}
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
        </Col>
      )}
    </Row>
  )
}
