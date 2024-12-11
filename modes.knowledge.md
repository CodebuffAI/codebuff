# Codebuff Modes

## Overview

Codebuff supports different modes of operation that affect the AI model used and the resulting cost/quality tradeoff.

## Implementation Details

The mode feature has been implemented across several components:

1. Command Line Interface:
   - Set via --mode flag: `codebuff --mode <cheap|normal|expensive>`
   - Parsed in npm-app/src/index.ts
   - Defaults to "normal" if not specified

2. Client-Server Communication:
   - Mode is passed through user-input action
   - Flows from CLI -> Client -> WebSocket -> Backend

3. Model Selection:
   - Controlled by getModelForMode helper in constants.ts
   - Main prompt (agent):
     - cheap: claude-3-haiku
     - normal: claude-3-sonnet
     - expensive: claude-3-sonnet
   - File requests:
     - cheap: claude-3-haiku (key files only)
     - normal: claude-3-haiku
     - expensive: gpt-4o

4. File Request Optimization:
   - Cheap mode skips non-obvious and test/config prompts
   - Only runs key file requests in cheap mode
   - Full file request suite in normal/expensive modes

## Implementation Plan

1. Command Line Interface
   - Add --mode flag to CLI with values "cheap", "normal", or "expensive"
   - Default to "normal" if not specified
   - Parse in npm-app/src/cli.ts using process.argv

2. Client-Server Communication
   - Add mode field to user-input client action in common/src/actions.ts
   - Pass mode from CLI to Client class
   - Include mode in websocket messages to backend

3. Backend Integration
   - Model selection by operation:
     - Main prompt (agent):
       - cheap: claude-3-haiku
       - normal: claude-3-sonnet
       - expensive: claude-3-sonnet
     - File requests:
       - cheap: claude-3-haiku (key files only)
       - normal: claude-3-haiku
       - expensive: gpt-4o
   - Update main-prompt.ts to pass mode to promptClaudeStream
   - Update request-files-prompt.ts to skip non-obvious and test/config prompts in cheap mode

4. Constants
   - Add mode-specific constants to common/src/constants.ts
   - Define model mappings for each mode

## Usage

```bash
# Run in cheap mode
codebuff --mode cheap

# Run in normal mode (default)
codebuff --mode normal
# or just
codebuff

# Run in expensive mode
codebuff --mode expensive
```

## Technical Details

1. Mode affects:
   - Model selection
   - Cost per request

2. Mode does not affect:
   - Available features/capabilities
   - Command syntax
   - File handling

## Future Considerations

- Add more granular modes beyond just cheap/normal/expensive
- Allow per-request mode override
- Add usage tracking per mode
