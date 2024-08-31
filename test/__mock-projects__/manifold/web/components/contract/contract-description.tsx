import { useState } from 'react'
import { Contract, MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { Button } from '../buttons/button'
import { CollapsibleContent } from '../widgets/collapsible-content'
import { PencilIcon, PlusIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import { updateMarket } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'

export function ContractDescription(props: { contract: Contract }) {
  const { contract } = props

  const isAdmin = useAdmin()
  const user = useUser()
  const isCreator = user?.id === contract.creatorId

  return (
    <div className="mt-2">
      {isCreator || isAdmin ? (
        <EditableDescription contract={contract} />
      ) : (
        <CollapsibleContent
          content={contract.description}
          stateKey={`isCollapsed-contract-${contract.id}`}
          hideCollapse={!user}
        />
      )}
    </div>
  )
}

function EditableDescription(props: { contract: Contract }) {
  const { contract } = props
  const [editing, setEditing] = useState(false)

  const editor = useTextEditor({
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: contract.description,
  })

  const emptyDescription = editor?.isEmpty
  const [saving, setSaving] = useState(false)

  async function saveDescription() {
    if (!editor) return
    setSaving(true)
    await updateMarket({
      contractId: contract.id,
      descriptionJson: JSON.stringify(editor.getJSON()),
    })
      .catch((e) => {
        console.error(e)
        toast.error('Failed to save description. Try again?')
      })
      .finally(() => setSaving(false))
  }

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Row className="my-2 justify-end gap-2">
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            await saveDescription()
            setEditing(false)
          }}
          loading={saving}
          disabled={saving}
        >
          Save
        </Button>
      </Row>
    </>
  ) : (
    <>
      {!emptyDescription && (
        <CollapsibleContent
          content={contract.description}
          stateKey={`isCollapsed-contract-${contract.id}`}
        />
      )}
      <Row className="justify-end">
        <Button
          color="gray-white"
          size="2xs"
          onClick={() => {
            setEditing(true)
            editor?.commands.focus('end')
          }}
        >
          {emptyDescription ? (
            <>
              <PlusIcon className="mr-1 inline h-4 w-4" /> Add description
            </>
          ) : (
            <>
              <PencilIcon className="mr-1 inline h-4 w-4" /> Edit description
            </>
          )}
        </Button>
      </Row>
    </>
  )
}

export function JSONEmpty(text: string | JSONContent) {
  if (!text) return true
  if (typeof text === 'string') {
    return text === ''
  } else if ('content' in text) {
    return !(
      !!text.content &&
      text.content.length > 0 &&
      (!!text.content[0].content || !!text.content[0].attrs)
    )
  }
  return true
}
