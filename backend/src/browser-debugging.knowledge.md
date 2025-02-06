# Browser Debugging Architecture

## Key Design Decisions

1. **Tool-Based Architecture**
   - Browser actions are implemented as a tool call ("browser_action")
   - Uses the standard tool call system rather than custom action types
   - Follows same pattern as other tools (scrape_web_page, run_terminal_command, etc.)
   - Results returned through standard tool result format
   - This ensures consistent patterns across all client-side capabilities
   - Tool handler uses handleBrowserInstruction for robust session management
   - Important: Use handleBrowserInstruction rather than direct BrowserRunner calls to ensure proper session limits and error handling
   - Critical: Always call shutdown() on BrowserRunner instances before removing them from browserSessions to prevent resource leaks
   - Browser session IDs must use clientSessionId from websocket connection to ensure backend and client reference same session
   - This allows backend to properly manage browser sessions across multiple tool calls
   - Browser session IDs must use clientSessionId from websocket connection to ensure backend and client reference same session
   - This allows backend to properly manage browser sessions across multiple tool calls

2. **XML-First Communication**
   - Backend generates XML instructions instead of direct JSON
   - Uses key/value pairs in XML attributes (not nested elements)
   - Example: `<browser_action action="click" selector="#button" />`
   - Matches existing file editing patterns in codebase
   - XML->JSON conversion happens as last step
   - Simpler parsing and validation than nested XML
   - All instructions must pass Zod schema validation
   - Validation happens immediately after XML parsing
   - Fail fast if instruction is malformed

2. **Stateful Backend Analysis**
   - Backend maintains state during diagnostic loop
   - Allows for contextual decisions based on previous results
   - Better than stateless requests for complex debugging
   - Tracks:
     - Total errors (JS, network)
     - Consecutive errors
     - Session duration
     - Last action performed

3. **Comprehensive Data Collection**
   - Gather all available data in each loop iteration
   - Easier to have and not need than request again
   - Includes:
     - Console logs (info, warnings, errors)
     - Network requests/responses
     - JavaScript errors with stack traces
     - Performance metrics
     - Screenshots
     - Console warnings (including deprecation notices)
       - Note: Some deprecation warnings about "API for given entry type" are expected and can be ignored
       - These warnings are from Puppeteer's internal API usage and don't affect functionality
   - Data informs next action decisions

4. **XML Instruction Format**
   - Instructions are sent as XML for better structure and validation
   - Format: `<browser_action action="type" attr1="val1" attr2="val2" />`
   - Special characters in attributes must be escaped
   - Complex objects (like retryOptions) are JSON-stringified
   - Fallback to raw JSON if XML parsing fails
   - Client validates parsed XML against Zod schemas

5. **Flow Control & Recovery**
   - Session Management:
     - Single browser instance for the entire application
     - New browser sessions automatically close previous sessions
     - Proper cleanup of browser resources
     - Important: No session timeouts needed - browser cleanup happens:
       - When client disconnects
       - When new browser session starts
       - On errors via shutdown()
       - When explicitly requested
   
   - Error Thresholds:
     - Max consecutive errors (default: 3)
     - Total error threshold (default: 10)
     - Auto-shutdown when thresholds exceeded
   
   - Error Recovery:
     - Automatic retry mechanism:
       - maxRetries: Number of retry attempts (default: 3)
       - retryDelay: Milliseconds between retries (default: 1000)
       - retryOnErrors: List of error types to retry on
     - Browser crash recovery:
       - Detect TargetClosedError
       - Attempt browser restart if appropriate
       - Preserve session state during recovery
   
   - Error Analysis:
     - Pattern-based error detection with comprehensive error catalog
     - Helpful hints for common issues including:
       - Missing dependencies and undefined variables
       - Network connectivity and DNS issues
       - SSL/TLS certificate problems
       - Resource loading failures
       - Navigation timeouts
       - Frame/Node detachment (requires small delay after navigation)
       - Request aborts and redirects
     - Debug logging when enabled
     - Early error detection and graceful degradation
   
   - Performance Tracking:
     - Time to First Byte (TTFB)
     - Largest Contentful Paint (LCP)
     - First Contentful Paint (FCP)
     - DOM Content Loaded timing
     - Total session duration
     - Memory usage monitoring

5. **Profile Management**
   - Browser profiles stored in `~/.config/manicode/projects/<project>/browser`
   - Persists cookies, local storage and session data
   - Maintains login state between sessions
   - Isolated from user's regular browsing
   - Each debugging session reuses the same profile
   - Resources cleaned up properly on shutdown
   - Chrome args prevent restore popup and sandbox issues:
     - `--restore-last-session=false`: Disables session restore popup
     - `--no-sandbox`: Prevents permission issues
   - Important: When browser process fails to launch:
     - Check for and remove stale SingletonLock file
     - Ensure no orphaned browser processes are running
     - Use unique profile directory per session
     - Consider using temporary profiles for one-off checks

## Implementation Guidelines

1. **Browser Instance Management**
   - Create new instance for each debugging session
   - Set up all event listeners before first navigation
   - Always clean up resources, even on errors
   - Use try/finally blocks for cleanup
   - Clear browser references before cleanup to prevent double-close scenarios
   - Co-locate browser session management with browser runner implementation

2. **Data Collection & Filtering**
   - Prefer collecting too much over too little
   - Set up console capture before page load
   - Include stack traces when available
   - Compress screenshots before sending
   - Track all network requests/responses
   - Monitor memory usage and load times

3. **Browser Selection Strategy**
   - Let Puppeteer handle browser management
   - If launch fails:
     1. Run 'npx puppeteer browsers install chrome' to install/update Chrome
     2. Retry launch after installation
     3. If retry fails, throw error with details
   - This ensures:
     - Chrome stays up to date with Puppeteer version
     - Consistent debugging experience
     - Automatic recovery from version mismatches
     - Uses Puppeteer's built-in Chrome management

4. **Click Action Strategy**
   - AI provides 'targets' string with potential element patterns
   - Browser tries to match elements against these patterns
   - More resilient than exact selectors
   - Allows for fuzzy matching and multiple candidates
   - Better handles dynamic IDs and changing page structure
   - Uses range-based clicking:
     1. Takes required xRange and yRange specifying valid click regions
     2. Automatically chooses click point within specified ranges (currently midpoint)
     3. Logs chosen coordinates and ranges in debug mode
     4. Retains helper method getElementCoordinates for reference
     5. Provides detailed error messages with range information
     6. Important: When specifying click ranges:
        - Ranges should be as specific as possible while allowing for UI variations
        - Consider viewport scaling and responsive layouts when setting ranges
        - Use debug logging to verify chosen coordinates
        - Ranges make clicks more resilient to UI changes than exact coordinates
        - For best reliability:
          - Prefer smaller ranges when element position is known (e.g. 20px wide)
          - Use wider ranges for responsive elements that may move (e.g. 100px wide)
          - Always include some padding around exact coordinates (e.g. ±10px)
          - Log coordinates in debug mode to verify accuracy
          - Consider device pixel ratio when specifying ranges
          - For fixed elements, use narrower ranges (e.g. ±5px)
          - For dynamic elements, use wider ranges based on how much they move
        - Important: When passing ranges through XML:
          - Ranges must be valid JSON strings: '{"min": 100, "max": 120}'
          - Schema automatically parses JSON strings into objects
          - This ensures proper serialization through the websocket
        - Visual verification options:
          - Set visualVerify: true to enable screenshot comparison
          - Set visualThreshold (0-1) to control sensitivity (default 0.05)
          - System will retry clicks up to 3 times if no visual change detected
          - First click tries center of range, subsequent clicks use random points
          - Important: Consider performance impact of screenshot comparisons
          - Threshold guidelines:
            - 0.05 (5%) works well for most UI changes
            - Lower (1-2%) for subtle changes like text updates
            - Higher (10%+) for major layout changes
            - Consider viewport size when setting threshold
        - Timing and delays:
          - Use page.evaluate(() => new Promise(resolve => setTimeout(resolve, ms))) for delays
          - Do not use deprecated page.waitForTimeout()
          - Small delays (100ms) needed after clicks for animations to start
          - Longer delays (500ms) between retry attempts     - Screenshot handling:
       - Simple fixed settings for all screenshots:
         - JPEG format with 25% quality
         - Captures only visible viewport by default (fullPage: false)
         - Screenshot data sent to backend in full
         - Only take screenshots when explicitly requested, not after navigation/scroll
       - Message content handling:
         - Screenshots must be formatted as Anthropic image content blocks:
           ```typescript
           {
             type: 'image',
             source: {
               type: 'base64',
               media_type: 'image/jpeg',
               data: base64String
             }
           }
           ```
         - Format screenshots immediately when receiving from Puppeteer
         - Transform before sending through websocket to ensure consistent format
         - When saving to chat history, replace image data with placeholder
         - This ensures proper handling through the entire message pipeline
         - Most recent message's screenshot is preserved until processed by backend
         - When handling browser responses with screenshots:
           - Return BrowserResponse type directly from tool handlers
           - Use ts-pattern's match for elegant message content formatting:
             ```typescript
             content: match(response)
               .with({ screenshot: P.not(P.nullish) }, (response) => [
                 { type: 'text' as const, text: JSON.stringify({ ...response, screenshot: undefined }) },
                 response.screenshot
               ])
               .with(P.string, (str) => str)
               .otherwise((val) => JSON.stringify(val))
             ```
           - Important: Use 'as const' for literal type properties to ensure proper type inference
           - This provides cleaner pattern matching and better type safety than conditionals
         - Important: BrowserResponseSchema must use ImageContentSchema for screenshots:
           ```typescript
           const ImageContentSchema = z.object({
             type: z.literal('image'),
             source: z.object({
               type: z.literal('base64'),
               media_type: z.literal('image/jpeg'),
               data: z.string(),
             }),
           })
           ```
         - When transforming image content for different model providers:
           - Each provider needs its own message format transformation at the API boundary
           - Don't try to make types compatible across providers
           - Instead, explicitly transform at each API:
             ```typescript
             // OpenAI transformation for GPT-4V
             function transformedMessage(message: any, model: OpenAIModel): OpenAIMessage {
               return match(model)
                 .with(openaiModels.gpt4o, openaiModels.gpt4omini, () =>
                   match(message)
                     .with(
                       {
                         content: {
                           type: 'image',
                           source: {
                             type: 'base64',
                             media_type: 'image/jpeg',
                             data: P.string,
                           },
                         },
                       },
                       (m) => ({
                         ...message,
                         content: {
                           type: 'image_url',
                           image_url: {
                             url: `data:image/jpeg;base64,${m.content.source.data}`,
                           },
                         },
                       })
                     )
                     .otherwise(() => message)
                 )
                 .with(openaiModels.o3mini, () => message)
                 .exhaustive()
             }
             ```
           - Keep internal message format consistent (Anthropic-style)
           - Transform only at API boundaries when sending to providers
           - Each provider has its own image format:
             - OpenAI: `{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }`
             - Gemini: `{ inlineData: 'base64...', mimeType: 'image/jpeg' }`
             - Deepseek: No image support yet (noop transform)
             - Anthropic:
               - Sonnet: Native format (no transform needed)
               - Haiku: Filter out image blocks (no image support)
           - Important: Even when a provider uses our native format (like Anthropic),
             still implement the transform function to:
             1. Be explicit about image support in different models
             2. Make it easy to update when capabilities change
             3. Keep consistent patterns across all providers
           - Always log when stripping images from messages:
             ```typescript
             const hasImages = message.content.some((obj: { type: string }) => obj.type === 'image')
             if (hasImages) {
               logger.info('Stripping images from message - [MODEL] does not support images')
             }
             ```
           - This helps track when image support is needed and provides visibility into message transformations
           - Use pattern matching for clear, type-safe transformations
           - Use ts-pattern with array content matching:
             ```typescript
             match<Message, Message>(message)
               .with({ content: P.string }, () => message)
               .with(
                 {
                   content: P.array({
                     type: P.string,  // Match arrays where each element has a type field
                   }),
                   role: P.union('user', 'assistant'),
                 },
                 (msg) => {
                   // msg.content is now typed as Array<{ type: string }>
                   const hasImages = msg.content.some(obj => obj.type === 'image')
                   if (hasImages) {
                     // Handle image case
                   }
                   return msg
                 }
               )
               .exhaustive()
             ```
           - This provides:
             1. Type safety through pattern matching
             2. Proper type inference for array contents
             3. Exhaustive checking to ensure all cases are handled
             4. Clean separation between string and array content cases
           - For providers that may add image support in the future:
             ```typescript
             // Add a noop transformer that's easy to update later
             function transformedMessage(message: OpenAIMessage): OpenAIMessage {
               // For now, just pass through the message unchanged
               // When provider adds image support, we can update this to handle images
               return message
             }
             ```
     - Debug mode:
       - Screenshots are saved in chat-specific directories:
         - Path: ~/.config/manicode/<project>-<hash>/chats/<chat-id>/screenshots/
         - Each screenshot has an associated metadata.json with settings and metrics
         - This keeps screenshots with their chat context for better debugging
         - Prevents mixing screenshots from different chat sessions
     - Log handling:
       - Only logs with source: 'tool' are preserved in message history
       - Other logs are removed during message cleanup
       - Metrics are removed entirely (replaced with null)
       - Uses shared Log type from browser-actions.ts for consistency
       - Known issue: Browser action logs may appear duplicated in the response due to message transformation. This is a display artifact and does not affect functionality or actual logging
       - Handles both string and array message formats:
         - String: Legacy format or simple messages
         - Array: Structured content like tool calls and results
       - Use same cleanup logic for both formats to maintain consistency
       - When cleaning up message content:
         - Extract shared cleanup logic into helper functions
         - Apply same transformations to both string and array formats
         - This prevents bugs from divergent cleanup logic
     - Debug mode:
       - When enabled, saves screenshots to .codebuff/screenshots/
       - Includes metadata JSON with screenshot settings and metrics
       - Useful for debugging visual issues while keeping message history small
     - Debug mode:
       - When debug flag is enabled, screenshots are saved to .codebuff/screenshots/
       - Filenames include timestamps for easy tracking
       - Useful for debugging visual issues while keeping message history small
     - Screenshots >200KB are still split into chunks for transmission
     - Each optimization step is logged for debugging
     - Preserves aspect ratio during downscaling
     - Restores viewport after screenshot to avoid affecting subsequent actions
     - Omits screenshot with warning if size cannot be reduced enough
   - Enhanced logging categories:
     - error, warning, info, debug, verbose levels
     - Optional category tagging (network, javascript, console)
     - Numeric severity levels for fine-grained filtering
   - Logging strategy:
     - All browser-related logs should go through the logs array
     - This includes browser events, tool operations, and debugging info
     - Never write directly to console.log/error
     - Logs are automatically cleared after each action
     - This keeps logging consistent and ensures proper cleanup
   - Log prefixing:
     - All browser-related logs prefixed with 'browser:' (e.g. 'browser:error', 'browser:debug')
     - Helps distinguish between browser events and our own debugging output
     - Color-coded by level: red (error), yellow (warn), blue (info), green (log/debug)
   - Configurable log filtering:
     - Filter by log type/level
     - Filter by category
     - Minimum severity threshold
   - Logging strategy:
     - All browser-related logs should go through the logs array
     - This includes browser events, tool operations, and debugging info
     - Never write directly to console.log/error
     - Logs are automatically cleared after each action
     - This keeps logging consistent and ensures proper cleanup
   - Log prefixing:
     - All browser-related logs prefixed with 'browser:' (e.g. 'browser:error', 'browser:debug')
     - Helps distinguish between browser events and our own debugging output
     - Color-coded by level: red (error), yellow (warn), blue (info), green (log/debug)

3. **Error Handling**
   - Recover from browser crashes when possible
   - Clean up resources on any error
   - Report errors to both backend and user
   - Maintain audit trail of actions
   - Always log browser errors and logs to console with appropriate log levels:
     - error: Browser action failures and error logs
     - warn: Warning logs
     - info: Info logs
     - log: Default for other log types
   - Categorize errors for better debugging:
     - JavaScript runtime errors
     - Network request failures
     - Resource loading issues
     - Browser automation errors

4. **Testing Requirements**
   - Mock Puppeteer at module level for consistent behavior
   - Clear browser sessions between test cases
   - Test both success and error paths thoroughly
   - Verify proper cleanup in all scenarios
   - Mock all browser events (console, errors, metrics)
   - Place browser tests in __mock-data__/browser/ directory
   - Mock network requests and responses separately
   - Test error handling and cleanup in all scenarios

## Common Pitfalls

1. **Resource Leaks**
   - Browser instances not properly closed
   - Event listeners not removed
   - Screenshots not cleaned up
   - Solution: Use session tracking and cleanup hooks

2. **State Management**
   - Lost context between loop iterations
   - Missing error states
   - Solution: Maintain session state in backend

3. **Data Volume**
   - Sending too much console output
   - Uncompressed screenshots
   - Solution: Implement filtering and compression

4. **Error Recovery**
   - Browser crashes during automation
   - Network timeouts
   - Resource load failures
   - Solution: Implement retry mechanisms with backoff

## Best Practices

1. **Session Management**
   - One browser instance per debugging session
   - Clean setup and teardown
   - Proper error handling and recovery
   - Resource cleanup in all cases

2. **Data Collection**
   - Comprehensive but filtered logging
   - Efficient screenshot handling
   - Network request monitoring
   - Performance metrics tracking

3. **Error Handling**
   - Graceful degradation
   - Informative error messages
   - Proper cleanup on failures
   - Audit trail maintenance

4. **Testing**
   - Thorough mock setup
   - Comprehensive test coverage
   - Error path testing
   - Cleanup verification
