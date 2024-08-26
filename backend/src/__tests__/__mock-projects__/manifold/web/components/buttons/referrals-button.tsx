import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { SelectUsers } from 'web/components/select-users'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from './button'
import { getReferrals } from 'web/lib/supabase/referrals'
import { DisplayUser } from 'common/api/user-types'
import { getReferralCount } from 'common/supabase/referrals'
import { db } from 'web/lib/supabase/db'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { ExclamationCircleIcon } from '@heroicons/react/outline'
import { referUser } from 'web/lib/api/api'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { canSetReferrer } from 'web/lib/firebase/users'
import { REFERRAL_AMOUNT } from 'common/economy'
import { Subtitle } from '../widgets/subtitle'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { SPICE_COLOR } from 'web/components/portfolio/portfolio-value-graph'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'

export const useReferralCount = (user: User) => {
  const [referralCount, setReferralCount] = useState(0)
  useEffect(() => {
    getReferralCount(user.id, 0, db).then(setReferralCount)
  }, [user.id])

  return referralCount
}

export function Referrals(props: { user: User }) {
  const { user } = props
  const [referredBy, setReferredBy] = useState<DisplayUser[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [referredUsers, setReferredUsers] = useState<DisplayUser[] | undefined>(
    undefined
  )

  useEffect(() => {
    if (referredUsers !== undefined) return
    getReferrals(user.id).then(setReferredUsers)
  }, [referredUsers, user.id])
  const currentUser = useUser()
  const isYou = currentUser?.id === user.id

  const referredByUser = useDisplayUserById(user.referredByUserId)
  const url = `https://${ENV_CONFIG.domain}?referrer=${user?.username}`

  return (
    <Col className="bg-canvas-0 rounded p-6">
      {isYou && (
        <>
          <span className={'text-primary-700 pb-2 text-xl'}>
            Refer a friend for{' '}
            <span className={'text-teal-500'}>
              <CoinNumber
                coinType="spice"
                amount={REFERRAL_AMOUNT}
                style={{
                  color: SPICE_COLOR,
                }}
                className={clsx('mr-1 font-bold')}
                isInline
              />
            </span>{' '}
            each!
          </span>
          <CopyLinkRow url={url} eventTrackingName="copy referral link" />
        </>
      )}

      <Subtitle>{isYou ? 'Your referrer' : 'Referred by'}</Subtitle>

      {isYou && canSetReferrer(user) ? (
        <Col className={'mt-1'}>
          <span>Know who referred you?</span>
          <SelectUsers
            setSelectedUsers={setReferredBy}
            selectedUsers={referredBy}
            ignoreUserIds={[currentUser.id]}
            showSelectedUsersTitle={false}
            showUserUsername={true}
            maxUsers={1}
          />
          {referredBy.length > 0 && (
            <Row
              className={
                'bg-canvas-50 text-primary-700 mt-4 items-center rounded-md p-2'
              }
            >
              <ExclamationCircleIcon className={'mr-2 h-5 w-5'} />
              <span>Keep in mind: you can only set who referred you once!</span>
            </Row>
          )}
          <Row className={'mt-2 justify-end'}>
            <Button
              loading={isSubmitting}
              disabled={referredBy.length === 0 || isSubmitting}
              onClick={() => {
                if (!referredBy[0]) return
                setIsSubmitting(true)
                referUser({
                  referredByUsername: referredBy[0].username,
                })
                  .then(async () => {
                    setErrorText('')
                    setIsSubmitting(false)
                    setReferredBy([])
                  })
                  .catch((error) => {
                    setIsSubmitting(false)
                    console.log(error)
                    setErrorText(error.message)
                  })
              }}
            >
              Save
            </Button>
          </Row>
          <Row className={'justify-end'}>
            <span className={'text-error'}>{errorText}</span>
          </Row>
        </Col>
      ) : (
        <div className="text-ink-700 justify-center">
          {referredByUser ? (
            <Row className={'items-center gap-2 p-2'}>
              <Avatar
                username={referredByUser.username}
                avatarUrl={referredByUser.avatarUrl}
              />
              <UserLink user={referredByUser} />
            </Row>
          ) : (
            <span className={'text-ink-500'}>No one...</span>
          )}
        </div>
      )}

      <Subtitle>
        {isYou ? 'Your ' : ''}
        {referredUsers && referredUsers.length > 0
          ? referredUsers.length
          : ''}{' '}
        referrals
      </Subtitle>

      <Col className="max-h-60 gap-2 overflow-y-scroll">
        {referredUsers === undefined ? (
          <LoadingIndicator />
        ) : referredUsers.length === 0 ? (
          <div className="text-ink-500">No users yet...</div>
        ) : (
          referredUsers.map((refUser) => (
            <Row
              key={refUser.id}
              className={clsx('items-center justify-between gap-2 p-2')}
            >
              <Row className="items-center gap-2">
                <Avatar
                  username={refUser?.username}
                  avatarUrl={refUser?.avatarUrl}
                />
                {refUser && <UserLink user={refUser} />}
              </Row>
            </Row>
          ))
        )}
      </Col>
    </Col>
  )
}
