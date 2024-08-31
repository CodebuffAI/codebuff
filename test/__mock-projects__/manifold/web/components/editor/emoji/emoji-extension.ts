import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { emojiSuggestion } from './emoji-suggestion'

export const EmojiExtension = Extension.create({
  name: 'emoji',

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...emojiSuggestion })]
  },
})
