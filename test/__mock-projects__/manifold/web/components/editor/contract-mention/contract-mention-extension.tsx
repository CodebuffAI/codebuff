import { mergeAttributes } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import Link from 'next/link'
import { ContractMention as LoadedContractMention } from 'web/components/contract/contract-mention'
import { useContract } from 'web/hooks/use-contract'
import { contractMentionSuggestion } from './contract-mention-suggestion'

const name = 'contract-mention-component'

const ContractMention = (attrs: any) => {
  const { label, id } = attrs
  const contract = useContract(id)

  return (
    <span className="not-prose">
      {contract ? (
        <LoadedContractMention contract={contract} />
      ) : label ? (
        <Link
          href={label}
          className="!text-primary-700 hover:bg-primary-100 rounded-sm"
        >
          {label}
        </Link>
      ) : (
        '[loading...]'
      )}
    </span>
  )
}

/**
 *  Mention extension that renders React. See:
 *  https://tiptap.dev/guide/custom-extensions#extend-existing-extensions
 *  https://tiptap.dev/guide/node-views/react#render-a-react-component
 */
export const DisplayContractMention = Mention.extend({
  name: 'contract-mention',
  parseHTML: () => [{ tag: name }, { tag: `a[data-type="${name}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    name,
    mergeAttributes(HTMLAttributes),
    0,
  ],

  renderReact: (attrs: any) => <ContractMention {...attrs} />,
}).configure({ suggestion: contractMentionSuggestion })
