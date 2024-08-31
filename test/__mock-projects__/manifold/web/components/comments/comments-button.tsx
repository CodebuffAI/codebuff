import { useState } from 'react'
import { ChatIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Col } from '../layout/col'
import { CommentsTabContent } from '../contract/contract-tabs'
import { usePrivateUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { Tooltip } from '../widgets/tooltip'
import { User } from 'common/user'
import {
  useCommentsOnContract,
  useNumContractComments,
} from 'web/hooks/use-comments'
import { Button } from 'web/components/buttons/button'
import { Row } from '../layout/row'

export function CommentsButton(props: {
  contract: Contract
  user: User | null | undefined
  className?: string
  highlightCommentId?: string
}) {
  const { contract, highlightCommentId, user, className } = props

  const [open, setOpen] = useState(false)
  const totalComments = useNumContractComments(contract.id)

  return (
    <Button
      color={'gray-white'}
      size={'2xs'}
      disabled={totalComments === 0 && !user}
      className={clsx(className)}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        setOpen(true)
        track('click feed card comments button', { contractId: contract.id })
      }}
    >
      <Tooltip text={`Comments`} placement="top" noTap>
        <Row className={'items-center gap-1.5'}>
          <ChatIcon className="h-6 w-6" />
          {totalComments > 0 && (
            <div className="text-ink-500 h-5 align-middle text-sm disabled:opacity-50">
              {totalComments}
            </div>
          )}
          {open && (
            <CommentsDialog
              highlightCommentId={highlightCommentId}
              contract={contract}
              open={open}
              setOpen={setOpen}
            />
          )}
        </Row>
      </Tooltip>
    </Button>
  )
}

function CommentsDialog(props: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  highlightCommentId?: string
}) {
  const { contract, highlightCommentId, open, setOpen } = props
  const comments = useCommentsOnContract(contract.id) ?? []

  const privateUser = usePrivateUser()
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx('bg-canvas-0 rounded-lg pl-2 pr-4 pt-4')}
      size={'lg'}
    >
      <div className="mb-2 ml-2">
        Comments on <span className="font-bold">{contract.question}</span>
      </div>
      <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'scrollbar-hide')}>
        <CommentsTabContent
          contract={contract}
          comments={comments}
          blockedUserIds={blockedUserIds}
          highlightCommentId={highlightCommentId}
          pinnedComments={[]}
        />
      </Col>
    </Modal>
  )
}
