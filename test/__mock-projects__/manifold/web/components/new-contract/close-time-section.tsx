import { CreateableOutcomeType } from 'common/contract'
import dayjs from 'dayjs'
import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import clsx from 'clsx'
import { Input } from 'web/components/widgets/input'

export const CloseTimeSection = (props: {
  closeDate: string | undefined
  setCloseDate: (closeDate: string | undefined) => void
  closeHoursMinutes: string | undefined
  setCloseHoursMinutes: (closeHoursMinutes: string | undefined) => void
  outcomeType: CreateableOutcomeType
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  setNeverCloses: (neverCloses: boolean) => void
  neverCloses: boolean
  initTime: string
}) => {
  const closeDateMap: { [key: string]: number | string } = {
    'A day': 1,
    'A week': 7,
    '30 days': 30,
    'This year': dayjs().endOf('year').diff(dayjs(), 'day'),
  }

  const {
    closeDate,
    initTime,
    setCloseDate,
    closeHoursMinutes,
    setCloseHoursMinutes,
    outcomeType,
    submitState,
    setNeverCloses,
    neverCloses,
  } = props

  function setCloseDateInDays(days: number) {
    const newCloseDate = dayjs().add(days, 'day').format('YYYY-MM-DD')
    setCloseDate(newCloseDate)
  }

  const NEVER = 'Never'
  if (outcomeType == 'POLL') {
    closeDateMap['Never'] = NEVER
  }
  if (outcomeType == 'STONK' || outcomeType == 'BOUNTIED_QUESTION') {
    return null
  }
  return (
    <Col className="items-start">
      <label className="mb-1 gap-2 px-1 py-2">
        <span>{outcomeType == 'POLL' ? 'Poll' : 'Question'} closes in </span>
        <InfoTooltip
          text={
            outcomeType == 'POLL'
              ? 'Voting on this poll will be halted and resolve to the most voted option'
              : 'Trading will be halted after this time (local timezone).'
          }
        />
      </label>
      <Row className={'w-full items-center gap-2'}>
        <ChoicesToggleGroup
          currentChoice={
            !closeDate
              ? NEVER
              : dayjs(`${closeDate}T23:59`).diff(dayjs(), 'day')
          }
          setChoice={(choice) => {
            if (choice == NEVER) {
              setNeverCloses(true)
              setCloseDate(undefined)
            } else {
              setNeverCloses(false)
              setCloseDateInDays(choice as number)
            }

            if (!closeHoursMinutes) {
              setCloseHoursMinutes(initTime)
            }
          }}
          choicesMap={closeDateMap}
          disabled={submitState === 'LOADING'}
          className={clsx(
            'col-span-4 sm:col-span-2',
            outcomeType == 'POLL' ? 'text-xs sm:text-sm' : ''
          )}
        />
      </Row>
      {!neverCloses && (
        <Row className="mt-4 gap-2">
          <Input
            type={'date'}
            className="dark:date-range-input-white"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              setCloseDate(e.target.value)
              if (!closeHoursMinutes) {
                setCloseHoursMinutes(initTime)
              }
            }}
            min={dayjs().format('YYYY-MM-DD')}
            max="9999-12-31"
            disabled={submitState === 'LOADING'}
            value={closeDate}
          />
          {/*<Input*/}
          {/*  type={'time'}*/}
          {/* className="dark:date-range-input-white"*/}
          {/*  onClick={(e) => e.stopPropagation()}*/}
          {/*  onChange={(e) => setCloseHoursMinutes(e.target.value)}*/}
          {/*  min={'00:00'}*/}
          {/*  disabled={isSubmitting}*/}
          {/*  value={closeHoursMinutes}*/}
          {/*/>*/}
        </Row>
      )}
    </Col>
  )
}
