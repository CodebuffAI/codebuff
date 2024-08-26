import { ArrowsExpandIcon, CameraIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import Image from 'next/image'
import { useState } from 'react'
import { Button, buttonClass } from '../buttons/button'
import { Modal } from '../layout/modal'
import { Tooltip } from '../widgets/tooltip'
import { useUser } from 'web/hooks/use-user'
import { useAdmin } from 'web/hooks/use-admin'
import toast from 'react-hot-toast'
import { useMutation } from 'web/hooks/use-mutation'
import { uploadPublicImage } from 'web/lib/firebase/storage'
import { FileUploadButton } from '../buttons/file-upload-button'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { TbCameraPlus } from 'react-icons/tb'
import { updateMarket } from 'web/lib/api/api'

export function ChangeBannerButton(props: {
  contract?: Contract
  className?: string
}) {
  const { className, contract } = props

  const [open, setOpen] = useState(false)

  const user = useUser()
  const isCreator = user?.id === contract?.creatorId
  const isAdmin = useAdmin()
  const canEdit = isCreator || isAdmin
  const hasCoverImage = !!contract?.coverImageUrl

  return (
    <>
      <Tooltip
        text={
          canEdit
            ? hasCoverImage
              ? 'Change banner'
              : 'Add banner'
            : 'See full banner'
        }
        noTap
        className={className}
      >
        <button
          className={clsx(
            hasCoverImage
              ? 'flex rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80'
              : buttonClass('sm', 'gray-white')
          )}
          onClick={() => setOpen(true)}
        >
          {canEdit ? (
            hasCoverImage ? (
              <CameraIcon className="h-5 w-5" />
            ) : (
              <TbCameraPlus className="h-5 w-5 stroke-[2.4]" />
            )
          ) : (
            <ArrowsExpandIcon className="h-5 w-5" />
          )}
        </button>
      </Tooltip>
      {contract && (
        <ChangeBannerModal
          open={open}
          setOpen={setOpen}
          canEdit={canEdit}
          contract={contract}
        />
      )}
    </>
  )
}

const ChangeBannerModal = (props: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  canEdit: boolean
}) => {
  const { open, setOpen, contract, canEdit } = props

  const src = contract.coverImageUrl

  return (
    <Modal open={open} setOpen={setOpen} size="xl" className="!m-0">
      <div className="flex flex-col items-center gap-2">
        {src != undefined ? (
          <>
            <Image
              src={src}
              width={600}
              height={400}
              alt=""
              className="w-full"
            />
            {canEdit && (
              <div className="mb-2 flex gap-2">
                <ChangeCoverImageButton contract={contract}>
                  Change
                </ChangeCoverImageButton>
                <Button
                  onClick={() =>
                    updateMarket({
                      contractId: contract.id,
                      coverImageUrl: null as any,
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-ink-100 text-ink-700 flex aspect-[1080/720] w-[600px] shrink items-center justify-center text-center italic">
              A canvas awaits
              <br />
              Unseen art in dream's embrace,
              <br />
              Your banner raised.
            </div>
            {canEdit && (
              <ChangeCoverImageButton contract={contract}>
                Upload
              </ChangeCoverImageButton>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

const ChangeCoverImageButton = (props: {
  contract: Contract
  children: string
}) => {
  const uploadMutation = useMutation(fileHandler, {
    onSuccess(url) {
      updateMarket({ contractId: props.contract.id, coverImageUrl: url })
    },
    onError(error: any) {
      toast.error(error.message ?? error)
    },
  })

  return (
    <FileUploadButton
      onFiles={uploadMutation.mutate}
      disabled={uploadMutation.isLoading}
    >
      {uploadMutation.isLoading && (
        <LoadingIndicator size="md" className="mr-2" />
      )}
      {props.children}
    </FileUploadButton>
  )
}

const fileHandler = async (files: File[]) => {
  if (!files.length) throw new Error('No files selected')
  return await uploadPublicImage('default', files[0])
}
