import { Saxy } from '@codebuff/common/util/saxy'
import { toolSchema } from '@codebuff/common/constants/tools'

interface TagHandler {
  params: string[]
  onTagStart: () => void
  onTagEnd: (name: string, parameters: Record<string, string>) => Promise<void>
}

export async function* processStreamWithTags(
  stream: AsyncGenerator<string, void, unknown>,
  tagHandlers: Record<string, TagHandler>,
  errorHandler: (toolName: string, error: string) => void
): AsyncGenerator<string, void, unknown> {
  // Create parser without schema validation (we'll validate in handlers)
  const parser = new Saxy()
  
  // Current state
  let currentTool: string | null = null
  let currentParam: string | null = null
  let params: Record<string, string> = {}
  let paramContent = ''
  let buffer = ''
  
  // Set up event handlers
  parser.on('tagopen', (tag) => {
    const tagName = tag.name
    
    // Check if this is a tool tag
    if (tagHandlers[tagName] && !currentTool) {
      currentTool = tagName
      params = {}
      
      // Parse attributes if any
      if (tag.attrs) {
        const { attrs, errors } = Saxy.parseAttrs(tag.attrs)
        if (errors.length > 0) {
          errors.forEach(error => errorHandler(tagName, error))
        }
        Object.assign(params, attrs)
      }
      
      // Call onTagStart
      tagHandlers[tagName].onTagStart()
    }
    // Check if this is a parameter tag inside a tool
    else if (currentTool && tagHandlers[currentTool].params.includes(tagName)) {
      currentParam = tagName
      paramContent = ''
    }
  })
  
  parser.on('text', (text) => {
    if (currentParam) {
      paramContent += text.contents
    } else {
      // Pass through text that's not inside a parameter
      buffer += text.contents
    }
  })
  
  parser.on('tagclose', async (tag) => {
    const tagName = tag.name
    
    // Check if we're closing a parameter tag
    if (currentParam === tagName) {
      params[currentParam] = paramContent
      currentParam = null
      paramContent = ''
    }
    // Check if we're closing a tool tag
    else if (currentTool === tagName) {
      // Call the handler
      try {
        await tagHandlers[currentTool].onTagEnd(currentTool, params)
      } catch (error) {
        errorHandler(currentTool, error instanceof Error ? error.message : 'Unknown error')
      }
      
      currentTool = null
      params = {}
    }
  })
  
  parser.on('error', (error) => {
    if (currentTool) {
      errorHandler(currentTool, error.message)
    }
  })
  
  // Process the stream
  try {
    for await (const chunk of stream) {
      // Add chunk to buffer
      buffer += chunk
      
      // Write to parser
      parser.write(chunk)
      
      // Yield any complete text from buffer
      if (buffer.length > 0 && !currentTool && !currentParam) {
        yield buffer
        buffer = ''
      }
    }
    
    // End the parser
    parser.end()
    
    // Yield any remaining buffer
    if (buffer.length > 0) {
      yield buffer
    }
  } catch (error) {
    if (currentTool) {
      errorHandler(currentTool, error instanceof Error ? error.message : 'Unknown error')
    }
    throw error
  }
}
