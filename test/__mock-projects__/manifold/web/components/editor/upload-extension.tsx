import { Editor, Extension } from '@tiptap/core'
import toast from 'react-hot-toast'
import { useMutation } from 'web/hooks/use-mutation'
import { uploadPublicImage } from 'web/lib/firebase/storage'

export const Upload = Extension.create({
  name: 'upload',

  addStorage: () => ({ mutation: {} }),
})

export const useUploadMutation = (editor: Editor | null) =>
  useMutation(
    (files: File[]) =>
      // TODO: Images should be uploaded under a particular username
      Promise.all(files.map((file) => uploadPublicImage('default', file))),
    {
      onSuccess(urls) {
        if (!editor || !urls.length) return
        let trans = editor.chain().focus()
        urls.forEach((src) => {
          trans = trans.setImage({ src })
          trans = trans.createParagraphNear()
        })
        trans.run()
      },
      onError(error: any) {
        toast.error(error.message ?? error)
      },
    }
  )

export type UploadMutation = ReturnType<typeof useUploadMutation>
