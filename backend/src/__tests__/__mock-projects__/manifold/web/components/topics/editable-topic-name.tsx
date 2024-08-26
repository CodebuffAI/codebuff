import { CheckIcon, XIcon } from '@heroicons/react/solid'
import { useState } from 'react'
import { IconButton } from '../buttons/button'
import { ExpandingInput } from '../widgets/expanding-input'
import { Linkify } from '../widgets/linkify'
import { Group, MAX_GROUP_NAME_LENGTH } from 'common/group'
import { updateGroup } from 'web/lib/api/api'
import { Row } from 'web/components/layout/row'

export const EditableTopicName = (props: {
  group: Group
  isEditing: boolean
  onFinishEditing: (changed: boolean) => void
}) => {
  const { group, isEditing, onFinishEditing } = props

  const [text, setText] = useState(group.name)

  const onSave = async (newText: string) => {
    await updateGroup({ id: group.id, name: newText })
    onFinishEditing(true)
  }

  return isEditing ? (
    <Row className="text-ink-900 w-full items-center gap-2 text-2xl font-normal sm:text-3xl">
      <ExpandingInput
        className="grow"
        rows={1}
        maxLength={MAX_GROUP_NAME_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value || '')}
        autoFocus
        onFocus={(e) =>
          // Focus starts at end of text.
          e.target.setSelectionRange(text.length, text.length)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            onSave(text)
          }
        }}
      />
      <IconButton onClick={() => onSave(text)} size="xs">
        <CheckIcon className="h-4 w-4 text-teal-600" />
      </IconButton>
      <IconButton onClick={() => onFinishEditing(false)} size="xs">
        <XIcon className="text-scarlet-600 h-4 w-4" />
      </IconButton>
    </Row>
  ) : (
    <span className="text-xl font-medium sm:text-2xl">
      <Linkify text={group.name} />
    </span>
  )
}
