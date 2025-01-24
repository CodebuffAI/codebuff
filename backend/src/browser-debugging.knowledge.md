# Browser Debugging Architecture

## Key Design Decisions

1. **XML-First Communication**
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

3. **Comprehensive Data Collection**
   - Gather all available data in each loop iteration
   - Easier to have and not need than request again
   - Includes: console, network, errors, screenshots, metrics

4. **Isolation Requirements**
   - Browser instances must be isolated from user's regular browsing
   - Each debugging session gets fresh browser instance
   - Ensures clean state for reproduction attempts

## Implementation Guidelines

1. **Browser Instance Management**
   - Create new instance for each debugging session
   - Set up all event listeners before first navigation
   - Always clean up resources, even on errors
   - Use try/finally blocks for cleanup
   - Clear browser references before cleanup to prevent double-close scenarios
   - Co-locate browser session management with browser runner implementation

2. **Data Collection**
   - Prefer collecting too much over too little
   - Set up console capture before page load
   - Include stack traces when available
   - Compress screenshots before sending

3. **Error Handling**
   - Recover from browser crashes when possible
   - Clean up resources on any error
   - Report errors to both backend and user
   - Maintain audit trail of actions

## Common Pitfalls

1. **Resource Leaks**
   - Browser instances not properly closed
   - Event listeners not removed
   - Screenshots not cleaned up
   - Solution: Use session tracking and cleanup hooks

2. **WebSocket Testing**
   - Mock WebSocket instances must implement full interface (send, addEventListener, removeEventListener, close)
   - Use separate mock functions for each method to track calls
   - Cast mock object to WebSocket type for type safety
   - Remember to include readyState for connection status checks

2. **State Management**
   - Lost context between loop iterations
   - Missing error states
   - Solution: Maintain session state in backend

3. **Data Volume**
   - Sending too much console output
   - Uncompressed screenshots
   - Solution: Implement filtering and compression
