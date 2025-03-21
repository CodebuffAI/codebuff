import { Message } from 'common/types/message'
import { logger } from './util/logger'
import { parseFileBlocks } from 'common/util/file'
import { generateCompactId, hasLazyEdit } from 'common/util/string'
import { geminiModels } from 'common/constants'
import { promptGeminiWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { promptRelaceAI } from './llm-apis/relace-api'
import { buildArray } from 'common/util/array'

export async function fastRewrite(
  initialContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  userMessage: string | undefined
) {
  const commentPreservationStartTime = Date.now()

  // First, preserve any comments from the original file in the edit snippet
  const editSnippetWithComments = await preserveCommentsInEditSnippet(
    initialContent,
    editSnippet,
    filePath,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId
  )
  const commentPreservationDuration = Date.now() - commentPreservationStartTime

  const relaceStartTime = Date.now()
  const messageId = generateCompactId('cb-')
  let response = await promptRelaceAI(initialContent, editSnippetWithComments, {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    userMessage,
    messageId,
  })
  const relaceDuration = Date.now() - relaceStartTime

  // Check if response still contains lazy edits
  if (
    hasLazyEdit(editSnippet) &&
    !hasLazyEdit(initialContent) &&
    hasLazyEdit(response)
  ) {
    const relaceResponse = response
    response = await rewriteWithGemini(
      initialContent,
      editSnippet,
      filePath,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      userMessage
    )
    logger.debug(
      { filePath, relaceResponse, geminiResponse: response, messageId },
      'Relace output contained lazy edits, trying Gemini'
    )
  }

  logger.debug(
    {
      initialContent,
      editSnippet,
      editSnippetWithComments,
      response,
      userMessage,
      messageId,
      commentPreservationDuration,
      relaceDuration,
      totalDuration: commentPreservationDuration + relaceDuration,
    },
    `fastRewrite of ${filePath}`
  )

  // Add newline to maintain consistency with original file endings
  return response
}

async function rewriteWithGemini(
  oldContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  userMessage: string | undefined
): Promise<string> {
  const prompt = `You are an expert programmer tasked with implementing changes to a file. Please rewrite the file to implement the changes shown in the edit snippet, while preserving the original formatting and behavior of unchanged parts.

Old file content:
\`\`\`
${oldContent}
\`\`\`

Edit snippet (the update to implement):
\`\`\`
${editSnippet}
\`\`\`

Integrate the edit snippet into the old file content to produce one coherent new file.

Important:
1. Preserve the original formatting, indentation, and comments of the old file
2. Only implement the changes shown in the edit snippet
3. Do not include any placeholder comments in your output (like "// ... existing code ..." or "# ... rest of the file ...")

Please output just the complete updated file content with the edit applied and no additional text.`
  const response = await promptGeminiWithFallbacks(
    [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '```\n' },
    ],
    undefined,
    {
      model: geminiModels.gemini2flash,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )

  // Remove the last \n``` if present
  return response.replace(/\n```\s*$/, '')
}

export async function preserveCommentsInEditSnippet(
  initialContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
) {
  const prompt = `You are an expert programmer. Rewrite the edit snippet to add back comments from the original file (if any), while removing newly added comments that describe changes or edits.

Original file:
\`\`\`
${initialContent}
\`\`\`

Edit snippet:
\`\`\`
${editSnippet}
\`\`\`

Guidelines for rewriting the edit snippet:
1. Prefer to keep the edit snippet text exactly the same. Where the edit snippet differs from the original file, prefer the edit snippet text. The most important thing is to preserve the edit snippet.

2. Secondly, add back ALL comments from the original file that match the code structure in the edit snippet. This includes:
   - JSDoc comments (/** ... */)
   - Multi-line comments (/* ... */)
   - Single-line comments (// ...)
   - Inline comments at the end of lines (// ...)
   - All other comment styles (# ..., <!-- ... -->, etc)

3. No need to add comments above or below the code being edited in the edit snippet.

4. It's common for no changes to be needed to the edit snippet, in which case you should print the edit snippet unchanged.

5. Pay special attention to comments inside try/catch blocks and other nested structures.

6. You must preserve any edit snippet comments marking placeholder sections of code like:
   - "// ... existing code ..." 
   - "# ... rest of the file ..."
   - "/* ... rest of the function ... */"
   - "<!-- ... rest of the file ... -->"
   - "// ... rest of the file ..."
   These indicate excerpts of code and must be kept.

7. Remove any new comments in the edit snippet that describe changes or edits, such as:
   - Comments starting with "Add", "Remove", "Change", "Update", "Fix", "Modify"
   - Comments explaining what changed or why it changed
   - Comments about new parameters, return values, or functionality

Here are some real examples:

Example 1 - Python class with docstrings and comments:
Original:
\`\`\`
class DataProcessor:
    """
    A class for processing data with validation and transformation.
    """
    
    def __init__(self, data_source):
        # Store the data source for later use
        self.data_source = data_source
        self.processed = False  # Track processing state
        
    def process(self, validate=True):
        """Process the data with optional validation."""
        if validate:
            # First validate the data
            self._validate()
            
        # Transform the data
        result = self._transform()
        self.processed = True
        return result
\`\`\`

Edit snippet:
\`\`\`
class DataProcessor:
    def __init__(self, data_source, max_size=1000):
        self.data_source = data_source
        self.processed = False
        # Add size limit parameter
        self.max_size = max_size
        
    def process(self, validate=True, transform_type="basic"):
        if validate:
            self._validate()
            
        result = self._transform(transform_type)
        self.processed = True
        return result
\`\`\`

Should become:
\`\`\`
class DataProcessor:
    """
    A class for processing data with validation and transformation.
    """
    
    def __init__(self, data_source, max_size=1000):
        # Store the data source for later use
        self.data_source = data_source
        self.processed = False  # Track processing state
        self.max_size = max_size
        
    def process(self, validate=True, transform_type="basic"):
        """Process the data with optional validation."""
        if validate:
            # First validate the data
            self._validate()
            
        # Transform the data
        result = self._transform(transform_type)
        self.processed = True
        return result
\`\`\`

Example 2 - HTML template with conditional rendering:
Original:
\`\`\`
<div class="user-profile">
  <!-- User info section -->
  <div class="info">
    <h1>{{user.name}}</h1>
    <!-- Only show email if verified -->
    <p v-if="user.emailVerified">
      {{user.email}}
    </p>
  </div>
  
  <!-- User stats -->
  <div class="stats">
    <span>Posts: {{user.posts}}</span>
  </div>
</div>
\`\`\`

Edit snippet:
\`\`\`
<!-- Add new profile layout -->
<div class="user-profile">
  <div class="info">
    <h1>{{user.name}}</h1>
    <p v-if="user.emailVerified">
      {{user.email}}
    </p>
    <!-- Add phone number display -->
    <p v-if="user.phoneVerified">
      {{user.phone}}
    </p>
  </div>
  
  <div class="stats">
    <span>Posts: {{user.posts}}</span>
    <span>Likes: {{user.likes}}</span>
  </div>
</div>
\`\`\`

Should become:
\`\`\`
<div class="user-profile">
  <!-- User info section -->
  <div class="info">
    <h1>{{user.name}}</h1>
    <!-- Only show email if verified -->
    <p v-if="user.emailVerified">
      {{user.email}}
    </p>
    <p v-if="user.phoneVerified">
      {{user.phone}}
    </p>
  </div>
  
  <!-- User stats -->
  <div class="stats">
    <span>Posts: {{user.posts}}</span>
    <span>Likes: {{user.likes}}</span>
  </div>
</div>
\`\`\`

Example 3 - Preserving placeholder comments:
Original:
\`\`\`
const config = {
  // Database settings
  database: {
    host: 'localhost',
    port: 5432
  },
  
  // Cache configuration
  cache: {
    enabled: true,
    ttl: 3600
  }
}
\`\`\`

Edit snippet:
\`\`\`
// ... existing code ...

// Cache configuration
cache: {
  enabled: true,
  ttl: 3600,
  maxSize: 1000  // Add size limit
}

// ... rest of the file ...
\`\`\`

Should stay exactly the same since the placeholder comments should be preserved:
\`\`\`
// ... existing code ...

// Cache configuration
cache: {
  enabled: true,
  ttl: 3600,
  maxSize: 1000
}

// ... rest of the file ...
\`\`\`

Example 4 - Full TypeScript file with interfaces and types:
Original:
\`\`\`
import { EventEmitter } from 'events'

/**
 * Represents a message in the chat system
 */
interface Message {
  id: string
  content: string
  timestamp: number
}

// Different types of notifications that can be sent
type NotificationType = 'message' | 'presence' | 'typing'

/**
 * Manages real-time chat functionality
 */
class ChatManager extends EventEmitter {
  private messages: Message[] = []
  private typingUsers = new Set<string>() // Track who is typing

  constructor() {
    super()
    // Initialize with empty state
    this.resetState()
  }

  /**
   * Add a new message to the chat
   * @returns The message ID
   */
  addMessage(content: string): string {
    const message = {
      id: Math.random().toString(),
      content,
      timestamp: Date.now()
    }
    
    // Add to internal storage
    this.messages.push(message)
    
    // Notify listeners
    this.emit('message', message)
    return message.id
  }

  private resetState() {
    this.messages = []
    this.typingUsers.clear()
  }
}

export default ChatManager
\`\`\`

Edit snippet:
\`\`\`
// ... existing imports ...

interface Message {
  id: string
  content: string
  timestamp: number
  reactions: Reaction[]  // Track reactions on messages
}

interface Reaction {
  emoji: string
  userId: string
}

type NotificationType = 'message' | 'presence' | 'typing' | 'reaction'

class ChatManager extends EventEmitter {
  private messages: Message[] = []
  private typingUsers = new Set<string>()

  constructor() {
    super()
    this.resetState()
  }

  addMessage(content: string): string {
    const message = {
      id: Math.random().toString(),
      content,
      timestamp: Date.now(),
      reactions: []
    }
    
    this.messages.push(message)
    this.emit('message', message)
    return message.id
  }

  addReaction(messageId: string, emoji: string, userId: string): void {
    const message = this.messages.find(m => m.id === messageId)
    if (!message) return

    message.reactions.push({ emoji, userId })
    this.emit('reaction', { messageId, emoji, userId })
  }

  private resetState() {
    this.messages = []
    this.typingUsers.clear()
  }
}

export default ChatManager
\`\`\`

Should become:
\`\`\`
// ... existing imports ...

/**
 * Represents a message in the chat system
 */
interface Message {
  id: string
  content: string
  timestamp: number
  reactions: Reaction[]
}

interface Reaction {
  emoji: string
  userId: string
}

// Different types of notifications that can be sent
type NotificationType = 'message' | 'presence' | 'typing' | 'reaction'

/**
 * Manages real-time chat functionality
 */
class ChatManager extends EventEmitter {
  private messages: Message[] = []
  private typingUsers = new Set<string>() // Track who is typing

  constructor() {
    super()
    // Initialize with empty state
    this.resetState()
  }

  /**
   * Add a new message to the chat
   * @returns The message ID
   */
  addMessage(content: string): string {
    const message = {
      id: Math.random().toString(),
      content,
      timestamp: Date.now(),
      reactions: []
    }
    
    // Add to internal storage
    this.messages.push(message)
    
    // Notify listeners
    this.emit('message', message)
    return message.id
  }

  addReaction(messageId: string, emoji: string, userId: string): void {
    const message = this.messages.find(m => m.id === messageId)
    if (!message) return

    message.reactions.push({ emoji, userId })
    this.emit('reaction', { messageId, emoji, userId })
  }

  private resetState() {
    this.messages = []
    this.typingUsers.clear()
  }
}

export default ChatManager
\`\`\`
`

  const messages = [
    { role: 'user' as const, content: prompt },
    { role: 'assistant' as const, content: '```\n' },
  ]
  const response = await promptGeminiWithFallbacks(messages, undefined, {
    clientSessionId,
    fingerprintId,
    userInputId,
    model: geminiModels.gemini2flash,
    userId,
    useGPT4oInsteadOfClaude: true,
  })

  // Remove the last \n``` if present
  return response.replace(/\n```\s*$/, '')
}

/**
 * This whole function is about checking for a specific case where claude
 * sketches an update to a single function, but forgets to add ... existing code ...
 * above and below the function.
 */
export const shouldAddFilePlaceholders = async (
  filePath: string,
  oldContent: string,
  rewrittenNewContent: string,
  messageHistory: Message[],
  fullResponse: string,
  userId: string | undefined,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string
) => {
  const fileBlocks = parseFileBlocks(
    messageHistory
      .map((message) =>
        typeof message.content === 'string'
          ? message.content
          : message.content.map((c) => ('text' in c ? c.text : '')).join('\n')
      )
      .join('\n') + fullResponse
  )
  const fileWasPreviouslyEdited = Object.keys(fileBlocks).includes(filePath)
  if (!fileWasPreviouslyEdited) {
    // If Claude hasn't edited this file before, it's almost certainly not a local-only change.
    // Usually, it's only when Claude is editing a function for a second or third time that
    // it forgets to add ${EXISTING_CODE_MARKER}s above and below the function.
    return false
  }

  const prompt = `
Here's the original file:

\`\`\`
${oldContent}
\`\`\`

And here's the proposed new content for the file:

\`\`\`
${rewrittenNewContent}
\`\`\`

Consider the above information and conversation and answer the following question.
Most likely, the assistant intended to replace the entire original file with the new content. If so, write "REPLACE_ENTIRE_FILE".
In other cases, the assistant forgot to include the rest of the file and just wrote in one section of the file to be edited. Typically this happens if the new content focuses on the change of a single function or section of code with the intention to edit just this section, but keep the rest of the file unchanged. For example, if the new content is just a single function whereas the original file has multiple functions, and the conversation does not imply that the other functions should be deleted.
If you believe this is the scenario, please write "LOCAL_CHANGE_ONLY". Otherwise, write "REPLACE_ENTIRE_FILE".
Do not write anything else.
`.trim()

  const startTime = Date.now()

  const messages = buildArray(
    ...messageHistory,
    fullResponse && {
      role: 'assistant' as const,
      content: fullResponse,
    },
    {
      role: 'user' as const,
      content: prompt,
    }
  )
  const response = await promptGeminiWithFallbacks(messages, undefined, {
    clientSessionId,
    fingerprintId,
    userInputId,
    model: geminiModels.gemini2flash,
    userId,
  })
  const shouldAddPlaceholderComments = response.includes('LOCAL_CHANGE_ONLY')
  logger.debug(
    {
      response,
      shouldAddPlaceholderComments,
      oldContent,
      rewrittenNewContent,
      filePath,
      duration: Date.now() - startTime,
    },
    `shouldAddFilePlaceholders response for ${filePath}`
  )

  return shouldAddPlaceholderComments
}
