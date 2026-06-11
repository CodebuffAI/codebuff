// Ad-hoc harness: run researcher-web through the SDK with a neutral prompt
// and print the tool trace, to evaluate search/read thoroughness.
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

import { CodebuffClient } from '@codebuff/sdk'
import { loadLocalAgents } from '@codebuff/sdk/agents/load-agents'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

function loadEnvValue(name: string): string | undefined {
  if (process.env[name] && process.env[name] !== 'test') {
    return process.env[name]
  }
  for (const envPath of [
    path.join(homedir(), 'codebuff', '.env.local'),
    path.join(process.cwd(), '.env.local'),
  ]) {
    if (!existsSync(envPath)) continue
    const contents = readFileSync(envPath, 'utf8')
    const match = contents.match(new RegExp(`^${name}=(.*)$`, 'm'))
    const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '')
    if (value && value !== 'test') return value
  }
  return undefined
}

const apiKey = loadEnvValue('CODEBUFF_API_KEY')
if (!apiKey) {
  console.error('CODEBUFF_API_KEY not found')
  process.exit(1)
}

const prompt =
  process.argv.slice(2).join(' ') ||
  'What were the most significant new features in Bun 1.3, and how do reviewers say it compares to Node.js for production servers?'

const agentsPath = path.resolve(import.meta.dir, '../agents/researcher')
const loadedAgents = await loadLocalAgents({ agentsPath })
const researcherWeb = loadedAgents['researcher-web']
if (!researcherWeb) {
  console.error('researcher-web agent not found')
  process.exit(1)
}

const events: PrintModeEvent[] = []
const client = new CodebuffClient({ apiKey, cwd: process.cwd() })

const start = Date.now()
const result = await client.run({
  agent: 'researcher-web',
  agentDefinitions: [researcherWeb],
  maxAgentSteps: 12,
  handleEvent: (event) => events.push(event),
  prompt,
})

let searches = 0
let reads = 0
for (const event of events) {
  if (event.type === 'tool_call') {
    if (event.toolName === 'web_search') {
      searches++
      console.log(`[search] ${event.input.query}`)
    } else if (event.toolName === 'read_url') {
      reads++
      console.log(`[read]   ${event.input.url}`)
    }
  }
}

console.log(`\n--- ${searches} searches, ${reads} page reads, ${((Date.now() - start) / 1000).toFixed(0)}s ---\n`)

const output = result.output
if (output.type === 'error') {
  console.error('ERROR:', output.message)
} else if (output.type === 'lastMessage') {
  const messages = Array.isArray(output.value) ? output.value : [output.value]
  for (const message of messages) {
    const content = (message as { content?: unknown }).content
    if (typeof content === 'string') console.log(content)
    else if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'text') console.log(part.text)
      }
    }
  }
} else {
  console.log(JSON.stringify(output, null, 2).slice(0, 4000))
}

client.closeConnection?.()
