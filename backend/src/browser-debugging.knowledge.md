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
     - Configurable session timeout (default: 5 minutes)
     - Auto-shutdown when session time exceeded
     - Proper cleanup of browser resources
     - Important: Session timeout must be consistent between BrowserRunner and BROWSER_DEFAULTS
     - Use BROWSER_DEFAULTS.sessionTimeoutMs as single source of truth
   
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
       - Frame/Node detachment
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

5. **Isolation Requirements**
   - Browser instances must be isolated from user's regular browsing
   - Each debugging session gets fresh browser instance
   - Ensures clean state for reproduction attempts
   - Resources cleaned up after each session

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
   - Screenshot handling:
     - Multi-step optimization to keep screenshots under 1000 tokens (~4000 base64 chars):
       1. Start with small default settings (400×400, JPEG 40%)
       2. If too large, downscale resolution in steps (1.0×, 0.9×, 0.8×, 0.7×, 0.6×, 0.5×, 0.4×, 0.3×, 0.2×)
       3. If still too large, reduce JPEG quality very aggressively (40%, 20%, 10%, 5%, 2%)
       4. For PNG requests, can only reduce resolution since no quality option
       5. After analysis, screenshot data is removed from message history to save tokens
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
   - Configurable log filtering:
     - Filter by log type/level
     - Filter by category
     - Minimum severity threshold

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
