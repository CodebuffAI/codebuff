import { Group, GroupRole, PrivacyStatusType } from 'common/group'
import { User } from 'common/user'
import { useState } from 'react'
import { useGroupRole } from 'web/hooks/use-group-supabase'
import { buildArray } from 'common/util/array'
import {
  DotsVerticalIcon,
  PencilIcon,
  PlusCircleIcon,
  TrashIcon,
} from '@heroicons/react/solid'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/comments/dropdown-menu'
import clsx from 'clsx'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { EditableTopicName } from 'web/components/topics/editable-topic-name'
import router from 'next/router'
import {
  AddContractToGroupModal,
  AddContractToGroupPermissionType,
} from 'web/components/topics/add-contract-to-group-modal'
import { BsFillPersonDashFill } from 'react-icons/bs'
import { BiSolidVolumeMute } from 'react-icons/bi'
import { usePrivateUser } from 'web/hooks/use-user'
import { blockGroup, unBlockGroup } from 'web/components/topics/topic-dropdown'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { DeleteTopicModal } from './delete-topic-modal'

export function TopicOptions(props: {
  group: Group
  user: User | null | undefined
  isMember: boolean
  unfollow: () => void
  className?: string
}) {
  const { group, user, isMember, unfollow, className } = props
  const privateUser = usePrivateUser()
  const [editingName, setEditingName] = useState(false)
  const [showAddContract, setShowAddContract] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const userRole = useGroupRole(group.id, user)
  const isCreator = group.creatorId == user?.id
  const isMobile = useIsMobile()

  const groupOptionItems = buildArray(
    isMember &&
      isMobile && {
        name: 'Add questions',
        icon: <PlusCircleIcon className="h-5 w-5" />,
        onClick: () => setShowAddContract(true),
      },
    userRole === 'admin' && {
      name: 'Edit name',
      icon: <PencilIcon className="h-5 w-5" />,
      onClick: () => setEditingName(true),
    },
    isMember &&
      !isCreator && {
        name: 'Unfollow',
        icon: <BsFillPersonDashFill className="h-5 w-5" />,
        onClick: unfollow,
      },
    !isMember &&
      privateUser && {
        name: privateUser.blockedGroupSlugs?.includes(group.slug)
          ? 'Unblock topic'
          : 'Block topic',
        icon: <BiSolidVolumeMute className="h-5 w-5" />,
        onClick: () =>
          privateUser.blockedGroupSlugs?.includes(group.slug)
            ? unBlockGroup(group.slug)
            : blockGroup(group.slug),
      },
    userRole === 'admin' && {
      name: 'Delete',
      icon: <TrashIcon className="text-scarlet-500 h-5 w-5" />,
      onClick: () => setShowDelete(true),
    }
  ) as DropdownItem[]
  return (
    <>
      <DropdownMenu
        closeOnClick={true}
        items={groupOptionItems}
        icon={<DotsVerticalIcon className={clsx('h-5 w-5')} />}
        className={className}
        menuItemsClass="flex flex-col"
        withinOverflowContainer={true}
      />
      <Modal open={editingName} setOpen={setEditingName}>
        <Col className={'bg-canvas-50 rounded-md p-4'}>
          <span className={'text-lg font-bold'}>Edit Topic Name</span>
          <div className={''}>
            <EditableTopicName
              group={group}
              isEditing={editingName}
              onFinishEditing={(changed) => {
                setEditingName(false)
                if (changed) router.reload()
              }}
            />
          </div>
        </Col>
      </Modal>
      {showAddContract && user && (
        <AddContractToGroupModal
          group={group}
          open={showAddContract}
          setOpen={setShowAddContract}
          user={user}
        />
      )}
      <DeleteTopicModal
        group={group}
        open={showDelete}
        setOpen={setShowDelete}
      />
    </>
  )
}

export function getAddContractToGroupPermission(
  privacyStatus: PrivacyStatusType,
  userRole: GroupRole | null | undefined,
  isCreator?: boolean
): AddContractToGroupPermissionType {
  if (userRole === 'admin' || userRole === 'moderator' || isCreator) {
    return 'any'
  }
  if (privacyStatus == 'public') {
    return 'new'
  }

  return 'none'
}
