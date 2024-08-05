import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from 'openai'

let openai: OpenAIApi | null = null

const getOpenAI = () => {
  if (!openai) {
    const configuration = new Configuration({
      apiKey: process.env.OPEN_AI_KEY,
      baseOptions: {
        url: 'https://oai.hconeai.com/v1',
        headers: {
          'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
        },
      },
    })
    openai = new OpenAIApi(configuration)
  }

  return openai
}

export async function promptOpenAI(
  messages: ChatCompletionRequestMessage[],
  model: string
) {
  const openai = getOpenAI()
  try {
    const response = await openai.createChatCompletion({
      model,
      messages,
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
    console.error(
      'Error calling OpenAI API:',
      error && typeof error === 'object' && 'message' in error
        ? error.message
        : 'Unknown error'
    )
    throw error
  }
}
