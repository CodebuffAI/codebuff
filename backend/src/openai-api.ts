import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from 'openai'

const configuration = new Configuration({
  apiKey: process.env.OPEN_AI_KEY,
})

const openai = new OpenAIApi(configuration)

export async function sendChatMessage(
  messages: ChatCompletionRequestMessage[]
) {
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4o',
      messages: messages,
    })

    if (
      response.data.choices &&
      response.data.choices.length > 0 &&
      response.data.choices[0].message
    ) {
      return response.data.choices[0].message.content || ''
    } else {
      throw new Error('No response from OpenAI')
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error)
    throw error
  }
}
