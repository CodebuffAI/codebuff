import { execFileSync } from 'child_process'

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

  public newChat({ agent, prompt, params }: NewChatOptions): ChatContext {
    const args = [prompt, '-p', '--agent', agent]
    if (params) {
      args.push('--params', JSON.stringify(params))
    }
    if (this.cwd) {
      args.push('--cwd', this.cwd)
    }

    const a = execFileSync(CODEBUFF_BINARY, args, {
      stdio: 'pipe',
      env: { CODEBUFF_API_KEY: this.authToken },
    })

    return {
      agentId: agent,
      chatId: '', // TODO
    }
  }

  public continueChat({
    agent,
    prompt,
    params,
    context,
  }: ContinueChatOptions): ChatContext {
    agent = agent ?? context.agentId
    const args = [prompt, '-p', '--agent', agent]
    if (params) {
      args.push('--params', JSON.stringify(params))
    }
    if (this.cwd) {
      args.push('--cwd', this.cwd)
    }

    const a = execFileSync(CODEBUFF_BINARY, args, {
      stdio: 'pipe',
      env: { CODEBUFF_API_KEY: this.authToken },
    })

    return {
      agentId: agent,
      chatId: '', // TODO
    }
  }
}
