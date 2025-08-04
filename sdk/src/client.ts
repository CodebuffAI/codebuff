import type {
  CodebuffClientOptions,
  Context,
  ContinueChatOptions,
  NewChatOptions,
} from './types'

export class CodebuffClient {
  private authToken: string
  private abortController: AbortController

  public cwd: string

  constructor({ apiKey, cwd, abortController }: CodebuffClientOptions) {
    this.authToken =
      apiKey.type === 'string'
        ? apiKey.value
        : process.env.CODEBUFF_API_KEY ?? ''
    this.cwd = cwd
    this.abortController = abortController
  }

  public newChat(options: NewChatOptions): Context {
    return {}
  }

  public continueChat(options: ContinueChatOptions): Context {
    return {}
  }
}
