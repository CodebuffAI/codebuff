import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'

const server = new McpServer({ name: 'freebuff-test-echo', version: '1.0.0' })

server.registerTool(
  'echo',
  {
    description: 'Echo text for the Freebuff MCP smoke test',
    inputSchema: { text: z.string() },
  },
  async ({ text }) => ({ content: [{ type: 'text', text: `echo:${text}` }] }),
)

await server.connect(new StdioServerTransport())
