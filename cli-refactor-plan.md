# CLI Refactoring Plan

## Overview

The goal is to make `cli.ts` more modular by extracting functionality into dedicated modules and simplifying the main `CLI` class.

## Steps

1. Create `cli-handlers/auth.ts`:
   ```typescript
   // Handle login/logout commands
   export async function handleLogin(client: Client): Promise<void> {
     // Move login logic here
   }
   
   export async function handleLogout(client: Client): Promise<void> {
     // Move logout logic here
   }
   ```

2. Create `cli-handlers/info.ts`:
   ```typescript
   // Handle usage/help/diff commands
   export async function handleUsage(client: Client): Promise<void> {
     // Move usage logic here
   }
   
   export function handleHelp(): void {
     // Move displayMenu call here
   }
   
   // Note: handleDiff already exists
   ```

3. Create `cli-handlers/lifecycle.ts`:
   ```typescript
   // Handle exit/quit commands and process signals
   export function handleExit(client: Client, spinner: Spinner): void {
     // Move exit logic here
   }
   ```

4. Create `cli-handlers/command-processor.ts`:
   ```typescript
   export type CommandResult = 
     | { type: 'command'; handler: () => Promise<void> }
     | { type: 'prompt'; text: string }
     | { type: 'not_handled' }
   
   export function processCommand(
     input: string,
     client: Client,
     readyPromise: Promise<any>
   ): CommandResult {
     // Move command detection and handler selection here
   }
   ```

5. Create `ui/readline-manager.ts`:
   ```typescript
   export class ReadlineManager {
     private rl: readline.Interface
     private isPasting: boolean = false
     private lastInputTime: number = 0
     private consecutiveFastInputs: number = 0
     
     constructor(options: {
       completer: (line: string) => [string[], string]
       onLine: (line: string) => void
       onSigint: () => void
     }) {
       // Move readline setup here
     }
     
     setPrompt(prompt: string): void {
       // Move prompt management here
     }
     
     // ... other readline-related methods
   }
   ```

6. Refactor `cli.ts`:
   ```typescript
   export class CLI {
     private client: Client
     private readlineManager: ReadlineManager
     private isReceivingResponse: boolean = false
     private stopResponse: (() => void) | null = null
     
     constructor(options: CliOptions) {
       this.client = new Client(/* ... */)
       this.readlineManager = new ReadlineManager({
         completer: this.completer.bind(this),
         onLine: this.handleLine.bind(this),
         onSigint: this.handleSigint.bind(this)
       })
       // ... minimal initialization
     }
     
     private async handleLine(line: string) {
       const result = processCommand(line, this.client, this.readyPromise)
       if (result.type === 'command') {
         await result.handler()
       } else if (result.type === 'prompt') {
         await this.forwardUserInput(result.text)
       }
     }
     
     // ... minimal set of methods
   }
   ```

## Implementation Notes

1. Keep the `CLI` class focused on orchestration:
   - Initialize components
   - Wire up event handlers
   - Maintain core state
   - Delegate to handlers

2. Handler modules should:
   - Be pure functions where possible
   - Take required dependencies as parameters
   - Return promises for async operations
   - Use types for parameters and return values

3. The `ReadlineManager` should:
   - Encapsulate readline setup and management
   - Handle keypress events
   - Manage the prompt
   - Detect pasting
   - Provide a clean API for the CLI class

4. Command processing should:
   - Use a clear type system for commands
   - Make it easy to add new commands
   - Keep command implementations separate from detection
   - Support async command handlers

5. State management:
   - Keep state close to where it's used
   - Pass state explicitly to handlers
   - Avoid global state
   - Use TypeScript to enforce state constraints

## Testing

After each module is created:
1. Run type checking
2. Test the module in isolation if possible
3. Test integration with the CLI class
4. Verify all commands still work as expected

## Future Improvements

1. Consider adding a proper command registry
2. Add command documentation
3. Support command aliases
4. Add command validation
5. Support command composition