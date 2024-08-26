import Mention from '@tiptap/extension-mention'
import { mergeAttributes } from '@tiptap/react'
import { mentionSuggestion } from './mention-suggestion'
import { UserMention } from './user-mention'

const name = 'mention-component'

/**
 *  Mention extension that renders React. See:
 *  https://tiptap.dev/guide/custom-extensions#extend-existing-extensions
 *  https://tiptap.dev/guide/node-views/react#render-a-react-component
 */
export const DisplayMention = Mention.extend({
  parseHTML: () => [{ tag: name }, { tag: `a[data-type="${name}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    name,
    mergeAttributes({ HTMLAttributes }),
    0,
  ],
  renderReact: (attrs: any) => <UserMention userName={attrs.label} />,
}).configure({ suggestion: mentionSuggestion })
