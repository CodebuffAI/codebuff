import { JSONContent } from '@tiptap/core'
import { JSONEmpty } from '../contract/contract-description'
import { Col } from '../layout/col'
import { Content, TextEditor, useTextEditor } from '../widgets/editor'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'

export const DashboardText = (props: {
  content: JSONContent | undefined
  editing?: boolean
  onSave?: (content: JSONContent) => void
}) => {
  const { content, editing, onSave } = props

  if (editing) {
    return <DashboardTextEditor onSave={onSave} initialContent={content} />
  }

  if (!content || JSONEmpty(content)) {
    return null
  }

  return (
    <Col className="bg-canvas-0 rounded-2xl px-4 py-2 drop-shadow-md xl:px-6 xl:py-4">
      <Content content={content} size="lg" />
    </Col>
  )
}

function DashboardTextEditor(props: {
  onSave?: (content: JSONContent) => void
  initialContent?: JSONContent
}) {
  const { onSave, initialContent } = props

  const editor = useTextEditor({
    size: 'lg',
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: 'Write something, or add an image, tweet, or video.',
    defaultValue: initialContent,
  })

  const editorContent = editor?.getJSON()
  useEffectCheckEquality(() => {
    if (editorContent) onSave?.(editorContent)
  }, [editorContent])

  return <TextEditor editor={editor} className="border-none drop-shadow-md" />
}
