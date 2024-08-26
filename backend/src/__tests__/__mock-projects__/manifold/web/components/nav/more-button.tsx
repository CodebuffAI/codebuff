import { DotsHorizontalIcon } from '@heroicons/react/outline'
import { ComponentType } from 'react'

export function MoreButton() {
  return <SidebarButton text={'More'} icon={DotsHorizontalIcon} />
}

function SidebarButton(props: {
  text: string
  icon: ComponentType<{ className?: string }>
  children?: React.ReactNode
}) {
  const { text, children } = props
  return (
    <div className="text-ink-600 hover:bg-ink-100 group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium hover:cursor-pointer">
      <props.icon
        className="text-ink-400 group-hover:text-ink-500 -ml-1 mr-3 h-6 w-6 flex-shrink-0"
        aria-hidden="true"
      />
      <span className="truncate">{text}</span>
      {children}
    </div>
  )
}
