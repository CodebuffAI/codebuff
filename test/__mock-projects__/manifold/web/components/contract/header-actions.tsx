import { DotsVerticalIcon } from '@heroicons/react/solid'
import { getShareUrl } from 'common/util/share'
import { ReactNode, useState } from 'react'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { Contract } from 'common/contract'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'
import { LikeButton } from './like-button'
import { RepostButton } from 'web/components/comments/repost-modal'
import { Button } from '../buttons/button'

export function HeaderActions(props: {
  contract: Contract
  children?: ReactNode
}) {
  const { contract, children } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    // make tooltip children stretch
    <Row className="[&>*]:flex">
      {children}
      {!isBlocked(privateUser, contract.creatorId) && (
        <LikeButton
          user={user}
          size={'xs'}
          contentId={contract.id}
          contentType="contract"
          contentCreatorId={contract.creatorId}
          contentText={contract.question}
          trackingLocation={'contract page'}
        />
      )}
      {<RepostButton size="xs" contract={contract} />}

      <CopyLinkOrShareButton
        url={getShareUrl(contract, user?.username)}
        tooltip="Copy question share link"
        className="text-ink-500 hover:text-ink-600"
        size="xs"
        eventTrackingName="copy market link"
        trackingInfo={{ contractId: contract.id }}
      />

      <Tooltip text="Question details" placement="bottom" noTap>
        <Button
          color={'gray-white'}
          size="xs"
          onClick={() => setDialogOpen(true)}
        >
          <DotsVerticalIcon className="h-5 w-5" aria-hidden />
        </Button>
      </Tooltip>
      <ContractInfoDialog
        contract={props.contract}
        user={user}
        open={dialogOpen}
        setOpen={setDialogOpen}
      />
    </Row>
  )
}
