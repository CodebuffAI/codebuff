import { Ref, useEffect, useState } from 'react'
import clsx from 'clsx'

import { Button, SizeType } from './button'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { BOTTOM_NAV_BAR_HEIGHT } from 'web/components/nav/bottom-nav-bar'
import { AlertBox } from '../widgets/alert-box'

export function WarningConfirmationButton(props: {
  amount: number | undefined
  marketType: 'freeResponse' | 'binary'
  warning?: string
  onSubmit?: () => void
  disabled: boolean
  isSubmitting: boolean
  actionLabelClassName?: string
  ButtonClassName?: string
  color: string
  size: SizeType
  actionLabel: string | React.ReactNode
  userOptedOutOfWarning: boolean | undefined
  inModal: boolean
}) {
  const {
    amount,
    onSubmit,
    warning,
    disabled,
    isSubmitting,
    actionLabelClassName,
    ButtonClassName,
    size,
    color,
    actionLabel,
    userOptedOutOfWarning,
    inModal,
  } = props

  const [isBetButtonVisible, setIsBetButtonVisible] = useState(false)
  const { ref: betButtonRef } = useIsVisible(() => setIsBetButtonVisible(true))
  useEffect(() => {
    if (isBetButtonVisible || !betButtonRef.current || inModal) return
    const rect = betButtonRef.current.getBoundingClientRect()
    const buttonBottomPosition = rect.bottom
    const windowHeight = window.innerHeight

    if (buttonBottomPosition > windowHeight) {
      window.scrollTo({
        top: buttonBottomPosition - windowHeight + BOTTOM_NAV_BAR_HEIGHT,
        behavior: 'smooth',
      })
    }
  }, [actionLabel])

  const buttonText = isSubmitting
    ? 'Submitting...'
    : amount && !disabled
    ? actionLabel
    : disabled && !amount
    ? 'Enter an amount'
    : actionLabel

  const realColor = warning
    ? 'yellow'
    : color == 'indigo' || color == 'green' || color == 'red'
    ? color
    : 'none'

  return (
    <>
      {warning && !userOptedOutOfWarning && (
        <AlertBox title="Whoa, there!">
          <div>{warning}</div>
        </AlertBox>
      )}

      <Button
        size={size}
        disabled={isSubmitting || disabled}
        onClick={onSubmit}
        color={realColor}
        ref={betButtonRef as Ref<HTMLButtonElement>}
        className={clsx(ButtonClassName, 'disabled:bg-ink-200 text-white')}
        style={{ backgroundColor: realColor === 'none' ? color : undefined }}
      >
        <span className={clsx(actionLabelClassName)}>{buttonText}</span>
      </Button>
    </>
  )
}
