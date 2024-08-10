import OpenAI from 'openai'

let openai: OpenAI | null = null

const getOpenAI = () => {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPEN_AI_KEY,
      baseURL: 'https://oai.helicone.ai/v1',
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
      },
    })
  }

  return openai
}

export async function promptOpenAI(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  model: string
) {
  const openai = getOpenAI()
  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
    })

    if (
      response.choices &&
      response.choices.length > 0 &&
      response.choices[0].message
    ) {
      return response.choices[0].message.content || ''
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
