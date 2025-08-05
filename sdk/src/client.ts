import { execFileSync } from 'child_process'

import { processStream } from './process-stream'

import type {
  CodebuffClientOptions,
  ChatContext,
  ContinueChatOptions,
  NewChatOptions,
} from './types'

const CODEBUFF_BINARY = 'codebuff'

export class CodebuffClient {
  private authToken: string

  public cwd: string

  constructor({ apiKey, cwd }: CodebuffClientOptions) {
    // TODO: download binary automatically
    if (execFileSync('which', [CODEBUFF_BINARY]).toString().trim() === '') {
      throw new Error(
        'Codebuff binary not found. Please run "npm i -g codebuff"',
      )
    }

    this.authToken =
      apiKey.type === 'string'
        ? apiKey.value
        : process.env.CODEBUFF_API_KEY ?? ''
    this.cwd = cwd
  }

  public async runNewChat({
    agent,
    input: { prompt, params },
    handleEvent,
  }: NewChatOptions): Promise<ChatContext> {
    const args = ['-p', '--agent', agent]
    if (prompt) {
      args.push(prompt)
    }
    if (params) {
      args.push('--params', JSON.stringify(params))
    }
    if (this.cwd) {
      args.push('--cwd', this.cwd)
    }

    await processStream({
      codebuffArgs: args,
      authToken: this.authToken,
      handleEvent,
    })

    return {
      agentId: agent,
    }
  }

  // WIP
  private async continueChat({
    agent,
    input: { prompt, params },
    context,
    handleEvent,
  }: ContinueChatOptions): Promise<ChatContext> {
    agent = agent ?? context.agentId
    const args = ['-p', '--agent', agent]
    if (prompt) {
      args.push(prompt)
    }
    if (params) {
      args.push('--params', JSON.stringify(params))
    }
    if (this.cwd) {
      args.push('--cwd', this.cwd)
    }

    await processStream({
      codebuffArgs: args,
      authToken: this.authToken,
      handleEvent,
    })

    return {
      agentId: agent,
    }
  }
}
