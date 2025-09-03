# Getting Started with Codebuff

## Installation

Install Codebuff globally using npm:

```
npm install -g codebuff
```

## Quick Start

1. Navigate to your project directory in the terminal.

2. Run Codebuff:

   ```
   codebuff
   ```

3. Interact with Codebuff using natural language commands. For example:

   - "Add a new function to handle user authentication"
   - "Refactor the database connection code for better performance"
   - "Explain how the routing system works in this project"

4. Review the suggested changes and approve or modify them as needed.

5. Use the built-in commands for navigation and control:
   - Type "help" or "h" for a list of available commands
   - Use arrow keys to navigate through command history
   - Press Ctrl+U to undo changes and Ctrl+R to redo
   - Press Esc to toggle the menu or stop the current AI response

## Setting Up for Local Development

If you want to contribute to Codebuff or run it locally:

### Prerequisites

1. **Install Bun**: Follow the [Bun installation guide](https://bun.sh/docs/installation)

2. **Install direnv**: This manages environment variables automatically

   - macOS: `brew install direnv`
   - Ubuntu/Debian: `sudo apt install direnv`
   - Other systems: See [direnv installation guide](https://direnv.net/docs/installation.html)

3. **Hook direnv into your shell**:
   - For zsh:
     ```bash
     echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc && source ~/.zshrc
     ```
   - For bash:
     ```bash
     echo 'eval "$(direnv hook bash)"' >> ~/.bashrc && source ~/.bashrc
     ```
   - For fish:
     ```bash
     echo 'direnv hook fish | source' >> ~/.config/fish/config.fish && source ~/.config/fish/config.fish
     ```
4. **Restart your shell**: Run `exec $SHELL` (or manually kill and re-open your terminal).

5. **Install Docker**: Required for the web server database

### Setup Steps

1. **Clone and navigate to the project**:

   ```bash
   git clone <repository-url>
   cd codebuff
   ```

2. **Set up Infisical for secrets management**:

   ```bash
   npm install -g @infisical/cli
   infisical login
   ```

   When prompted, select the "US" region, then verify setup:

   ```bash
   infisical secrets
   ```

3. **Configure direnv**:

   ```bash
   direnv allow
   ```

   This automatically manages your PATH and environment variables. The `.envrc` file is already committed to the repository and sets up the correct PATH to use the project's bundled version of Bun.

4. **Install dependencies**:

   ```bash
   bun install
   ```

5. **Start the development services**:

   **Terminal 1 - Backend server**:

   ```bash
   bun run start-server
   ```

   **Terminal 2 - Web server** (requires Docker):

   ```bash
   bun run start-web
   ```

   **Terminal 3 - Client**:

   ```bash
   bun run start-client
   ```

### Running Tests

After direnv setup, you can run tests from any directory:

```bash
bun test                    # Runs with secrets automatically
bun test --watch           # Watch mode
bun test specific.test.ts  # Run specific test file
```

## Troubleshooting

### direnv Issues

If direnv isn't working:

1. Ensure it's properly hooked into your shell (see Prerequisites step 3)
2. Run `direnv allow` in the project root
3. Check that `.envrc` exists and has the correct content
4. Restart your terminal if needed

For more troubleshooting help, see [our documentation](https://www.codebuff.com/docs) or join our [Discord community](https://codebuff.com/discord).