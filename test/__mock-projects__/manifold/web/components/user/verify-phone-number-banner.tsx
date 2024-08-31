import { isVerified, User } from 'common/user'
import { PHONE_VERIFICATION_BONUS } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { OnboardingVerifyPhone } from 'web/components/onboarding-verify-phone'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'
import { useUser } from 'web/hooks/use-user'

export const VerifyPhoneNumberBanner = (props: {
  user: User | null | undefined
}) => {
  const user = useUser() ?? props.user

  const [showVerifyPhone, setShowVerifyPhone] = useState(false)
  if (!user || isVerified(user)) return null
  return (
    <Col
      className={
        'border-ink-400 m-2 items-center justify-between gap-2 rounded-sm border bg-indigo-200 p-2 px-3 dark:bg-indigo-700 sm:flex-row'
      }
    >
      <span>
        Prove that you're not a robot to collect{' '}
        <CoinNumber
          amount={PHONE_VERIFICATION_BONUS}
          className={'font-bold'}
          isInline
        />
        .{' '}
      </span>
      <Button
        className={'whitespace-nowrap'}
        onClick={() => setShowVerifyPhone(true)}
      >
        Claim {formatMoney(PHONE_VERIFICATION_BONUS)}
      </Button>
      <VerifyPhoneModal open={showVerifyPhone} setOpen={setShowVerifyPhone} />
    </Col>
  )
}
export const VerifyPhoneModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={'bg-canvas-0 p-4'}>
        <OnboardingVerifyPhone onClose={() => setOpen(false)} />
      </Col>
    </Modal>
  )
}
