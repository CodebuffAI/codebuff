import { TiptapTweet } from 'common/util/tiptap-tweet'

import { NodeViewWrapper } from '@tiptap/react'
import { TwitterTweetEmbed } from 'react-twitter-embed'

export const DisplayTweet = TiptapTweet.extend({
  renderReact: (attrs: any) => <TweetComponent {...attrs} />,
})

function TweetComponent(attrs: any) {
  // Remove the leading 't' from the tweet id
  const tweetId = attrs.tweetId.slice(1)

  return (
    <NodeViewWrapper className="tiptap-tweet [&_.twitter-tweet]:mx-auto">
      <TwitterTweetEmbed tweetId={tweetId} />
    </NodeViewWrapper>
  )
}
