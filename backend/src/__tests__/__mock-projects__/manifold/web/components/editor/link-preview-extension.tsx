import { mergeAttributes, Node } from '@tiptap/core'
import { LinkPreviewNodeView } from 'web/components/editor/link-preview-node-view'

interface LinkPreviewOptions {
  HTMLAttributes: Record<string, unknown>
  hideCloseButton?: boolean
}
export type LinkPreviewProps = {
  url: string
  title: string
  description: string
  image: string
  id: string
  inputKey: string
  hideCloseButton: boolean
  deleteNode: () => void
}
const name = 'linkPreview'
export const LinkPreviewExtension = Node.create<LinkPreviewOptions>({
  name,
  atom: true,

  group: 'block',

  addAttributes() {
    return {
      id: {
        default: null,
      },
      url: {
        default: null,
      },
      title: {
        default: null,
      },
      description: {
        default: null,
      },
      image: {
        default: null,
      },
      deleteCallback: {
        default: null,
      },
      inputKey: {
        default: null,
      },
      hideCloseButton: {
        default: null,
      },
      deleteNode: {
        default: null,
      },
    }
  },

  renderReact(attrs: any) {
    return (
      <LinkPreviewNodeView
        {...attrs}
        hideCloseButton={this.options.hideCloseButton}
      />
    )
  },

  parseHTML() {
    return [
      {
        tag: name,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [name, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },
})
