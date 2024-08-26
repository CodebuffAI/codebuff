import { SuggestionProps } from '@tiptap/suggestion'
import clsx from 'clsx'
import { Contract, contractPath } from 'common/contract'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Avatar } from '../../widgets/avatar'

// copied from https://tiptap.dev/api/nodes/mention#usage
const MentionList = forwardRef((props: SuggestionProps<Contract>, ref) => {
  const { items: contracts, command } = props

  const [selectedIndex, setSelectedIndex] = useState(0)
  useEffect(() => setSelectedIndex(0), [contracts])

  const submitUser = (index: number) => {
    const contract = contracts[index]
    if (contract)
      command({ id: contract.id, label: contractPath(contract) } as any)
  }

  const onUp = () =>
    setSelectedIndex((i) => (i + contracts.length - 1) % contracts.length)
  const onDown = () => setSelectedIndex((i) => (i + 1) % contracts.length)
  const onEnter = () => submitUser(selectedIndex)

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        onUp()
        return true
      }
      if (event.key === 'ArrowDown') {
        onDown()
        return true
      }
      if (event.key === 'Enter') {
        onEnter()
        return true
      }
      return false
    },
  }))

  return (
    <div className="w-42 bg-canvas-0 ring-ink-1000 absolute z-10 overflow-x-hidden rounded-md py-1 shadow-lg ring-1 ring-opacity-5 focus:outline-none">
      {!contracts.length ? (
        <span className="m-1 whitespace-nowrap">No results found yet</span>
      ) : (
        contracts.map((contract, i) => (
          <button
            className={clsx(
              'hover:bg-primary-200 flex h-8 w-full cursor-pointer select-none items-center gap-2 truncate px-4',
              selectedIndex === i ? 'text-ink-0 bg-primary-500' : 'text-ink-900'
            )}
            onClick={() => submitUser(i)}
            key={contract.id}
          >
            <Avatar avatarUrl={contract.creatorAvatarUrl} size="xs" />
            {contract.question}
          </button>
        ))
      )}
    </div>
  )
})

// Just to keep the formatting pretty
export { MentionList }
