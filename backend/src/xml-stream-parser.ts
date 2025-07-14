import { Saxy } from '@codebuff/common/util/saxy'

interface TagHandler {
  params: string[]
  onTagStart: (tagName: string, attributes: Record<string, string>) => void
  onTagEnd: (tagName: string, parameters: Record<string, string>) => void
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
  let toolAttributes: Record<string, string> = {}
  
  // Set up event handlers
  parser.on('tagopen', (tag) => {
    const tagName = tag.name
    
    // Check if this is a tool tag
    if (tagHandlers[tagName] && !currentTool) {
      currentTool = tagName
      params = {}
      toolAttributes = {}
      
      // Parse attributes if any
      if (tag.attrs) {
        const { attrs, errors } = Saxy.parseAttrs(tag.attrs)
        if (errors.length > 0) {
          errors.forEach(error => errorHandler(tagName, error))
        }
        toolAttributes = attrs
        
        // Only include attributes that are in the params list
        const validAttrs = Object.keys(attrs).filter(attr => tagHandlers[tagName].params.includes(attr))
        validAttrs.forEach(attr => {
          params[attr] = attrs[attr]
        })
      }
      
      // Call onTagStart with correct parameters
      tagHandlers[tagName].onTagStart(tagName, toolAttributes)
      
      // Check for extra attributes not in params list AFTER onTagStart
      if (tag.attrs) {
        const { attrs } = Saxy.parseAttrs(tag.attrs)
        const extraAttrs = Object.keys(attrs).filter(attr => !tagHandlers[tagName].params.includes(attr))
        if (extraAttrs.length > 0) {
          errorHandler(tagName, `WARN: Ignoring extra parameters found in ${tagName} attributes: ${JSON.stringify(extraAttrs)}. Make sure to only use parameters defined in the tool!`)
        }
      }
    }
    // Check if this is a parameter tag inside a tool
    else if (currentTool && tagHandlers[currentTool].params.includes(tagName)) {
      if (currentParam) {
        errorHandler(currentTool, `WARN: Parameter found while parsing param ${currentParam} of ${currentTool}. Ignoring new parameter. Make sure to close all params and escape XML!`)
        return
      }
      currentParam = tagName
      paramContent = ''
    }
    // Handle unknown tags
    else if (currentTool) {
      if (tagHandlers[tagName]) {
        errorHandler(currentTool, `WARN: New tool started while parsing tool ${currentTool}. Ending current tool. Make sure to close all tool calls!`)
        // End current tool
        tagHandlers[currentTool].onTagEnd(currentTool, params)
        // Start new tool
        currentTool = tagName
        params = {}
        toolAttributes = {}
        
        if (tag.attrs) {
          const { attrs, errors } = Saxy.parseAttrs(tag.attrs)
          if (errors.length > 0) {
            errors.forEach(error => errorHandler(tagName, error))
          }
          toolAttributes = attrs
          
          // Only include attributes that are in the params list
          const validAttrs = Object.keys(attrs).filter(attr => tagHandlers[tagName].params.includes(attr))
          validAttrs.forEach(attr => {
            params[attr] = attrs[attr]
          })
        }
        
        tagHandlers[tagName].onTagStart(tagName, toolAttributes)
      } else {
        if (currentParam) {
          // Inside a parameter, treat as content
          paramContent += tag.rawTag
        } else {
          // Between parameters, warn about text
          errorHandler(tagName, `WARN: Tool not found. Make sure to escape non-tool XML! e.g. <${tagName}>`)
          errorHandler(currentTool, `WARN: Ignoring text in ${currentTool} between parameters. Make sure to only put text within parameters!`)
        }
      }
    } else {
      errorHandler(tagName, `WARN: Ignoring non-tool XML tag. Make sure to escape non-tool XML!`)
    }
  })
  
  parser.on('text', (text) => {
    if (currentParam) {
      paramContent += text.contents
    } else if (currentTool) {
      // Text between parameters - warn but ignore
      const trimmed = text.contents.trim()
      if (trimmed) {
        errorHandler(currentTool, `WARN: Ignoring text in ${currentTool} between parameters. Make sure to only put text within parameters!`)
      }
    } else {
      // Pass through text that's not inside a tool
      buffer += text.contents
    }
  })
  
  parser.on('tagclose', (tag) => {
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
      tagHandlers[currentTool].onTagEnd(currentTool, params)
      
      currentTool = null
      params = {}
      toolAttributes = {}
    }
    // Handle stray closing tags
    else {
      if (currentParam) {
        // Inside a parameter, treat as content
        paramContent += tag.rawTag
      } else {
        errorHandler(tagName, `WARN: Ignoring stray closing tag. Make sure to escape non-tool XML!`)
      }
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
      // Write to parser
      parser.write(chunk)
      
      // Yield the original chunk
      yield chunk
    }
    
    // End the parser
    parser.end()
    
    // Handle EOF scenarios
    if (currentParam) {
      errorHandler(currentParam, `WARN: Found end of stream while parsing parameter. End of parameter appended to response. Make sure to close all parameters!`)
      params[currentParam] = paramContent
      yield `</${currentParam}>`
    }
    
    if (currentTool) {
      tagHandlers[currentTool].onTagEnd(currentTool, params)
      yield `</${currentTool}>`
    }
    
  } catch (error) {
    if (currentTool) {
      errorHandler(currentTool, error instanceof Error ? error.message : 'Unknown error')
    }
    throw error
  }
}
