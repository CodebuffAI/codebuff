import z from 'zod/v4'

import { RESEARCH_EFFORTS } from '../../../constants/web-search'
import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'web_search'
const endsAgentStep = true
const inputSchema = z
  .object({
    query: z
      .string()
      .min(1, 'Query cannot be empty')
      .describe(`The search query to find relevant web content`),
    depth: z
      .enum(['standard', 'deep'])
      .optional()
      .default('standard')
      .describe(
        `Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'.`,
      ),
    research: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        `Set to true to run agentic deep research instead of a keyword search: a team of research agents searches the web, reads pages, synthesizes an answer, and returns it with citations. This is a PAID feature — FutureSearch charges real money per task (roughly $0.30–$2 depending on effort) and it takes tens of seconds to minutes to complete — never use it for a quick lookup. The result reports the actual charge in researchCostDollars; relay that cost to the user.`,
      ),
    researchEffort: z
      .enum(RESEARCH_EFFORTS)
      .optional()
      .default('medium')
      .describe(
        `When research is true: how much effort the research team spends. low (3 fast agents) is quickest and cheapest; medium (4 agents) is the balanced default; high (2 frontier agents) is the deepest but slowest and most expensive.`,
      ),
    researchDirections: z
      .array(z.string().min(1).max(300))
      .max(6)
      .optional()
      .describe(
        `When research is true: up to 6 concrete sub-questions or angles for the research agents to investigate. Each becomes an agent's prompt, so break the question down into the specific things you need answered.`,
      ),
    researchContext: z
      .array(z.string().min(1).max(2000))
      .max(10)
      .optional()
      .describe(
        `When research is true: prior findings or context already established, one string per finding. The agents research and build on these instead of starting from zero — include what you already know or have verified.`,
      ),
  })
  .describe(`Search the web for current information.`)
const description = `
Purpose: Search the web for current, up-to-date information on any topic. Use cases:
- Finding current information about technologies, libraries, or frameworks
- Researching best practices and solutions
- Getting up-to-date news or documentation
- Finding examples and tutorials
- Checking current status of services or APIs

The default mode returns JSON search results with titles, URLs, content snippets, and other available SERP fields such as answer boxes or related questions.

For hard, multi-source questions — comparisons, evaluations, or anything where raw search results are not an answer — set research: true to run deep research that returns a synthesized answer with citations to the sources it used. When doing so, break the question into concrete sub-angles with researchDirections and pass anything already established as researchContext so the agents build on prior findings rather than re-researching.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    query: 'Next.js 15 new features',
    depth: 'standard',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    query: 'React Server Components tutorial',
    depth: 'deep',
  },
  endsAgentStep,
})}
`.trim()

export const webSearchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        result: z.string(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
