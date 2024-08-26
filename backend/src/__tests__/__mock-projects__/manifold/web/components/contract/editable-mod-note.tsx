import { useState } from 'react'
import { CheckIcon, XIcon, PencilIcon } from '@heroicons/react/solid'
import { IconButton } from '../buttons/button'
import { Input } from '../widgets/input'
import { Row } from '../layout/row'

type EditableModNoteProps = {
  reportId: number
  initialNote: string
  onSave: (reportId: number, newNote: string) => Promise<void>
}

export const EditableModNote = ({
  reportId,
  initialNote,
  onSave,
}: EditableModNoteProps) => {
  const [isEditing, setEditing] = useState(false)
  const [modNote, setModNote] = useState(initialNote)

  const edit = () => {
    setEditing(true)
  }

  const handleSave = async () => {
    await onSave(reportId, modNote)
    setEditing(false)
  }

  const handleCancel = () => {
    setModNote(initialNote)
    setEditing(false)
  }

  return isEditing ? (
    <Row className=" items-center gap-2">
      <Input
        className="grow"
        type="text"
        maxLength={200}
        value={modNote}
        onChange={(e) => setModNote(e.target.value || '')}
        autoFocus
      />
      <IconButton onClick={handleSave} className="p-1">
        <CheckIcon className="h-4 w-4 text-teal-600" />
      </IconButton>
      <IconButton onClick={handleCancel} className="p-1">
        <XIcon className="text-scarlet-400 h-4 w-4" />
      </IconButton>
    </Row>
  ) : (
    <Row className="text-md items-center">
      <span>{modNote}</span>
      <button
        onClick={edit}
        className="align-center hover:bg-ink-100 hover:text-ink-600 text-ink-500 ml-1 rounded p-1 transition-colors sm:group-hover:inline"
      >
        <PencilIcon className="h-4 w-4" />
      </button>
    </Row>
  )
}
