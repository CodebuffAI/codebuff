// Adopted from https://github.com/ueberdosis/tiptap/blob/main/demos/src/Experiments/Embeds/Vue/iframe.ts

import { Node, mergeAttributes } from '@tiptap/core'

export interface IframeOptions {
  HTMLAttributes: {
    [key: string]: any
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iframe: {
      setIframe: (options: { src: string }) => ReturnType
    }
  }
}

export default Node.create<IframeOptions>({
  name: 'iframe',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'w-full h-80',
        height: 80 * 4,
        sandbox:
          'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
      },
    }
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      frameBorder: {
        default: 0,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'iframe' }]
  },

  renderHTML({ HTMLAttributes }) {
    const iframeAttributes = mergeAttributes(
      HTMLAttributes,
      // Add options second, so they override originals, which prevents a XSS attack.
      this.options.HTMLAttributes
    )

    const blacklistedAttributes = ['srcdoc']
    const keysToRemove = Object.keys(iframeAttributes).filter((key) =>
      blacklistedAttributes.includes(key.toLowerCase())
    )
    for (const key of keysToRemove) {
      delete iframeAttributes[key]
    }

    const { src } = HTMLAttributes

    // This is a hack to prevent native from opening the iframe in an in-app browser
    // and mobile in another tab. In native, links with target='_blank' open in the in-app browser.
    if (src.includes('manifold.markets/embed/')) {
      return [
        'div',
        {
          style: {
            position: 'relative',
          },
          ...this.options.HTMLAttributes,
        },
        [
          'a',
          {
            href: src.replace('embed/', ''),
            target: '_self',
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 20, // This is equivalent to tailwind's z-20
              display: 'block',
            },
          },
        ],
        ['iframe', iframeAttributes],
      ]
    }

    return ['iframe', iframeAttributes]
  },

  addCommands() {
    return {
      setIframe:
        (options: { src: string }) =>
        ({ tr, dispatch }) => {
          const { selection } = tr
          const node = this.type.create(options)

          if (dispatch) {
            tr.replaceRangeWith(selection.from, selection.to, node)
          }

          return true
        },
    }
  },
})
