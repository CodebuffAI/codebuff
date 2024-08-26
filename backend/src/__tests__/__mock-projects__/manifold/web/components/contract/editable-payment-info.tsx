import { useEffect, useState } from 'react'
import { CheckIcon, XIcon, PencilIcon } from '@heroicons/react/solid'
import { IconButton } from '../buttons/button'
import { Input } from '../widgets/input'
import { usePrivateUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'

export const EditablePaymentInfo = () => {
  const [isEditing, setEditing] = useState(false)
  const privateUser = usePrivateUser()
  const [paymentInfo, setPaymentInfo] = useState(privateUser?.paymentInfo || '')

  useEffect(() => {
    setPaymentInfo(privateUser?.paymentInfo || '')
  }, [privateUser])

  const edit = () => {
    setEditing(true)
  }

  const onSave = async (newPaymentInfo: string) => {
    await api('me/private/update', {
      paymentInfo: newPaymentInfo,
    })
    setEditing(false)
  }

  return isEditing ? (
    <div className="flex items-center gap-2">
      <Input
        className="grow"
        type="text"
        maxLength={60}
        value={paymentInfo}
        onChange={(e) => setPaymentInfo(e.target.value || '')}
        autoFocus
      />
      <IconButton onClick={() => onSave(paymentInfo)} className="p-1">
        <CheckIcon className="h-4 w-4 text-teal-600" />
      </IconButton>
      <IconButton onClick={() => setEditing(false)} className="p-1">
        <XIcon className="text-scarlet-400 h-4 w-4" />
      </IconButton>
    </div>
  ) : (
    <div className="text-md flex items-center">
      <span>{paymentInfo}</span>
      <button
        onClick={edit}
        className="align-center hover:bg-ink-100 hover:text-ink-600 text-ink-500 ml-1 rounded p-1 transition-colors sm:group-hover:inline"
      >
        <PencilIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
