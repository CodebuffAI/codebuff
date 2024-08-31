import OpenAI from 'openai'
import * as dayjs from 'dayjs'
import { log } from 'shared/utils'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

export const generateEmbeddings = async (question: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let response
  try {
    response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    })
  } catch (e: any) {
    log.error(
      'Error generating embeddings ' +
        (!process.env.OPENAI_API_KEY ? ' (no OpenAI API key found) ' : ' ') +
        e.message
    )
    return undefined
  }
  log('Made embeddings for question', question)
  return response.data[0].embedding
}

export const getCloseDate = async (question: string, utcOffset?: number) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const now = dayjs.utc().format('M/D/YYYY h:mm a')

  let response
  try {
    const prompt = `Please return the user's desired end date for their question in the form: 12/31/2026 11:59 pm. The end date will serve as a reminder to decide the outcome of their question, e.g. if the question is: 'Will I go to school tomorrow?' the end date should be tomorrow.\n\nHere's their question, and remember: ONLY return the end date in the form: 12/31/2026 11:59 pm: ${question}\nNow: ${now}\nEnd date:`
    response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: prompt }],
      max_tokens: 15,
    })
  } catch (e: any) {
    log.error(
      'Error generating close date ' + !process.env.OPENAI_API_KEY
        ? ' (no OpenAI API key found) '
        : ' ' + e.message
    )
    return undefined
  }

  const text = response.choices[0].message.content
  if (!text) return undefined
  log(
    'AI-selected close date for question',
    question,
    ':',
    text,
    'utc offset',
    utcOffset ?? 'none'
  )

  const utcTime = dayjs.utc(text, 'M/D/YYYY h:mm a')
  const timestamp = utcTime.valueOf()
  if (!timestamp || !isFinite(timestamp)) return undefined

  // adjust for local timezone
  return utcTime.utcOffset(utcOffset ?? 0).valueOf()
}

const imagePrompt = (q: string) =>
  `Header image for a discussion thread about predicting "${q}". Do not include text.`

export const generateImage = async (q: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const prompt = imagePrompt(q)

  return await openai.images
    .generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
    })
    .then((res) => res.data[0].url)
    .catch((err) => (console.log(err), undefined))
}

export const promptGPT4 = async (prompt: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const result = await openai.chat.completions
    .create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: prompt }],
      max_tokens: 4096,
    })
    .catch((err) => (console.log(err), undefined))

  if (!result) return undefined

  const message = result.choices[0].message.content
  console.log('GPT4 returned message:', message)
  return message
}

export const promptGPT3 = async (prompt: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const result = await openai.chat.completions
    .create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'system', content: prompt }],
      max_tokens: 4096,
    })
    .catch((err) => (console.log(err), undefined))

  if (!result) return undefined

  const message = result.choices[0].message.content
  console.log('GPT3 returned message:', message)
  return message
}
