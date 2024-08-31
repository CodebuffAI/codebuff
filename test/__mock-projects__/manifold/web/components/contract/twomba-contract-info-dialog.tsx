import { Contract } from 'common/contract'

import { User } from 'common/user'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'

import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { ContractHistoryButton } from './contract-edit-history-button'
import { ShareEmbedButton, ShareIRLButton } from '../buttons/share-embed-button'
import { ShareQRButton } from '../buttons/share-qr-button'
import SuperBanControl from '../SuperBanControl'
import { Stats } from './contract-info-dialog'

export function TwombaContractInfoDialog(props: {
  contract: Contract
  user: User | null | undefined
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, user, open, setOpen } = props
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()
  const isCreator = user?.id === contract.creatorId

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 flex flex-col gap-4 rounded p-6"
    >
      <Stats contract={contract} user={user} />

      {!!user && (
        <>
          <Row className="my-2 flex-wrap gap-2">
            <ContractHistoryButton contract={contract} />
            <ShareQRButton contract={contract} />
            <ShareIRLButton contract={contract} />
            <ShareEmbedButton contract={contract} />
          </Row>
          <Row className="flex-wrap gap-2">
            {isAdmin || isTrusted ? (
              <SuperBanControl userId={contract.creatorId} />
            ) : null}
          </Row>
        </>
      )}
    </Modal>
  )
}
