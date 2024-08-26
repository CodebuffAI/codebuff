import clsx from 'clsx'
import { useState } from 'react'
import { Col } from '../layout/col'
import { Title } from '../widgets/title'
import { User } from 'common/user'
import { ManalinkInfo } from 'web/lib/supabase/manalinks'
import { ManalinkCard } from 'web/components/manalink-card'
import { Modal } from 'web/components/layout/modal'
import dayjs from 'dayjs'
import { Button } from '../buttons/button'
import { getManalinkUrl } from 'web/pages/links'
import { QRCode } from '../widgets/qr-code'
import { Input } from '../widgets/input'
import { ExpandingInput } from '../widgets/expanding-input'
import { Select } from '../widgets/select'
import { ENV_CONFIG } from 'common/envs/constants'
import { CopyLinkRow } from '../buttons/copy-link-button'
import { useCanSendMana } from 'web/hooks/use-can-send-mana'
import { api } from 'web/lib/api/api'

export function CreateLinksButton(props: {
  user: User
  highlightedSlug: string
  setHighlightedSlug: (slug: string) => void
}) {
  const { user, highlightedSlug, setHighlightedSlug } = props
  const [open, setOpen] = useState(false)
  const { canSend } = useCanSendMana(user)
  if (!canSend) return <></>

  return (
    <>
      <Modal open={open} setOpen={(newOpen) => setOpen(newOpen)}>
        <Col className="bg-canvas-0 text-ink-1000 gap-4 rounded-md px-8 py-6">
          <CreateManalinkForm
            highlightedSlug={highlightedSlug}
            user={user}
            onCreate={async (newManalink) => {
              const { slug } = await api('manalink', {
                amount: newManalink.amount,
                expiresTime: newManalink.expiresTime ?? undefined,
                maxUses: newManalink.maxUses ?? undefined,
                message: newManalink.message,
              })
              setHighlightedSlug(slug || '')
            }}
          />
        </Col>
      </Modal>

      <Button
        color={'indigo'}
        onClick={() => setOpen(true)}
        className={clsx('whitespace-nowrap')}
      >
        Create a Manalink
      </Button>
    </>
  )
}

function CreateManalinkForm(props: {
  highlightedSlug: string
  user: User
  onCreate: (m: ManalinkInfo) => Promise<void>
}) {
  const { user, onCreate, highlightedSlug } = props
  const [isCreating, setIsCreating] = useState(false)
  const [finishedCreating, setFinishedCreating] = useState(false)
  const defaultExpire = 'week'
  const [expiresIn, setExpiresIn] = useState(defaultExpire)

  const defaultMessage = 'from ' + user.name

  const [newManalink, setNewManalink] = useState<ManalinkInfo>({
    slug: '',
    creatorId: user.id,
    expiresTime: dayjs().add(1, defaultExpire).valueOf(),
    amount: 100,
    maxUses: 1,
    message: defaultMessage,
  })

  const EXPIRE_OPTIONS = {
    day: '1 Day',
    week: '1 Week',
    month: '1 Month',
    never: 'Never',
  }

  const expireOptions = Object.entries(EXPIRE_OPTIONS).map(([key, value]) => {
    return (
      <option key={key} value={key}>
        {value}
      </option>
    )
  })

  function setExpireTime(timeDelta: dayjs.ManipulateType | 'never') {
    const expiresTime =
      timeDelta === 'never' ? null : dayjs().add(1, timeDelta).valueOf()
    setNewManalink((m) => {
      return {
        ...m,
        expiresTime,
      }
    })
  }

  const url = getManalinkUrl(highlightedSlug)

  return (
    <>
      {!finishedCreating && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setIsCreating(true)
            onCreate(newManalink).finally(() => setIsCreating(false))
            setFinishedCreating(true)
          }}
        >
          <Title className="!my-0">Create a Manalink</Title>

          <div className="flex flex-col flex-wrap gap-x-5 gap-y-2">
            <div className="flex flex-auto flex-col">
              <label className="px-1 py-2">Amount</label>
              <div className="relative">
                <span className="text-ink-400 absolute mx-3 mt-3.5 text-sm">
                  {ENV_CONFIG.moneyMoniker}
                </span>
                <Input
                  className="w-full pl-10"
                  type="number"
                  min="1"
                  value={newManalink.amount}
                  onChange={(e) =>
                    setNewManalink((m) => {
                      return { ...m, amount: parseInt(e.target.value) }
                    })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="flex w-full flex-col md:w-1/2">
                <label className="px-1 py-2">Uses</label>
                <Input
                  type="number"
                  min="1"
                  value={newManalink.maxUses ?? ''}
                  onChange={(e) =>
                    setNewManalink((m) => {
                      return { ...m, maxUses: parseInt(e.target.value) }
                    })
                  }
                />
              </div>
              <div className="flex w-full flex-col md:w-1/2">
                <label className="px-1 py-2">Expires in</label>
                <Select
                  value={expiresIn}
                  defaultValue={defaultExpire}
                  onChange={(e) => {
                    setExpiresIn(e.target.value)
                    setExpireTime(
                      e.target.value as dayjs.ManipulateType | 'never'
                    )
                  }}
                >
                  {expireOptions}
                </Select>
              </div>
            </div>
            <div className="flex w-full flex-col">
              <label className="px-1 py-2">Message</label>
              <ExpandingInput
                placeholder={defaultMessage}
                maxLength={200}
                autoFocus
                value={newManalink.message}
                rows="3"
                onChange={(e) =>
                  setNewManalink((m) => {
                    return { ...m, message: e.target.value }
                  })
                }
              />
            </div>
          </div>
          <Button
            type="submit"
            color={'indigo'}
            className={clsx(
              'mt-8 whitespace-nowrap drop-shadow-md',
              isCreating ? 'disabled' : ''
            )}
          >
            Create
          </Button>
        </form>
      )}
      {finishedCreating && (
        <>
          <Title className="!my-0">Manalink Created!</Title>
          <ManalinkCard
            className="my-4"
            info={newManalink}
            numClaims={0}
            preview
          />
          <CopyLinkRow url={url} eventTrackingName={'copy manalink'} />
          <QRCode url={url} className="self-center" />
        </>
      )}
    </>
  )
}
