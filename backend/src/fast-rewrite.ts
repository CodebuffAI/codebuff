import { geminiModels, openaiModels } from 'common/constants'
import { Message } from 'common/types/message'
import { buildArray } from 'common/util/array'
import { parseFileBlocks, parseMarkdownCodeBlock } from 'common/util/file'
import { generateCompactId, hasLazyEdit } from 'common/util/string'
import { promptFlashWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { promptRelaceAI } from './llm-apis/relace-api'
import { promptAiSdk, transformMessages } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from './util/logger'

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
  const relaceStartTime = Date.now()
  const messageId = generateCompactId('cb-')
  let response = await promptRelaceAI(initialContent, editSnippet, {
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
    response = await rewriteWithOpenAI(
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
      { filePath, relaceResponse, openaiResponse: response, messageId },
      `Relace output contained lazy edits, trying GPT-4o-mini ${filePath}`
    )
  }

  logger.debug(
    {
      initialContent,
      editSnippet,
      response,
      userMessage,
      messageId,
      relaceDuration,
    },
    `fastRewrite of ${filePath}`
  )

  return response
}

// Gemini flash can only output 8k tokens, openai models can do at least 16k tokens.
export async function rewriteWithOpenAI(
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
1. Preserve the original formatting, indentation, and comments of the old file. Please include all comments from the original file.
2. Only implement the changes shown in the edit snippet
3. Do not include any placeholder comments in your output (like "// ... existing code ..." or "# ... rest of the file ...")

Please output just the complete updated file content with the edit applied and no additional text.`

  const response = await promptAiSdk(
    [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '```\n' },
    ],
    {
      model: openaiModels.o3mini,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )

  return parseMarkdownCodeBlock(response) + '\n'
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
  const prompt = `You are an expert programmer.

The following "Original file" is the original content of the file. The "Edit snippet" describes a change to the original file that we want to make. We want to tweak it slightly to include comments from the original file. Your task is thus to rewrite the edit snippet to preserve comments from the original file. Secondarily, you can remove newly added comments that describe changes or edits.

Original file:
\`\`\`
${initialContent}
\`\`\`

Edit snippet:
\`\`\`
${editSnippet}
\`\`\`

Guidelines for rewriting the edit snippet:
1. Keep the code in the edit snippet exactly the same. We are only modifying it slightly to add or remove comments, all other lines in the edit snippet should be kept as is. The most important thing is to preserve the code change that the edit snippet describes.

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

Example 5 - Preserving the substantial code changes in the edit snippet:

Original:
\`\`\`
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { AspectRatio } from "../schema";
import sharp from "sharp";

// Helper to calculate dimensions for an aspect ratio
function calculateDimensions(width: number, height: number, targetRatio: string): { width: number; height: number } {
  const [w, h] = targetRatio.split(":").map(Number);
  const targetAspectRatio = w / h;
  const currentAspectRatio = width / height;
  
  if (currentAspectRatio > targetAspectRatio) {
    // Image is wider than target ratio
    const newWidth = Math.round(height * targetAspectRatio);
    return { width: newWidth, height };
  } else {
    // Image is taller than target ratio
    const newHeight = Math.round(width / targetAspectRatio);
    return { width, height: newHeight };
  }
}

// Action to generate variations
export const generate = action({
  args: { pieceId: v.id("pieces") },
  handler: async (ctx, args) => {
    // Get the piece
    const piece = await ctx.runQuery(internal.pieces.get, { id: args.pieceId });
    if (!piece) throw new Error("Piece not found");

    // Load the original image
    const imageResponse = await fetch(piece.generatedImageUrl);
    if (!imageResponse.ok) throw new Error("Failed to fetch original image");
    
    const buffer = await imageResponse.arrayBuffer();
    const image = sharp(Buffer.from(buffer));
    
    // Get image metadata
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Could not get image dimensions");
    }
    
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    const originalRatio = \`\${originalWidth}:\${originalHeight}\`;

    // Get existing variations
    const existingVariations = await ctx.runQuery(internal.variations.list, { pieceId: args.pieceId });
    const existingRatios = new Set(existingVariations.map(v => v.aspectRatio));

    // Process each aspect ratio
    const ratios = Object.values(AspectRatio);
    for (const ratio of ratios) {
      // Skip if variation already exists or matches original ratio
      if (existingRatios.has(ratio) || ratio === originalRatio) continue;

      try {
        // Calculate new dimensions
        const { width, height } = calculateDimensions(originalWidth, originalHeight, ratio);
        
        // Process the image
        const processedBuffer = await image
          .clone()
          .resize({
            width,
            height,
            fit: 'cover',  // This is equivalent to Jimp's cover
            position: 'center'
          })
          .jpeg({
            quality: 95,
            mozjpeg: true  // Use mozjpeg for better compression
          })
          .toBuffer();
        
        // Store the processed image
        const imageStorageId = await ctx.storage.store(new Blob([processedBuffer], { type: "image/jpeg" }));
        const imageUrl = await ctx.storage.getUrl(imageStorageId);

        if (!imageUrl) throw new Error("Failed to get URL for processed image");

        // Insert the variation directly using ctx.db
        await ctx.runMutation(internal.variations.updateStatus, {
          id: await ctx.runMutation(internal.variations.create, {
            pieceId: args.pieceId,
            aspectRatio: ratio,
            status: "processing"
          }),
          status: "complete",
          imageStorageId,
          imageUrl
        });

      } catch (error) {
        console.error(\`Failed to generate \${ratio} variation:\`, error);
        // Insert failed variation directly using ctx.db
        await ctx.runMutation(internal.variations.create, {
          pieceId: args.pieceId,
          aspectRatio: ratio,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return { success: true };
  }
});
\`\`\`

Edit snippet:
\`\`\`
// ... existing code ...

// Action to generate variations
export const generate = action({
  args: { pieceId: v.id("pieces") },
  handler: async (ctx, args) => {
    // Get the piece
    const piece = await ctx.runQuery(internal.pieces.get, { id: args.pieceId });
    if (!piece) throw new Error("Piece not found");

    // Load the original image
    const imageResponse = await fetch(piece.generatedImageUrl);
    if (!imageResponse.ok) throw new Error("Failed to fetch original image");
    
    const buffer = await imageResponse.arrayBuffer();
    const image = sharp(Buffer.from(buffer));
    
    // Get image metadata
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Could not get image dimensions");
    }
    
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    const originalRatio = \`\${originalWidth}:\${originalHeight}\`;

    // Get existing variations
    const existingVariations = await ctx.runQuery(internal.variations.list, { pieceId: args.pieceId });
    const existingRatios = new Set(existingVariations.map(v => v.aspectRatio));

    // Process each aspect ratio
    const ratios = Object.values(AspectRatio);
    for (const ratio of ratios) {
      // Skip if variation already exists or matches original ratio
      if (existingRatios.has(ratio) || ratio === originalRatio) continue;

      try {
        // Calculate new dimensions
        const { width, height } = calculateDimensions(originalWidth, originalHeight, ratio);
        
        // Process the image
        const processedBuffer = await image
          .clone()
          .resize({
            width,
            height,
            fit: 'cover',  // This is equivalent to Jimp's cover
            position: 'center'
          })
          .jpeg({
            quality: 95,
            mozjpeg: true  // Use mozjpeg for better compression
          })
          .toBuffer();
        
        // Store the processed image
        const imageStorageId = await ctx.storage.store(new Blob([processedBuffer], { type: "image/jpeg" }));
        const imageUrl = await ctx.storage.getUrl(imageStorageId);

        if (!imageUrl) throw new Error("Failed to get URL for processed image");

        // Insert directly into the database
        await ctx.db.insert("variations", {
          pieceId: args.pieceId,
          aspectRatio: ratio,
          status: "complete",
          imageStorageId,
          imageUrl,
          retryCount: 0
        });

      } catch (error) {
        console.error(\`Failed to generate \${ratio} variation:\`, error);
        await ctx.db.insert("variations", {
          pieceId: args.pieceId,
          aspectRatio: ratio,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
          retryCount: 0
        });
      }
    }

    return { success: true };
  }
});
\`\`\`

Should become (exactly the same as the edit snippet):
\`\`\`
// ... existing code ...

// Action to generate variations
export const generate = action({
  args: { pieceId: v.id("pieces") },
  handler: async (ctx, args) => {
    // Get the piece
    const piece = await ctx.runQuery(internal.pieces.get, { id: args.pieceId });
    if (!piece) throw new Error("Piece not found");

    // Load the original image
    const imageResponse = await fetch(piece.generatedImageUrl);
    if (!imageResponse.ok) throw new Error("Failed to fetch original image");
    
    const buffer = await imageResponse.arrayBuffer();
    const image = sharp(Buffer.from(buffer));
    
    // Get image metadata
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Could not get image dimensions");
    }
    
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    const originalRatio = \`\${originalWidth}:\${originalHeight}\`;

    // Get existing variations
    const existingVariations = await ctx.runQuery(internal.variations.list, { pieceId: args.pieceId });
    const existingRatios = new Set(existingVariations.map(v => v.aspectRatio));

    // Process each aspect ratio
    const ratios = Object.values(AspectRatio);
    for (const ratio of ratios) {
      // Skip if variation already exists or matches original ratio
      if (existingRatios.has(ratio) || ratio === originalRatio) continue;

      try {
        // Calculate new dimensions
        const { width, height } = calculateDimensions(originalWidth, originalHeight, ratio);
        
        // Process the image
        const processedBuffer = await image
          .clone()
          .resize({
            width,
            height,
            fit: 'cover',  // This is equivalent to Jimp's cover
            position: 'center'
          })
          .jpeg({
            quality: 95,
            mozjpeg: true  // Use mozjpeg for better compression
          })
          .toBuffer();
        
        // Store the processed image
        const imageStorageId = await ctx.storage.store(new Blob([processedBuffer], { type: "image/jpeg" }));
        const imageUrl = await ctx.storage.getUrl(imageStorageId);

        if (!imageUrl) throw new Error("Failed to get URL for processed image");

        // Insert directly into the database
        await ctx.db.insert("variations", {
          pieceId: args.pieceId,
          aspectRatio: ratio,
          status: "complete",
          imageStorageId,
          imageUrl,
          retryCount: 0
        });

      } catch (error) {
        console.error(\`Failed to generate \${ratio} variation:\`, error);
        await ctx.db.insert("variations", {
          pieceId: args.pieceId,
          aspectRatio: ratio,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
          retryCount: 0
        });
      }
    }

    return { success: true };
  }
});
\`\`\`
`

  const messages = [
    { role: 'user' as const, content: prompt },
    { role: 'assistant' as const, content: '```\n' },
  ]
  const response = await promptFlashWithFallbacks(transformMessages(messages), {
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
  const response = await promptFlashWithFallbacks(transformMessages(messages), {
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
