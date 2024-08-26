import { useState } from 'react'
import { Modal } from '../layout/modal'
import { Button } from './button'
import { api } from 'web/lib/api/api'
import { Row } from '../layout/row'
import { Input } from '../widgets/input'

export function UnresolveButton(props: { contractId: string }) {
  const { contractId } = props

  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [unresolving, setUnresolving] = useState(false)
  const [error, setError] = useState('')

  return (
    <>
      <Button size="2xs" color="gray" onClick={() => setOpen(true)}>
        Unresolve
      </Button>
      <Modal
        className="border-warning dark:bg-canvas-50  rounded-lg border-4 bg-yellow-50 p-4"
        open={open}
        setOpen={setOpen}
      >
        <h1 className="dark:text-warning mb-4 block text-2xl font-normal">
          ⚠️ Unresolve
        </h1>
        <div className="text-ink-700 mb-3">
          Unresolving will undo the resolution of this market. This will claw
          back any winnings from traders and put them back in the market. If you
          are sure you want to do this, type in 'UNRESOLVE'
        </div>
        <Row className={'gap-2'}>
          <Input
            className="w-40 text-xs"
            type="text"
            placeholder="UNRESOLVE"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            onClick={() => {
              if (unresolving) return
              setUnresolving(true)
              api('unresolve', { contractId })
                .then(() => {
                  setUnresolving(false)
                  setText('')
                  setOpen(false)
                })
                .catch((e) => {
                  setUnresolving(false)
                  setError(e.message)
                })
            }}
            loading={unresolving}
            disabled={text !== 'UNRESOLVE' || unresolving}
            size="xs"
            color="yellow"
          >
            Unresolve
          </Button>
        </Row>
        <span className={'text-error'}>{error}</span>
      </Modal>
    </>
  )
}
