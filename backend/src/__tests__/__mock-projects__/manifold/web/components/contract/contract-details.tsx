import { PencilIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { Row } from '../layout/row'
import { Contract } from 'common/contract'
import { DateTimeTooltip } from '../widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from '../widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { Input } from '../widgets/input'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { NO_CLOSE_TIME_TYPES } from 'common/contract'
import { updateMarket } from 'web/lib/api/api'
import { FaClock } from 'react-icons/fa6'
import { MdLockClock } from 'react-icons/md'
import { UserHovercard } from '../user/user-hovercard'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'

export function AuthorInfo(props: { contract: Contract; className?: string }) {
  const { contract, className } = props
  const { creatorId, creatorName, creatorUsername, creatorAvatarUrl } = contract
  const resolver = useDisplayUserById(contract.resolverId)
  return (
    <Row className={clsx('grow flex-wrap items-center gap-2', className)}>
      <UserHovercard userId={creatorId}>
        <Avatar
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          size={'xs'}
        />
      </UserHovercard>
      <UserHovercard userId={creatorId}>
        <UserLink
          user={{
            id: creatorId,
            name: creatorName,
            username: creatorUsername,
          }}
          className={'mr-1'}
        />
      </UserHovercard>
      {contract.isResolved &&
        contract.resolverId! !== contract.creatorId &&
        resolver && (
          <>
            <span className={'ml-1'}>resolved by </span>
            <UserHovercard userId={resolver.id}>
              <UserLink user={resolver} />
            </UserHovercard>
          </>
        )}
    </Row>
  )
}

export function CloseOrResolveTime(props: {
  contract: Contract
  editable?: boolean
  className?: string
}) {
  const { contract, editable, className } = props
  const { resolutionTime, closeTime, isResolved } = contract
  if (contract.outcomeType === 'STONK') return null

  return (
    <Row className={clsx('select-none items-center', className)}>
      {isResolved && resolutionTime && (
        <DateTimeTooltip
          className="whitespace-nowrap"
          time={resolutionTime}
          placement="bottom-start"
        >
          resolved {dayjs(resolutionTime).format('MMM D')}
        </DateTimeTooltip>
      )}

      {!isResolved && (
        <CloseDate
          closeTime={closeTime}
          contract={contract}
          editable={!!editable}
        />
      )}
    </Row>
  )
}

export function CloseDate(props: {
  closeTime: number | undefined
  contract: Contract
  editable?: boolean
}) {
  const { closeTime, contract, editable } = props

  const [isEditingCloseTime, setIsEditingCloseTime] = useState(false)
  const dayJsCloseTime = dayjs(closeTime)
  const dayJsNow = dayjs()
  const isSameYear = dayJsCloseTime.isSame(dayJsNow, 'year')
  const isSameDay = dayJsCloseTime.isSame(dayJsNow, 'day')
  const isSoon = dayJsCloseTime.diff(dayJsNow, 'month') < 4
  const almostForeverTime = dayjs(contract.createdTime).add(
    dayjs.duration(900, 'year')
  )
  const neverCloses =
    !closeTime ??
    (NO_CLOSE_TIME_TYPES.includes(contract.outcomeType) &&
      dayjs(closeTime).isAfter(almostForeverTime))

  return (
    <>
      <Row
        className={clsx(
          'group items-center gap-1',
          editable ? 'cursor-pointer' : ''
        )}
        onClick={() => editable && setIsEditingCloseTime(true)}
      >
        {neverCloses ? (
          <div className="text-ink-500">Never closes</div>
        ) : (
          closeTime && (
            <DateTimeTooltip
              text={closeTime <= Date.now() ? 'Closed on ' : 'Closes on '}
              time={closeTime}
              placement="bottom-end"
              noTap
              className="flex flex-nowrap items-center gap-1 whitespace-nowrap"
            >
              {dayjs().isBefore(closeTime) ? (
                <FaClock className="text-ink-500 h-3.5 w-3.5" />
              ) : (
                <MdLockClock className="text-ink-500 h-5 w-5" />
              )}
              {isSameDay
                ? fromNow(closeTime)
                : isSameYear || isSoon
                ? dayJsCloseTime.format('MMM D')
                : dayJsCloseTime.format('YYYY')}
            </DateTimeTooltip>
          )
        )}
        {editable && (
          <PencilIcon className="sm:group-hover:fill-ink-600 hidden h-4 w-4 sm:flex sm:fill-transparent" />
        )}
        <EditCloseTimeModal
          contract={contract}
          isOpen={isEditingCloseTime}
          setOpen={setIsEditingCloseTime}
        />
      </Row>
    </>
  )
}

export const EditCloseTimeModal = (props: {
  contract: Contract
  isOpen: boolean
  setOpen: (isOpen: boolean) => void
  setNewCloseTime?: (closeTime: number) => void
}) => {
  const { contract, isOpen, setOpen, setNewCloseTime } = props
  const { closeTime } = contract
  const isClient = useIsClient()
  const dayJsCloseTime = dayjs(closeTime)
  const dayJsNow = dayjs()

  const [closeDate, setCloseDate] = useState(
    closeTime && dayJsCloseTime.format('YYYY-MM-DD')
  )
  const [closeHoursMinutes, setCloseHoursMinutes] = useState(
    closeTime && dayJsCloseTime.format('HH:mm')
  )

  let newCloseTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  async function onSave(customTime?: number) {
    if (customTime) {
      newCloseTime = customTime
      setCloseDate(dayjs(newCloseTime).format('YYYY-MM-DD'))
      setCloseHoursMinutes(dayjs(newCloseTime).format('HH:mm'))
    }
    if (!newCloseTime) return

    setOpen(false)
    if (newCloseTime !== closeTime) {
      await updateMarket({
        contractId: contract.id,
        closeTime: newCloseTime,
      })
      setNewCloseTime?.(newCloseTime)
    }
  }
  return (
    <Modal size="md" open={isOpen} setOpen={setOpen} position="top">
      <Col className="bg-canvas-0 rounded-lg p-8">
        <Title className="!text-2xl">Close time</Title>
        <div className="mb-4">
          {contract.outcomeType === 'POLL' ? 'Voting' : 'Trading'} will halt at
          this time
        </div>
        <Row className="flex-wrap items-stretch gap-2">
          <Input
            type="date"
            className="dark:date-range-input-white shrink-0 sm:w-fit"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCloseDate(e.target.value)}
            min={isClient ? dayJsNow.format('YYYY-MM-DD') : undefined}
            max="9999-12-31"
            value={closeDate}
          />
          <Input
            type="time"
            className="dark:date-range-input-white shrink-0 sm:w-max"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCloseHoursMinutes(e.target.value)}
            value={closeHoursMinutes}
          />
          <Button size="xl" onClick={() => onSave()}>
            Save
          </Button>
        </Row>

        {(contract.closeTime ?? Date.now() + 1) > Date.now() && (
          <Row className="mt-8 justify-center">
            <Button
              size={'xs'}
              color="yellow"
              onClick={() => onSave(Date.now())}
            >
              Close question now
            </Button>
          </Row>
        )}
      </Col>
    </Modal>
  )
}
