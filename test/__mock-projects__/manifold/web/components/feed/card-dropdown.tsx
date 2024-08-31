import clsx from 'clsx'

import { buildArray } from 'common/util/array'
import DropdownMenu, { DropdownItem } from '../comments/dropdown-menu'
import { useIsFollowing } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import {
  DotsVerticalIcon,
  MinusCircleIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import { updateUserDisinterestEmbedding } from 'web/lib/api/api'
import { Contract } from 'common/contract'
import toast from 'react-hot-toast'
import { TiVolume, TiVolumeMute } from 'react-icons/ti'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'

export function FeedDropdown(props: {
  contract: Contract
  itemCreatorId: string | undefined
  interesting: boolean
  toggleInteresting: () => void
  importanceScore: number
}) {
  const { contract, itemCreatorId, interesting, toggleInteresting } = props
  const user = useUser()
  const creatorId = itemCreatorId ?? contract.creatorId
  const creator = useDisplayUserById(creatorId)
  const { isFollowing, toggleFollow } = useIsFollowing(user?.id, creatorId)

  const markUninteresting = async () => {
    await updateUserDisinterestEmbedding({
      contractId: contract.id,
      creatorId,
      // Currently interesting, toggling to not remove contract from disinterests
      removeContract: !interesting,
    })
    if (interesting)
      toast(`We won't show you content like that again`, {
        icon: <TiVolumeMute className={'h-5 w-5 text-teal-500'} />,
      })
    toggleInteresting()
  }

  const feedCardOptions = buildArray(
    user && {
      name: isFollowing
        ? `Unfollow ${creator?.name ?? contract.creatorName}`
        : `Follow ${creator?.name ?? contract.creatorName}`,
      icon: isFollowing ? (
        <MinusCircleIcon className="h-5 w-5" aria-hidden />
      ) : (
        <PlusCircleIcon className="h-5 w-5" aria-hidden />
      ),
      onClick: toggleFollow,
    },
    user && {
      name: interesting ? 'Show less of this' : 'Undo show less of this',
      icon: interesting ? (
        <TiVolumeMute className="h-5 w-5" aria-hidden />
      ) : (
        <TiVolume className="h-5 w-5" aria-hidden />
      ),
      onClick: () => markUninteresting(),
    }
  ) as DropdownItem[]

  if (!user) return <></>

  return (
    <DropdownMenu
      items={feedCardOptions}
      icon={<DotsVerticalIcon className={clsx('h-5 w-5')} />}
      menuWidth={'w-60'}
      menuItemsClass="bg-canvas-50"
    />
  )
}
