// adapted from @n8body/tiptap-spoiler

import {
  Mark,
  markInputRule,
  markPasteRule,
  mergeAttributes,
} from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spoilerEditor: {
      setSpoiler: () => ReturnType
      toggleSpoiler: () => ReturnType
      unsetSpoiler: () => ReturnType
    }
  }
}

export type SpoilerOptions = {
  class: string
  inputRegex: RegExp
  pasteRegex: RegExp
}

const spoilerInputRegex = /(?:^|\s)((?:\|\|)((?:[^||]+))(?:\|\|))$/
const spoilerPasteRegex = /(?:^|\s)((?:\|\|)((?:[^||]+))(?:\|\|))/g

export const TiptapSpoiler = Mark.create<SpoilerOptions>({
  name: 'spoiler',

  inline: true,
  group: 'inline',
  inclusive: false,
  exitable: true,
  content: 'inline*',

  priority: 1001, // higher priority than other formatting so they go inside

  addOptions() {
    return {
      class: '',
      inputRegex: spoilerInputRegex,
      pasteRegex: spoilerPasteRegex,
    }
  },

  addCommands() {
    return {
      setSpoiler:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetSpoiler:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },

  addInputRules() {
    return [
      markInputRule({
        find: this.options.inputRegex,
        type: this.type,
      }),
    ]
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: this.options.pasteRegex,
        type: this.type,
      }),
    ]
  },

  parseHTML() {
    return [{ tag: 'spoiler' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'spoiler',
      mergeAttributes(HTMLAttributes, { class: this.options.class }),
      0,
    ]
  },
})
