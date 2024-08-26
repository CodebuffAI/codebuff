import clsx from 'clsx'
import { MAX_GROUP_NAME_LENGTH, PrivacyStatusType, Group } from 'common/group'
import { User } from 'common/user'
import { useState } from 'react'
import { createGroup } from 'web/lib/api/api'
import { Col } from '../layout/col'
import { Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Input } from '../widgets/input'
import { PrivacyStatusView } from './topic-privacy-modal'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'

export function CreateTopicModal(props: {
  user: User | null | undefined
  open: boolean
  setOpen: (open: boolean) => void
  onCreate?: (group: Group) => void
  className?: string
  startingTitle?: string
}) {
  const { user, startingTitle, className, setOpen, open, onCreate } = props

  const [name, setName] = useState(startingTitle ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyStatusType>('public')

  const onSubmit = async () => {
    setIsSubmitting(true)
    const newGroup = {
      name,
      memberIds: [],
      privacyStatus: privacy,
    }
    const result = await createGroup(newGroup).catch((e) => {
      console.error(e)
      const errorDetails = e.details?.[0]
      if (errorDetails) {
        setErrorText(
          `Error with ${errorDetails.field} field - ${errorDetails.error} `
        )
      } else if ('message' in e) {
        setErrorText(e.message)
      } else {
        setErrorText('An error occured. Please try again.')
      }
      setIsSubmitting(false)
      return e
    })

    if (result.group) {
      onCreate?.(result.group)
    }

    setIsSubmitting(false)
    return false
  }

  if (user?.isBannedFromPosting) return <></>

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col
        className={clsx(
          ' bg-canvas-50 gap-4 rounded-md p-4',
          className,
          SCROLLABLE_MODAL_CLASS
        )}
      >
        <Col>
          <span className="text-primary-700 text-2xl">Create a topic</span>
        </Col>
        {errorText && <div className={'text-error'}>{errorText}</div>}

        <Col>
          <label className="mb-2 ml-1 mt-0">Topic name</label>
          <Input
            placeholder={'Your topic name'}
            disabled={isSubmitting}
            value={name}
            maxLength={MAX_GROUP_NAME_LENGTH}
            onChange={(e) => setName(e.target.value || '')}
          />
        </Col>

        <Col>
          <label className="mb-2 ml-1 mt-0">Type</label>
          <PrivacyStatusView
            viewStatus={'public'}
            isSelected={privacy == 'public'}
            onClick={() => setPrivacy('public')}
            size="sm"
          />
          <PrivacyStatusView
            viewStatus={'curated'}
            isSelected={privacy == 'curated'}
            onClick={() => setPrivacy('curated')}
            size="sm"
          />
        </Col>
        <Col className={''}>
          <Row className={' justify-between'}>
            <Button color={'gray-outline'} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={isSubmitting}
              disabled={isSubmitting || name.length < 1}
              color={'indigo'}
              onClick={onSubmit}
            >
              Create
            </Button>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}
