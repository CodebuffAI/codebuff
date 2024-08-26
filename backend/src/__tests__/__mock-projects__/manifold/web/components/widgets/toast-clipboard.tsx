import { ClipboardCopyIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'

export function ToastClipboard(props: { className?: string }) {
  const { className } = props
  return (
    <Row
      className={clsx(
        'border-ink-400 absolute items-center' +
          'divide-ink-200 bg-canvas-0 gap-2 divide-x rounded-md border-2 ' +
          'h-15 text-ink-500 z-10 w-[15rem] p-2 pr-3',
        className
      )}
    >
      <ClipboardCopyIcon height={20} className={'mr-2 self-center'} />
      <div className="pl-4 text-sm font-normal">Link copied to clipboard!</div>
    </Row>
  )
}
