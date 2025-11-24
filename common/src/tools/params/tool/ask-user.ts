import z from 'zod/v4'

import { $getToolCallString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const questionSchema = z.object({
  question: z.string().describe('The question to ask the user'),
  options: z
    .string()
    .array()
    .min(2, 'Each question must have at least 2 options')
    .describe('Array of answer options for the question'),
})

export type AskUserQuestion = z.infer<typeof questionSchema>

const toolName = 'ask_user'
const endsAgentStep = true
const inputSchema = z
  .object({
    questions: z
      .array(questionSchema)
      .min(1, 'Must provide at least one question')
      .describe('List of multiple choice questions to ask the user'),
  })
  .describe(
    'Ask the user a list of multiple choice questions. Each question must have at least 2 options. The agent execution will pause until the user submits their answers.',
  )

const outputSchema = z.object({
  answers: z
    .array(
      z.object({
        questionIndex: z.number(),
        selectedOption: z.string().optional().describe('The selected option text (if user chose from options)'),
        otherText: z.string().optional().describe('Custom text input (if user typed their own answer)'),
      }),
    )
    .optional()
    .describe('Array of user answers, one per question. Each answer has either selectedOption or otherText.'),
  skipped: z.boolean().optional().describe('True if user skipped the questions'),
})

const description = `
Ask the user multiple choice questions and pause execution until they respond. Each question supports single-select answers or custom text input.

The user can either:
- Select one of the provided options for each question
- Type a custom answer in the "Other" text field
- Skip the questions to provide different instructions instead

Example:
${$getToolCallString({
  toolName,
  inputSchema,
  input: {
    questions: [
      {
        question: 'Which authentication method should we use?',
        options: ['JWT tokens', 'Session cookies', 'OAuth2'],
      },
      {
        question: 'Should we add rate limiting?',
        options: ['Yes, add rate limiting', 'No, skip rate limiting'],
      },
    ],
  },
  endsAgentStep,
})}
`.trim()

export const askUserParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(outputSchema),
} satisfies $ToolParams
