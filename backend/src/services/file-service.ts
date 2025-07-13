import { 
  IFileService, 
  IWebSocketService,
  FileProcessingOptions,
  FileProcessingResult,
  StrReplaceOptions,
  FileReadingOptions,
  FileReadingResult
} from './interfaces'
import { processFileBlock as originalProcessFileBlock } from '../process-file-block'
import { processStrReplace as originalProcessStrReplace } from '../process-str-replace'
import { getFileReadingUpdates as originalGetFileReadingUpdates } from '../get-file-reading-updates'

export class FileService implements IFileService {
  constructor(private webSocketService: IWebSocketService) {}

  async processFileBlock(options: FileProcessingOptions): Promise<FileProcessingResult> {
    const {
      path,
      instructions,
      latestContentPromise,
      content,
      agentMessages,
      fullResponse,
      prompt,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId
    } = options

    return originalProcessFileBlock(
      path,
      instructions,
      latestContentPromise,
      content,
      agentMessages,
      fullResponse,
      prompt,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId
    )
  }

  async processStrReplace(options: StrReplaceOptions): Promise<FileProcessingResult> {
    const { path, replacements, latestContentPromise } = options
    return originalProcessStrReplace(path, replacements, latestContentPromise)
  }

  async getFileReadingUpdates(options: FileReadingOptions): Promise<FileReadingResult> {
    const {
      ws,
      messages,
      fileContext,
      requestedFiles,
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      repoId
    } = options

    return originalGetFileReadingUpdates(ws, messages, fileContext, {
      requestedFiles,
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      repoId
    })
  }
}
