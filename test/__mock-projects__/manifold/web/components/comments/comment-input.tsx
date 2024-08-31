import { PaperAirplaneIcon } from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { ContractComment, MAX_COMMENT_LENGTH } from 'common/comment'
import { Avatar } from '../widgets/avatar'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { safeLocalStorage } from 'web/lib/util/local'
import toast from 'react-hot-toast'
import { BiRepost } from 'react-icons/bi'
import { Tooltip } from 'web/components/widgets/tooltip'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useEvent } from 'web/hooks/use-event'
import { APIError } from 'common/api/utils'
import { DisplayUser } from 'common/api/user-types'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { api } from 'web/lib/api/api'
import { CommentOnAnswer } from '../feed/comment-on-answer'
import { ReplyToUserInfo } from './comment'
import { ReplyToBetRow } from './comment-header'

export function CommentInput(props: {
  replyToUserInfo?: DisplayUser
  // Reply to another comment
  parentCommentId?: string
  onSubmitComment: (editor: Editor, type: CommentType) => Promise<void>
  // unique id for autosave
  pageId: string
  className?: string
  blocked?: boolean
  placeholder?: string
  commentTypes: CommentType[]
  autoFocus: boolean
  onClearInput?: () => void
}) {
  const {
    parentCommentId,
    replyToUserInfo,
    onSubmitComment,
    pageId,
    className,
    blocked,
    autoFocus,
    placeholder = 'Write a comment...',
    commentTypes,
    onClearInput,
  } = props
  const user = useUser()

  const key = `comment ${pageId} ${parentCommentId ?? ''}`
  const [isSubmitting, setIsSubmitting] = useState(false)

  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder,
    className: isSubmitting ? '!text-ink-400' : '',
  })

  const submitComment = useEvent(async (type: CommentType) => {
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    if (!user) {
      track('sign in to comment')
      await firebaseLogin()
      setIsSubmitting(false)
      return
    }
    editor.commands.focus('end')
    // if last item is text, try to linkify it by adding and deleting a space
    if (editor.state.selection.empty) {
      editor.commands.insertContent(' ')
      const endPos = editor.state.selection.from
      editor.commands.deleteRange({ from: endPos - 1, to: endPos })
    }

    try {
      await onSubmitComment?.(editor, type)
      if (!editor.isDestroyed) editor.commands.clearContent(true)
      // force clear save, because it can fail if editor unrenders
      safeLocalStorage?.removeItem(`text ${key}`)
      onClearInput?.()
    } catch (e) {
      console.error(e)
      if (e instanceof APIError) {
        toast.error(e.message)
      } else toast.error('Error submitting. Try again?')
    } finally {
      setIsSubmitting(false)
    }
  })

  if (user?.isBannedFromPosting) return <></>

  return blocked ? (
    <div className={'text-ink-500 mb-3 text-sm'}>
      You blocked the creator or they blocked you, so you can't comment.
    </div>
  ) : (
    <Row className={clsx(className, 'mb-2 w-full gap-1 sm:gap-2')}>
      <Avatar avatarUrl={user?.avatarUrl} username={user?.username} size="sm" />
      <CommentInputTextArea
        editor={editor}
        autoFocus={autoFocus}
        replyTo={replyToUserInfo}
        user={user}
        submit={submitComment}
        isSubmitting={isSubmitting}
        commentTypes={commentTypes}
      />
    </Row>
  )
}
const emojiMenuActive = (view: { state: any }) => {
  const regex = /^emoji\$.*$/ // emoji$ can have random numbers following it....❤️ tiptap
  let active = false

  for (const key in view.state) {
    if (regex.test(key)) {
      active = (view.state as any)[key].active
      if (active) break
    }
  }

  return active
}

export type CommentType = 'comment' | 'repost'
export function CommentInputTextArea(props: {
  user: User | undefined | null
  replyTo?: { id: string; username: string }
  editor: Editor | null
  submit?: (type: CommentType) => void
  isSubmitting: boolean
  submitOnEnter?: boolean
  autoFocus: boolean
  hideToolbar?: boolean
  commentTypes?: CommentType[]
}) {
  const {
    user,
    hideToolbar,
    submitOnEnter,
    editor,
    submit,
    isSubmitting,
    autoFocus,
    replyTo,
    commentTypes = ['comment'],
  } = props
  useEffect(() => {
    editor?.setEditable(!isSubmitting)
  }, [isSubmitting, editor])

  useEffect(() => {
    if (!editor) return

    // Submit on ctrl+enter or mod+enter key
    editor.setOptions({
      editorProps: {
        handleKeyDown: (view, event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            (!submitOnEnter ? event.ctrlKey || event.metaKey : true) &&
            // mention list is closed
            !(view.state as any).mention$.active &&
            // emoji list is closed
            !emojiMenuActive(view)
          ) {
            submit?.(commentTypes[0])
            event.preventDefault()
            return true
          }
          return false
        },
      },
    })
  }, [editor])

  useEffect(() => {
    if (!editor) return
    // insert at mention and focus
    if (replyTo && editor.isEmpty) {
      editor
        .chain()
        .setContent({
          type: 'mention',
          attrs: { label: replyTo.username, id: replyTo.id },
        })
        .insertContent(' ')
        .focus(undefined, { scrollIntoView: false })
        .run()
    }
  }, [replyTo, editor])

  useEffect(() => {
    if (editor && autoFocus) editor.commands.focus('end')
  }, [editor, autoFocus])

  return (
    <TextEditor editor={editor} simple hideToolbar={hideToolbar}>
      <Row className={''}>
        {user && !isSubmitting && submit && commentTypes.includes('repost') && (
          <Tooltip
            text={'Post question & comment to your followers'}
            className={'mt-2'}
          >
            <button
              disabled={!editor || editor.isEmpty}
              className="text-ink-500 hover:text-ink-700 active:bg-ink-300 disabled:text-ink-300 px-2 transition-colors"
              onClick={() => submit('repost')}
            >
              <BiRepost className="h-7 w-7" />
            </button>
          </Tooltip>
        )}
        {!isSubmitting && submit && commentTypes.includes('comment') && (
          <button
            className="text-ink-500 hover:text-ink-700 active:bg-ink-300 disabled:text-ink-300 px-4 transition-colors"
            disabled={!editor || editor.isEmpty}
            onClick={() => submit('comment')}
          >
            <PaperAirplaneIcon className="m-0 h-[25px] w-[22px] rotate-90 p-0" />
          </button>
        )}

        {submit && isSubmitting && (
          <LoadingIndicator
            size={'md'}
            className={'px-4'}
            spinnerClassName="border-ink-500"
          />
        )}
      </Row>
    </TextEditor>
  )
}

export function ContractCommentInput(props: {
  contract: Contract
  autoFocus: boolean
  className?: string
  replyTo?: Answer | Bet
  replyToUserInfo?: ReplyToUserInfo
  parentCommentId?: string
  clearReply?: () => void
  trackingLocation: string
  onSubmit?: (comment: ContractComment) => void
  commentTypes: CommentType[]
  onClearInput?: () => void
}) {
  const {
    contract,
    autoFocus,
    replyTo,
    parentCommentId,
    className,
    clearReply,
    trackingLocation,
    onSubmit,
    commentTypes,
    onClearInput,
  } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const isReplyToBet = replyTo && 'amount' in replyTo
  const isReplyToAnswer = replyTo && !isReplyToBet
  const replyToUserInfo = useDisplayUserById(replyTo?.userId) ?? undefined
  const onSubmitComment = useEvent(
    async (editor: Editor, type: CommentType) => {
      if (!user) return

      let comment: ContractComment | undefined
      if (type === 'comment') {
        comment = await api('comment', {
          contractId: contract.id,
          content: editor.getJSON(),
          replyToAnswerId: isReplyToAnswer ? replyTo.id : undefined,
          replyToCommentId: parentCommentId,
          replyToBetId: isReplyToBet ? replyTo.id : undefined,
        })
      } else {
        comment = await api('post', {
          contractId: contract.id,
          content: editor.getJSON(),
          betId: isReplyToBet ? replyTo.id : undefined,
        })
        if (comment) toast.success('Reposted to your followers!')
      }
      clearReply?.()
      onSubmit?.(comment)
      // TODO: Twomba tracking bet terminology
      await track(type, {
        location: trackingLocation,
        replyTo: isReplyToBet
          ? 'bet'
          : isReplyToAnswer
          ? 'answer'
          : replyToUserInfo
          ? 'user'
          : undefined,
        commentId: comment.id,
        contractId: contract.id,
      })
    }
  )

  return (
    <>
      {isReplyToBet ? (
        <ReplyToBetRow
          commenterIsBettor={replyTo?.userId === user?.id}
          betAmount={replyTo.amount}
          betOutcome={replyTo.outcome}
          bettorId={replyTo.userId}
          betOrderAmount={replyTo.orderAmount}
          betLimitProb={replyTo.limitProb}
          betAnswerId={replyTo.answerId}
          contract={contract}
          clearReply={clearReply}
        />
      ) : replyTo ? (
        <CommentOnAnswer answer={replyTo} clear={clearReply} />
      ) : null}

      <CommentInput
        autoFocus={autoFocus}
        replyToUserInfo={replyToUserInfo}
        parentCommentId={parentCommentId}
        onSubmitComment={onSubmitComment}
        pageId={contract.id + commentTypes.join(', ')}
        className={className}
        blocked={isBlocked(privateUser, contract.creatorId)}
        placeholder={
          replyTo || parentCommentId
            ? 'Write a reply ...'
            : contract.outcomeType === 'BOUNTIED_QUESTION'
            ? 'Write an answer or comment'
            : undefined
        }
        commentTypes={commentTypes}
        onClearInput={onClearInput}
      />
    </>
  )
}
