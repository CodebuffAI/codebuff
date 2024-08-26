import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Button, ColorType, SizeType } from './button'

export function ConfirmationButton(props: {
  openModalBtn: {
    label: string
    icon?: JSX.Element
    className?: string
    color?: ColorType
    size?: SizeType
    disabled?: boolean
  }
  cancelBtn?: {
    label?: string
    color?: ColorType
    disabled?: boolean
  }
  submitBtn?: {
    label?: string
    color?: ColorType
    isSubmitting?: boolean
  }
  children: ReactNode
  onSubmit?: () => void
  onOpenChanged?: (isOpen: boolean) => void
  onSubmitWithSuccess?: () => Promise<boolean>
  disabled?: boolean
}) {
  const {
    openModalBtn,
    cancelBtn,
    submitBtn,
    onSubmit,
    children,
    onOpenChanged,
    onSubmitWithSuccess,
    disabled,
  } = props

  const [open, setOpen] = useState(false)

  function updateOpen(newOpen: boolean) {
    onOpenChanged?.(newOpen)
    setOpen(newOpen)
  }

  return (
    <>
      <Modal open={open} setOpen={updateOpen}>
        <Col className="bg-canvas-0 gap-4 rounded-md px-8 py-6">
          {children}
          <Row className="w-full justify-end gap-4">
            <Button
              color={cancelBtn?.color ?? 'gray-white'}
              onClick={() => updateOpen(false)}
              disabled={cancelBtn?.disabled}
            >
              {cancelBtn?.label ?? 'Cancel'}
            </Button>
            <Button
              color={submitBtn?.color ?? 'blue'}
              onClick={
                onSubmitWithSuccess
                  ? () =>
                      onSubmitWithSuccess().then((success) =>
                        updateOpen(!success)
                      )
                  : async () => {
                      await onSubmit?.()
                      updateOpen(false)
                    }
              }
              loading={submitBtn?.isSubmitting}
            >
              {submitBtn?.label ?? 'Submit'}
            </Button>
          </Row>
        </Col>
      </Modal>

      <Button
        className={openModalBtn.className}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (disabled) {
            return
          }
          updateOpen(true)
        }}
        disabled={openModalBtn.disabled}
        color={openModalBtn.color}
        size={openModalBtn.size}
      >
        {openModalBtn.icon}
        {openModalBtn.label}
      </Button>
    </>
  )
}

export function ResolveConfirmationButton(props: {
  onResolve: () => void
  isSubmitting: boolean
  openModalButtonClass?: string
  marketTitle: string
  label: string
  color: ColorType
  disabled?: boolean
}) {
  const {
    onResolve,
    isSubmitting,
    openModalButtonClass,
    color,
    marketTitle,
    label,
    disabled,
  } = props
  return (
    <ConfirmationButton
      openModalBtn={{
        className: clsx('border-none self-start', openModalButtonClass),
        label: 'Resolve',
        color: color,
        disabled: isSubmitting || disabled,
        size: 'xl',
      }}
      cancelBtn={{
        label: 'Back',
      }}
      submitBtn={{
        label: `Resolve to ${label}`,
        color: color,
        isSubmitting,
      }}
      onSubmit={onResolve}
    >
      <p>
        Are you sure you want to resolve "{marketTitle}" to <b>{label}</b>?
        <br />
      </p>
    </ConfirmationButton>
  )
}
