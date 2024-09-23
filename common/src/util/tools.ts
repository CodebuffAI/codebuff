import { Message } from 'src/actions'
import { match, P } from 'ts-pattern'
import { Tool } from '@anthropic-ai/sdk/resources'

export const didClientUseTool = (message: Message) =>
  match(message)
    .with(
      {
        role: 'user',
        content: P.array({ type: 'tool_result' }),
      },
      () => true
    )
    .otherwise(() => false)

export const getTools = (): Tool[] => {
  return [
    {
      name: 'scrape_web_page',
      description: `Retrieves the content of a web page given a URL. This tool is helpful when you need to gather information from external sources, such as documentation, APIs, or other web-based resources. Use this tool when the user asks for information that might be available on a specific website or when you need to reference external documentation to answer a question or solve a problem.`,
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the web page to scrape',
          },
        },
        required: ['url'],
      },
    } as Tool,
    {
      name: 'run_terminal_command',
      description: `Executes a command in the terminal and returns the result. This tool allows the assistant to run shell commands, which can be useful for various tasks such as grepping for code references, installing dependencies, running scripts, or performing system operations. Use this tool when you need to execute a specific command in the user's terminal.`,
      input_schema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to run in the terminal',
          },
        },
        required: ['command'],
      },
    } as Tool,
    // {
    //   name: 'search_manifold_markets',
    //   description: `Searches for relevant markets on Manifold and returns a list of Yes/No markets with their probabilities. This tool should be used when the user wants to know about a future event, like who will win the next presidential election. You can search for a relevant prediction market, which is a question about the future, and get the market's forecast as a probability which you can interpret.`,
    //   input_schema: {
    //     type: 'object',
    //     properties: {
    //       query: {
    //         type: 'string',
    //         description: 'The search query for finding relevant binary markets',
    //       },
    //       limit: {
    //         type: 'number',
    //         description: 'The maximum number of markets to return (default: 5)',
    //       },
    //     },
    //   },
    // } as Tool,
  ]
}

export const DEFAULT_TOOLS: Tool[] = getTools()
