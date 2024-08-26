import { TiptapSpoiler } from 'common/util/tiptap-spoiler'
import { ReactNode, useState } from 'react'

export const DisplaySpoiler = TiptapSpoiler.extend({
  renderReact: (attrs: any, children: ReactNode) => (
    <SpoilerComponent>{children}</SpoilerComponent>
  ),
})

const SpoilerComponent = (props: { children: ReactNode }) => {
  const { children } = props

  const [open, setOpen] = useState(false)

  return (
    <span
      onClick={() => setOpen(true)}
      className={
        open
          ? 'bg-ink-200 cursor-text rounded-sm'
          : 'bg-ink-600 cursor-pointer select-none rounded-sm text-transparent [&_*]:invisible'
      }
    >
      {children}
    </span>
  )
}
