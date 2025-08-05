import { execFileSync } from 'child_process'

import { API_KEY_ENV_VAR } from '@codebuff/common/constants'

import { CODEBUFF_BINARY } from './constants'
import { processStream } from './process-stream'

import type {
  CodebuffClientOptions,
  ChatContext,
  ContinueChatOptions,
  NewChatOptions,
} from './types'

export class CodebuffClient {
  public cwd: string

  constructor({ cwd }: CodebuffClientOptions) {
    // TODO: download binary automatically
    if (execFileSync('which', [CODEBUFF_BINARY]).toString().trim() === '') {
      throw new Error(
        'Codebuff binary not found. Please run "npm i -g codebuff"',
      )
    }
    if (!process.env[API_KEY_ENV_VAR]) {
      throw new Error(
        `Codebuff API key not found. Please set the ${API_KEY_ENV_VAR} environment variable.`,
      )
    }

    this.cwd = cwd
  }

  public async runNewChat({
    agent,
    prompt,
    params,
    handleEvent,
  }: NewChatOptions): Promise<ChatContext> {
    const args = [prompt, '-p', '--agent', agent]
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
      handleEvent,
    })

    return {
      agentId: agent,
    }
  }

  // WIP
  private async continueChat({
    agent,
    prompt,
    params,
    context,
    handleEvent,
  }: ContinueChatOptions): Promise<ChatContext> {
    agent = agent ?? context.agentId
    const args = [prompt, '-p', '--agent', agent]
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
      handleEvent,
    })

    return {
      agentId: agent,
    }
  }
}
