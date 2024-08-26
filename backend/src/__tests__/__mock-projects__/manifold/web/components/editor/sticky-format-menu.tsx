import { EmojiHappyIcon } from '@heroicons/react/outline'
import {
  CodeIcon,
  PhotographIcon,
  PlusCircleIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import { MouseEventHandler, useState } from 'react'
import { FileUploadButton } from '../buttons/file-upload-button'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { EmbedModal } from './embed-modal'
import { MarketModal } from './market-modal'
import type { UploadMutation } from './upload-extension'
import { PiGifFill } from 'react-icons/pi'
import { GIFModal } from './gif-modal'
import { Row } from 'web/components/layout/row'
import ButtonDropdownMenu from 'web/components/comments/dropdown-button-menu'

/* Toolbar, with buttons for images and embeds */
export function StickyFormatMenu(props: {
  editor: Editor | null
  children?: React.ReactNode
}) {
  const { editor, children } = props
  const upload = editor?.storage.upload.mutation

  const [iframeOpen, setIframeOpen] = useState(false)
  const [GIFOpen, setGIFOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)

  return (
    <Row className="text-ink-600 ml-2 h-8 items-center">
      <ButtonDropdownMenu
        withinOverflowContainer={true}
        icon={
          <PlusCircleIcon
            className=" hover:text-ink-700 text-ink-500 h-5 w-5"
            aria-hidden
          />
        }
        items={[
          <UploadButton key={'upload-button'} upload={upload} />,
          <ToolbarButton
            key={'gif-button'}
            label="Add GIF"
            onClick={() => setGIFOpen(true)}
          >
            <PiGifFill className="h-5 w-5" aria-hidden />
          </ToolbarButton>,
          <ToolbarButton
            key={'embed-button'}
            label="Add embed"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setIframeOpen(true)
            }}
          >
            <CodeIcon className="h-5 w-5" aria-hidden="true" />
          </ToolbarButton>,

          <ToolbarButton
            key={'market-button'}
            label="Add question"
            onClick={() => setMarketOpen(true)}
          >
            <PresentationChartLineIcon className="h-5 w-5" aria-hidden="true" />
          </ToolbarButton>,
          <ToolbarButton
            key={'emoji-button'}
            label="Add emoji"
            onClick={() => insertEmoji(editor)}
          >
            <EmojiHappyIcon className="h-5 w-5" />
          </ToolbarButton>,
        ]}
      />

      <EmbedModal editor={editor} open={iframeOpen} setOpen={setIframeOpen} />
      <MarketModal editor={editor} open={marketOpen} setOpen={setMarketOpen} />
      <GIFModal editor={editor} open={GIFOpen} setOpen={setGIFOpen} />

      <div className="grow" />
      {children}
    </Row>
  )
}

function UploadButton(props: { upload: UploadMutation }) {
  const { upload } = props

  return (
    <FileUploadButton
      onFiles={(files) => upload?.mutate(files)}
      className=" hover:bg-canvas-100 active:bg-ink-300 relative flex p-1 transition-colors"
    >
      <Row className={'items-center justify-start gap-2'}>
        <PhotographIcon className="h-5 w-5" aria-hidden="true" />
        {upload?.isLoading ? (
          <LoadingIndicator
            className="absolute bottom-0 left-0 right-0 top-0"
            spinnerClassName="!h-6 !w-6 !border-2"
          />
        ) : (
          <span>Upload image</span>
        )}
      </Row>
    </FileUploadButton>
  )
}

function ToolbarButton(props: {
  label: string
  onClick: MouseEventHandler
  children: React.ReactNode
}) {
  const { label, onClick, children } = props

  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-canvas-100 active:bg-ink-300 p-1 transition-colors"
    >
      <Row className={'w-full items-center justify-start gap-2'}>
        {children}
        {label}
      </Row>
    </button>
  )
}

/** insert a colon, and a space if necessary, to bring up emoji selector */
const insertEmoji = (editor: Editor | null) => {
  if (!editor) return

  const textBefore = editor.view.state.selection.$from.nodeBefore?.text
  const addSpace = textBefore && !textBefore.endsWith(' ')

  editor
    .chain()
    .focus()
    .createParagraphNear()
    .insertContent(addSpace ? ' :' : ':')
    .run()
}
