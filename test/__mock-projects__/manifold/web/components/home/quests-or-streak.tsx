import { memo, useEffect, useState } from 'react'
import { User } from 'common/user'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { InfoTooltip } from '../widgets/info-tooltip'
import { hasCompletedStreakToday } from 'web/components/profile/betting-streak-modal'
import { Title } from 'web/components/widgets/title'
import { ProgressBar } from 'web/components/progress-bar'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
} from 'common/economy'
import { QUEST_DETAILS } from 'common/quest'
import { useQuestStatus } from 'web/hooks/use-quest-status'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import Link from 'next/link'
import { linkClass } from '../widgets/site-link'

const QUEST_STATS_CLICK_EVENT = 'click quest stats button'

export const QuestsOrStreak = memo(function DailyProfit(props: {
  user: User | null | undefined
}) {
  const { user } = props

  const [showQuestsModal, setShowQuestsModal] = useState(false)

  useEffect(() => {
    if (showQuestsModal) {
      track(QUEST_STATS_CLICK_EVENT)
    }
  }, [showQuestsModal])
  if (!user) return <></>

  return (
    <>
      <button
        className={clsx('cursor-pointer', dailyStatsClass)}
        onClick={() => setShowQuestsModal(true)}
      >
        <Col
          className={clsx(
            user && !hasCompletedStreakToday(user) && 'grayscale',
            'items-center'
          )}
        >
          <span>🔥 {user?.currentBettingStreak ?? 0}</span>
          <span className="text-ink-600 text-xs">Streak</span>
        </Col>
      </button>
      {showQuestsModal && (
        <QuestsModal
          open={showQuestsModal}
          setOpen={setShowQuestsModal}
          user={user}
        />
      )}
    </>
  )
})

export function QuestsModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  user: User
}) {
  const { open, setOpen, user } = props
  const questStatus = useQuestStatus(user)

  const { totalQuestsCompleted, totalQuests, questToCompletionStatus } =
    questStatus ?? { questToCompletionStatus: null }
  if (!questToCompletionStatus)
    return (
      <Modal open={open} setOpen={setOpen} size={'lg'}>
        <LoadingIndicator />
      </Modal>
    )
  const streakStatus = questToCompletionStatus['BETTING_STREAK']
  const shareStatus = questToCompletionStatus['SHARES']
  const createStatus = questToCompletionStatus['MARKETS_CREATED']
  const referralsStatus = questToCompletionStatus['REFERRALS']

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <div className="bg-canvas-0 text-ink-1000 rounded-lg p-3">
        <Col className={'mb-6 items-center justify-center gap-2'}>
          <Title className={'!mb-1'}> Your quests</Title>
          <span className="text-ink-700 text-sm">
            {`🧭 ${totalQuestsCompleted}/${totalQuests}`} completed
          </span>
          <ProgressBar
            value={totalQuestsCompleted / totalQuests}
            max={1}
            className={'mb-1 w-1/2'}
          />
        </Col>
        <Col className={'mb-4 gap-6'}>
          <Row className={'text-primary-700 '}>Daily</Row>
          <QuestRow
            emoji={'🔥'}
            title={
              (user.currentBettingStreak ?? 0) > 0
                ? `Continue your ${user.currentBettingStreak}-day prediction streak`
                : 'Make a prediction once per day'
            }
            complete={streakStatus.currentCount >= streakStatus.requiredCount}
            status={`(${streakStatus.currentCount}/${streakStatus.requiredCount})`}
            reward={Math.min(
              BETTING_STREAK_BONUS_AMOUNT * (user.currentBettingStreak || 1),
              BETTING_STREAK_BONUS_MAX
            )}
            href="/browse?fy=1&f=open"
          />
          <QuestRow
            emoji={'📤'}
            title={`Share ${shareStatus.requiredCount} market today`}
            complete={shareStatus.currentCount >= shareStatus.requiredCount}
            status={`(${shareStatus.currentCount}/${shareStatus.requiredCount})`}
            reward={QUEST_DETAILS.SHARES.rewardAmount}
            info={'Share a question with a friend!'}
          />
          <Row className={'text-primary-700'}>Weekly</Row>
          <QuestRow
            emoji={'📈'}
            title={`Create a question this week`}
            complete={createStatus.currentCount >= createStatus.requiredCount}
            status={`(${createStatus.currentCount}/${createStatus.requiredCount})`}
            reward={QUEST_DETAILS.MARKETS_CREATED.rewardAmount}
            href={'/create'}
          />
          <QuestRow
            emoji={'🙋️'}
            title={`Refer a friend this week`}
            complete={
              referralsStatus.currentCount >= referralsStatus.requiredCount
            }
            status={`(${referralsStatus.currentCount}/${referralsStatus.requiredCount})`}
            reward={QUEST_DETAILS.REFERRALS.rewardAmount}
            info={
              'Just click the share button on a question and your referral code will be added to the link'
            }
            href={'/referrals'}
          />
        </Col>
      </div>
    </Modal>
  )
}

const QuestRow = (props: {
  emoji: string
  title: string
  complete: boolean
  status: string
  reward: number
  info?: string
  href?: string
}) => {
  const { title, complete, status, reward, emoji, info, href } = props
  return (
    <Row className={'justify-between'}>
      <Col>
        <Row className={'gap-4 sm:gap-6'}>
          <span className={clsx('text-4xl', complete ? '' : 'grayscale')}>
            {emoji}
          </span>
          <Col>
            <span className={clsx('sm:text-xl')}>
              {href ? (
                <Link className={linkClass} href={href}>
                  {title}
                </Link>
              ) : (
                title
              )}
              {info && (
                <InfoTooltip className={'!mb-1 ml-1 !h-4 !w-4'} text={info} />
              )}
            </span>
            <span
              className={clsx(
                'text-ink-500 text-sm',
                complete && 'text-indigo-500'
              )}
            >
              {complete ? 'Complete!' : status}
            </span>
          </Col>
        </Row>
      </Col>
      <Col className={''}>
        <span
          className={clsx(
            'text-lg sm:text-xl',
            complete ? 'text-teal-600' : 'text-ink-500'
          )}
        >
          +{formatMoney(reward)}
        </span>
      </Col>
    </Row>
  )
}
