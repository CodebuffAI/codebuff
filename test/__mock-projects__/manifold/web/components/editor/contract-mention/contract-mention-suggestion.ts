import type { MentionOptions } from '@tiptap/extension-mention'
import { PluginKey } from 'prosemirror-state'
import { MentionList } from './contract-mention-list'
import { makeMentionRender } from '../user-mention/mention-suggestion'
import { searchContracts } from 'web/lib/api/api'

type Suggestion = MentionOptions['suggestion']

export const contractMentionSuggestion: Suggestion = {
  char: '%',
  allowSpaces: true,
  allowedPrefixes: [' '],
  // exit if space right after % symbol
  allow: ({ state, range }) => {
    return state.doc.textBetween(range.from + 1, range.from + 2) !== ' '
  },
  pluginKey: new PluginKey('contract-mention'),
  items: async ({ query }) =>
    await searchContracts({
      term: query,
      filter: 'all',
      sort: 'score',
      limit: 5,
    }),
  render: makeMentionRender(MentionList),
}
