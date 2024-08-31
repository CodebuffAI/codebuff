import { Comment } from 'common/comment'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Content } from 'web/components/widgets/editor'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { formatTimeShort } from 'web/lib/util/time'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { useIsClient } from 'web/hooks/use-is-client'
import { DateTimeTooltip } from '../widgets/datetime-tooltip'

type EditHistory = Comment & {
  editCreatedTime: number
}
export const CommentEditHistoryButton = (props: { comment: Comment }) => {
  const { comment } = props
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [edits, setEdits] = useState<EditHistory[] | undefined>(undefined)

  const isClient = useIsClient()

  const loadEdits = async () => {
    const { data } = await run(
      db
        .from('contract_comment_edits')
        .select('*')
        .eq('comment_id', comment.id)
        .order('created_time', { ascending: false })
    )

    // created_time is the time the row is created, but the row's content is the content before the edit, aka created_time is when the content is deleted and replaced
    const comments = data.map((edit, i) => {
      const comment = edit.data as Comment
      const editCreatedTime =
        i === data.length - 1
          ? comment.createdTime
          : new Date(data[i + 1].created_time).valueOf()

      return { ...comment, editCreatedTime }
    })

    setEdits(comments)
  }

  useEffect(() => {
    if (showEditHistory && edits === undefined) {
      loadEdits()
    }
  }, [showEditHistory])

  if (!comment.editedTime) return null

  return (
    <>
      <DateTimeTooltip time={comment.editedTime} placement={'top'}>
        <button
          className={
            'text-ink-400 hover:bg-ink-50 mx-1 inline-block whitespace-nowrap rounded px-0.5 text-sm'
          }
          onClick={() => setShowEditHistory(true)}
        >
          (edited) {isClient && shortenedFromNow(comment.editedTime)}
        </button>
      </DateTimeTooltip>
      <Modal size={'md'} open={showEditHistory} setOpen={setShowEditHistory}>
        <div className={'bg-canvas-50 rounded-2xl p-4'}>
          <Title className="w-full text-center">Edit History</Title>
          {!edits ? (
            <LoadingIndicator />
          ) : (
            <Col className="gap-4">
              {edits.map((edit) => (
                <Col
                  key={edit.id}
                  className={'bg-ink-100 gap-2 rounded-xl rounded-tl-none p-2'}
                >
                  <div className="text-ink-500 text-sm">
                    {formatTimeShort(edit.editCreatedTime)}
                  </div>
                  <Content
                    size="sm"
                    className="mt-1 grow"
                    content={edit.content || edit.text}
                  />
                </Col>
              ))}
            </Col>
          )}
        </div>
      </Modal>
    </>
  )
}
