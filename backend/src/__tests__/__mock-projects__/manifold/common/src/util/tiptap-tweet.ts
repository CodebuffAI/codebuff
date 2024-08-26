import { Node, mergeAttributes } from '@tiptap/core'

export interface TweetOptions {
  tweetId: string
}

// This is a version of the Tiptap Node config without addNodeView,
// since that would require bundling in tsx
export const TiptapTweet = Node.create<TweetOptions>({
  name: 'tiptapTweet',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      tweetId: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'tiptap-tweet',
      },
    ]
  },

  renderHTML(props: { HTMLAttributes: Record<string, any> }) {
    return ['tiptap-tweet', mergeAttributes(props.HTMLAttributes)]
  },
})
