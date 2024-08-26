import { Editor } from '@tiptap/react'
import { Contract } from 'common/contract'
import { SelectMarkets } from '../contract-select-modal'
import { embedContractCode } from '../buttons/share-embed-button'
import { insertContent } from './utils'
import clsx from 'clsx'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'

export function MarketModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { editor, open, setOpen } = props

  function onSubmit(contracts: Contract[]) {
    if (contracts.length == 1) {
      insertContent(editor, embedContractCode(contracts[0]))
    } else if (contracts.length > 1) {
      insertContent(
        editor,
        `<grid-cards-component contractIds="${contracts.map((c) => c.id)}" />`
      )
    }
    setOpen(false)
  }

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <Col className={clsx(MODAL_CLASS, 'relative h-[85vh] !items-stretch')}>
        <h1 className="text-primary-700 pb-0 text-center text-xl">
          Embed questions
        </h1>
        <SelectMarkets
          submitLabel={(len) =>
            len == 1 ? 'Embed 1 question' : `Embed grid of ${len} questions`
          }
          onSubmit={onSubmit}
          className="grow overflow-y-auto"
        />
      </Col>
    </Modal>
  )
}
