import { AddFundsModal } from '../add-funds-modal'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/solid'
import { Button } from '../buttons/button'
import router from 'next/router'
import { TWOMBA_ENABLED } from 'common/envs/constants'

export function AddFundsButton(props: { userId?: string; className?: string }) {
  const { userId, className } = props
  const [open, setOpen] = useState(false)
  const user = useUser()

  if (!userId || user?.id !== userId) return null
  return (
    <>
      <Button
        onClick={() =>
          TWOMBA_ENABLED ? router.push('/checkout') : setOpen(true)
        }
        size="md"
        color="gradient-pink"
        className={className}
      >
        <PlusIcon className="mr-1 h-3 w-3" />
        Get mana
      </Button>
      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
