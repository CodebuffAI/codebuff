import { type PrivacyStatusType } from 'common/group'
import { useRouter } from 'next/router'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { api } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Modal } from '../layout/modal'
import { Input } from '../widgets/input'
import { Title } from '../widgets/title'

export function DeleteTopicModal(props: {
  group: { id: string; name: string; privacyStatus: PrivacyStatusType }
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  const { name, id, privacyStatus } = props.group

  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const router = useRouter()

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-50 rounded-xl p-4 sm:p-6"
      size="md"
    >
      <Title>Delete {name}?</Title>
      <p className="mb-2">
        Deleting a topic is permanent. All admins and followers will be removed
        and no one will be able to find this topic anywhere.
      </p>
      {privacyStatus === 'public' && (
        <p className="mb-2">
          Topics should only be deleted if they are low quality or duplicate.
          Ask @moderators on discord if you aren't sure.
        </p>
      )}
      <p className="mb-2">
        To delete, first untag all questions tagged with this topic, then type "
        {name}" below to confirm.
      </p>

      <Input
        placeholder="The name of this group"
        className="mb-2 mt-2 w-full"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />

      <Button
        onClick={() => {
          setLoading(true)
          api('group/by-id/:id/delete', { id })
            .then(() => {
              setLoading(false)
              toast.success('Topic deleted')
              router.replace('/browse')
            })
            .catch((e) => {
              setLoading(false)
              console.error(e)
              setError(e.message || 'Failed to delete topic')
            })
        }}
        color="red"
        disabled={loading || confirm != name}
        size="xl"
        className="w-full"
      >
        {loading ? 'Deleting...' : 'Delete Topic'}
      </Button>

      {error && <p className="mt-2 text-red-500">{error}</p>}
    </Modal>
  )
}
