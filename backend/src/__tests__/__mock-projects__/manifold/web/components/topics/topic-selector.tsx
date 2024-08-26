import { Combobox } from '@headlessui/react'
import { PlusCircleIcon, SelectorIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Group, LiteGroup, MAX_GROUPS_PER_MARKET } from 'common/group'
import { useEffect, useRef, useState } from 'react'
import { CreateTopicModal } from 'web/components/topics/create-topic-modal'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useUser } from 'web/hooks/use-user'
import { getGroups } from 'web/lib/supabase/groups'
import { searchGroups } from 'web/lib/api/api'
import { PRIVACY_STATUS_ITEMS } from './topic-privacy-modal'
import { uniqBy } from 'lodash'

import { useAsyncData } from 'web/hooks/use-async-data'
import { Col } from '../layout/col'

export function TopicSelector(props: {
  setSelectedGroup: (group: Group) => void
  max?: number
  label?: string
  selectedIds?: string[]
  onlyGroupIds?: string[]
  onCreateTopic?: (group: Group) => void
  className?: string
  placeholder?: string
}) {
  const {
    setSelectedGroup,
    max,
    label,
    onCreateTopic,
    selectedIds,
    onlyGroupIds,
    className,
    placeholder,
  } = props
  const user = useUser()
  const onlyGroups = useAsyncData(onlyGroupIds, getGroups)
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const [query, setQuery] = useState('')
  const [searchedGroups, setSearchedGroups] = useState<LiteGroup[]>([])
  const [loading, setLoading] = useState(false)

  const requestNumber = useRef(0)

  useEffect(() => {
    if (onlyGroups?.length) setSearchedGroups(onlyGroups)
  }, [onlyGroups?.length])

  useEffect(() => {
    if (!user) return
    if (onlyGroupIds) {
      onlyGroups &&
        setSearchedGroups(
          onlyGroups.filter((group) => group.name.includes(query))
        )
      return
    }
    requestNumber.current++
    const requestId = requestNumber.current
    setSearchedGroups([])
    setLoading(true)
    searchGroups({
      term: query,
      limit: 10,
      addingToContract: true,
      type: 'lite',
    }).then((result) => {
      if (requestNumber.current === requestId) {
        setSearchedGroups(uniqBy(result.lite, 'name'))
        setLoading(false)
      }
    })
  }, [user?.id, query])

  const handleSelectGroup = (group: Group | null | 'new') => {
    if (group === 'new') {
      setIsCreatingNewGroup(true)
      return
    }
    group && setSelectedGroup(group)
    setQuery('') // Clear the input
  }

  const atMax = max != undefined && selectedIds && selectedIds.length >= max

  return (
    <Col className={clsx('w-full items-start', className)}>
      <Combobox
        as="div"
        value={null}
        onChange={handleSelectGroup}
        nullable={true}
        className={'w-full text-sm'}
        disabled={atMax}
      >
        {label && (
          <Combobox.Label className="justify-start gap-2 px-1 py-2 text-base">
            {label}{' '}
            <InfoTooltip text="Question will be displayed alongside the other questions in the category." />
          </Combobox.Label>
        )}
        <div className="relative w-full">
          <Combobox.Button as="div">
            <Combobox.Input
              className="border-ink-300 disabled:border-ink-100 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 w-full rounded-md border p-3 pl-4  text-sm shadow-sm focus:outline-none focus:ring-1"
              onChange={(e) => setQuery(e.target.value)}
              displayValue={(group: Group) => group && group.name}
              placeholder={
                atMax
                  ? `You're at ${MAX_GROUPS_PER_MARKET} tags. Remove tags to add more.`
                  : placeholder ?? 'Search topics'
              }
            />
          </Combobox.Button>
          <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
            <SelectorIcon className="text-ink-400 h-5 w-5" aria-hidden="true" />
          </Combobox.Button>

          <Combobox.Options
            static={isCreatingNewGroup}
            className="bg-canvas-0 ring-ink-1000 absolute z-10 mt-1 max-h-60 w-full overflow-x-hidden rounded-md py-1 shadow-lg ring-1 ring-opacity-5 focus:outline-none"
          >
            {loading ? (
              <>
                <LoadingOption className={'w-3/4'} />
                <LoadingOption className={'w-1/2'} />
                <LoadingOption className={'w-3/4'} />
              </>
            ) : (
              searchedGroups
                .filter((group) => !selectedIds?.some((id) => id == group.id))
                .map((group: LiteGroup) => (
                  <Combobox.Option
                    key={group.id}
                    value={group}
                    className={({ active }) =>
                      clsx(
                        'relative flex h-12 cursor-pointer select-none items-center justify-between px-6 py-2 transition-colors',
                        active ? 'bg-primary-200 text-ink-1000' : 'text-ink-900'
                      )
                    }
                  >
                    <div className={'truncate'}>
                      {group.name} ({group.totalMembers} followers)
                    </div>
                    {group.privacyStatus != 'public' && (
                      <Row className={'text-ink-500'}>
                        {PRIVACY_STATUS_ITEMS[group.privacyStatus].icon}
                      </Row>
                    )}
                  </Combobox.Option>
                ))
            )}

            {user && !loading && (
              <Combobox.Option
                value={'new'}
                className={({ active }) =>
                  clsx(
                    'relative flex h-12 cursor-pointer select-none items-center justify-between px-6 py-2 transition-colors',
                    active ? 'bg-primary-200 text-ink-1000' : 'text-ink-900',
                    loading ? 'animate-pulse' : ''
                  )
                }
              >
                <Row className={'items-center gap-1 truncate'}>
                  <PlusCircleIcon className="mr-2 h-5 w-5 text-teal-500" />
                  Create a new topic
                </Row>
              </Combobox.Option>
            )}
          </Combobox.Options>
        </div>
      </Combobox>
      {isCreatingNewGroup && (
        <CreateTopicModal
          user={user}
          startingTitle={query}
          open={isCreatingNewGroup}
          setOpen={setIsCreatingNewGroup}
          onCreate={(group) => {
            handleSelectGroup(group)
            onCreateTopic?.(group)
            setIsCreatingNewGroup(false)
          }}
        />
      )}
    </Col>
  )
}

const LoadingOption = (props: { className: string }) => (
  <div className="flex h-12 w-full animate-pulse select-none items-center px-6">
    <div className={clsx('bg-ink-300 h-4 rounded-full', props.className)} />
  </div>
)
