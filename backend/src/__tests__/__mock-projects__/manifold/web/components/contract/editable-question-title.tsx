import { CheckIcon, XIcon, PencilIcon } from '@heroicons/react/solid'
import { Contract, MAX_QUESTION_LENGTH } from 'common/contract'
import { useState } from 'react'
import { updateMarket } from 'web/lib/api/api'
import { IconButton } from '../buttons/button'
import { ExpandingInput } from '../widgets/expanding-input'
import { Linkify } from '../widgets/linkify'

export const EditableQuestionTitle = (props: {
  contract: Contract
  canEdit?: boolean
}) => {
  const { contract, canEdit } = props

  const [isEditing, setEditing] = useState(false)
  const [text, setText] = useState(props.contract.question)

  const edit = () => {
    setEditing(true)
    setText(contract.question)
  }

  const onSave = async (newText: string) => {
    setEditing(false)
    await updateMarket({ contractId: contract.id, question: newText })
  }

  return isEditing ? (
    <div className="flex items-center gap-2">
      <ExpandingInput
        className="grow"
        rows={1}
        maxLength={MAX_QUESTION_LENGTH}
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
      <IconButton onClick={() => setEditing(false)} size="xs">
        <XIcon className="text-scarlet-400 h-4 w-4" />
      </IconButton>
    </div>
  ) : (
    <div className="group text-xl font-medium sm:text-2xl">
      <Linkify text={contract.question} />
      {canEdit && (
        <button
          onClick={edit}
          className="align-center hover:bg-ink-100 hover:text-ink-600 text-ink-500 ml-1 rounded p-1 transition-colors lg:hidden lg:group-hover:inline"
        >
          <PencilIcon className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      )}
    </div>
  )
}
