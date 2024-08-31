import { useState } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { MAX_COMMENT_LENGTH } from 'common/comment'
import { safeLocalStorage } from 'web/lib/util/local'
import { useUser } from 'web/hooks/use-user'
import { call } from 'web/lib/api/api'
import { getApiUrl } from 'common/api/utils'
import { Col } from 'web/components/layout/col'
import { Extension } from '@tiptap/core'
import { useEvent } from 'web/hooks/use-event'
import { PaperAirplaneIcon, XIcon } from '@heroicons/react/solid'
import { ChatIcon } from '@heroicons/react/outline'

const interceptNewline = (callback: () => void) => {
  return Extension.create({
    name: 'interceptNewline',

    addKeyboardShortcuts() {
      return {
        Enter: () => {
          callback()
          return true
        },
      }
    },
  })
}

const key = 'live-chat'
export const ChatInput = (props: {
  showChat: boolean
  setShowChat: (showChat: boolean) => void
}) => {
  const { showChat, setShowChat } = props
  const submitComment = useEvent(async () => {
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    editor.commands.focus('end')
    // if last item is text, try to linkify it by adding and deleting a space
    if (editor.state.selection.empty) {
      editor.commands.insertContent(' ')
      const endPos = editor.state.selection.from
      editor.commands.deleteRange({ from: endPos - 1, to: endPos })
    }
    await call(getApiUrl('createchatmessage'), 'POST', {
      content: editor.getJSON(),
      channelId: '0',
    })
    setIsSubmitting(false)
    editor.commands.clearContent(true)
    // force clear save, because it can fail if editor unrenders
    safeLocalStorage?.removeItem(`text ${key}`)
  })

  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder: 'Say something...',
    extensions: [interceptNewline(submitComment)],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const user = useUser()
  if (user?.isBannedFromPosting) return <></>

  return (
    <Col className="sticky bottom-14 w-full items-center justify-center py-2 shadow-md lg:bottom-0">
      <TextEditor
        editor={editor}
        simple
        hideToolbar
        className={clsx('relative h-16', showChat ? '' : 'hidden lg:block')}
      >
        {user && (
          <button
            className=" text-ink-400 hover:text-ink-600 active:bg-ink-300 disabled:text-ink-300 absolute bottom-2 px-4 transition-colors sm:hidden"
            disabled={!editor || editor.isEmpty}
            onClick={submitComment}
          >
            {!isSubmitting ? (
              <PaperAirplaneIcon className="m-0 h-[25px] w-[22px] rotate-90 p-0" />
            ) : (
              <LoadingIndicator />
            )}
          </button>
        )}
      </TextEditor>
      <button
        type="button"
        className={clsx(
          'focus:ring-primary-500 fixed  left-3 z-20 inline-flex items-center rounded-full border  border-transparent  p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 lg:hidden',
          'disabled:bg-ink-300 text-ink-0 from-primary-500 hover:from-primary-700 to-blue-500 hover:to-blue-700 enabled:bg-gradient-to-r',
          'bottom-[70px]',
          showChat ? 'hidden' : ''
        )}
        onClick={() => setShowChat(!showChat)}
      >
        <ChatIcon className="h-6 w-6" aria-hidden="true" />
      </button>
      {showChat && (
        <button
          className={clsx('absolute -top-1 right-1 lg:hidden')}
          onClick={() => setShowChat(!showChat)}
        >
          <XIcon className={'bg-ink-300 h-6 rounded-full p-1'} />
        </button>
      )}
    </Col>
  )
}
