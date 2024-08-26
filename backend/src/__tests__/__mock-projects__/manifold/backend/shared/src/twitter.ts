import { TwitterApi } from 'twitter-api-v2'

export const postTweet = async (status: string) => {
  const keyString = process.env.TWITTER_API_KEY_JSON as string
  if (!keyString) {
    throw new Error('TWITTER_API_KEY_JSON not found in environment')
  }

  const apiKeys = JSON.parse(keyString.slice(1, -1))
  const client = new TwitterApi(apiKeys)

  const tweet = await client.v2.tweet({ text: status })
  return tweet.data
}
