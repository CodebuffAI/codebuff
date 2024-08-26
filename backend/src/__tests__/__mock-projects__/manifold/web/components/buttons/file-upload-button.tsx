import { useRef } from 'react'
import { buttonClass } from 'web/components/buttons/button'

/** button that opens file upload window */
export function FileUploadButton(props: {
  onFiles: (files: File[]) => void
  accept?: string[]
  className?: string
  children?: React.ReactNode
  disabled?: boolean
}) {
  const {
    onFiles,
    accept = ['.gif', '.jpg', '.jpeg', '.png', '.webp', 'image/*'],
    className = buttonClass('md', 'indigo'),
    children,
    disabled,
  } = props
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type={'button'}
        className={className}
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept.join(',')}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files
          if (files) {
            onFiles(Array.from(files))
            if (ref.current) {
              ref.current.value = '' // clear file input in case user reuploads
            }
          }
        }}
      />
    </>
  )
}
