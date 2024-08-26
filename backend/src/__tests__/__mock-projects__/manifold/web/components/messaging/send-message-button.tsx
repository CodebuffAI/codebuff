import clsx from 'clsx'
import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { useRouter } from 'next/router'
import { BiEnvelope } from 'react-icons/bi'
import { useSortedPrivateMessageMemberships } from 'web/hooks/use-private-messages'
import { usePrivateUser } from 'web/hooks/use-user'
import { findKey } from 'lodash'
import { useState } from 'react'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import {
  createPrivateMessageChannelWithUsers,
  sendUserPrivateMessage,
} from 'web/lib/api/api'
import { useTextEditor } from 'web/components/widgets/editor'
import { MAX_COMMENT_LENGTH } from 'common/comment'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import { firebaseLogin } from 'web/lib/firebase/users'

export const SendMessageButton = (props: {
  toUser: User
  currentUser: User | undefined | null
  includeLabel?: boolean
  circleButton?: boolean
}) => {
  const { toUser, currentUser, includeLabel, circleButton } = props
  const router = useRouter()
  const privateUser = usePrivateUser()
  const channelMemberships = useSortedPrivateMessageMemberships(currentUser?.id)
  const { memberIdsByChannelId } = channelMemberships

  const [openComposeModal, setOpenComposeModal] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const messageButtonClicked = async () => {
    if (!currentUser) return firebaseLogin()
    const previousDirectMessageChannel = findKey(
      memberIdsByChannelId,
      (dm) => dm.includes(toUser.id) && dm.length === 1
    )

    const previousChannelId =
      previousDirectMessageChannel !== undefined
        ? previousDirectMessageChannel
        : undefined

    if (previousChannelId) router.push(`/messages/${previousChannelId}`)
    else setOpenComposeModal(true)
  }
  const editor = useTextEditor({
    key: `compose-new-message-${toUser.id}`,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder: 'Say something...',
  })

  const sendMessage = async () => {
    if (!editor) return
    setSubmitting(true)
    const res = await createPrivateMessageChannelWithUsers({
      userIds: [toUser.id],
    }).catch((e) => {
      setError(e.message)
      setSubmitting(false)
      return
    })
    if (!res) return

    const msgRes = await sendUserPrivateMessage({
      channelId: res.channelId,
      content: editor.getJSON(),
    }).catch((e) => {
      setError(e.message)
      setSubmitting(false)
      return
    })
    if (!msgRes) return

    router.push(`/messages/${res.channelId}`)
  }

  if (privateUser?.blockedByUserIds.includes(toUser.id)) return null

  return (
    <>
      {circleButton ? (
        <button
          className="bg-primary-500 hover:bg-primary-600 h-7 w-7 rounded-full transition-colors"
          onClick={messageButtonClicked}
        >
          <BiEnvelope
            className={clsx(
              'm-auto h-5 w-5 text-white drop-shadow',
              includeLabel && 'mr-2'
            )}
          />
        </button>
      ) : (
        <Button size={'sm'} onClick={messageButtonClicked}>
          <BiEnvelope className={clsx('h-5 w-5', includeLabel && 'mr-2')} />{' '}
          {includeLabel && <>Message</>}
        </Button>
      )}
      <Modal open={openComposeModal} setOpen={setOpenComposeModal}>
        <Col className={MODAL_CLASS}>
          <Row className={'w-full'}>
            <Title className={'!mb-2'}>Message {toUser.name}</Title>
          </Row>
          <CommentInputTextArea
            autoFocus={true}
            editor={editor}
            user={currentUser}
            submit={sendMessage}
            isSubmitting={!editor || submitting}
            submitOnEnter={false}
            hideToolbar={true}
          />
          <span className={'text-red-500'}>{error}</span>
        </Col>
      </Modal>
    </>
  )
}
