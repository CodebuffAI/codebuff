# Codebuff

Codebuff is an AI-powered coding assistant that helps developers build apps faster and easier. It provides an interactive command-line interface for natural language interactions with your codebase.

## Features

- AI-powered code generation and modification
- Real-time, interactive command-line interface
- Support for multiple programming languages
- File management and version control integration
- Web scraping capabilities for gathering external information
- Terminal command execution for various development tasks
- Knowledge management system for project-specific information

## How It Works

Codebuff uses advanced AI models to understand and generate code based on natural language instructions. Here's a brief overview of its operation:

1. **Project Analysis**: Codebuff analyzes your project structure and files to gain context.

2. **User Interaction**: You interact with Codebuff through a command-line interface, providing instructions or queries in natural language.

3. **AI Processing**: Codebuff processes your input, considering the project context and your instructions.

4. **Code Generation/Modification**: Based on its understanding, Codebuff generates new code or suggests modifications to existing files.

5. **Real-time Feedback**: Changes are presented to you in real-time, allowing for immediate review and further refinement.

6. **Knowledge Accumulation**: Codebuff learns from interactions and stores project-specific knowledge for future use.

## How to Use Codebuff

To get started with Codebuff, follow these steps:

1. Install Codebuff globally using npm:

   ```
   npm install -g codebuff
   ```

2. Navigate to your project directory in the terminal.

3. Run Codebuff:

   ```
   codebuff
   ```

4. Interact with Codebuff using natural language commands. For example:

   - "Add a new function to handle user authentication"
   - "Refactor the database connection code for better performance"
   - "Explain how the routing system works in this project"

5. Review the suggested changes and approve or modify them as needed.

6. Use the built-in commands for navigation and control:
   - Type "help" or "h" for a list of available commands
   - Use arrow keys to navigate through command history
   - Press Ctrl+U to undo changes and Ctrl+R to redo
   - Press Esc to toggle the menu or stop the current AI response

## Setting Up Locally

If you want to set up Codebuff for local development:

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
   cp .envrc.example .envrc
   ```
   This automatically manages your PATH and environment variables.

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

## Licensing

1. NPM Package: The npm package contained in this project is licensed under the MIT License. See the LICENSE file in the npm package directory for details.

2. Other Project Components: All other parts of this project, including but not limited to server-side code and non-public client-side code, are proprietary and confidential. No license is granted for their use, modification, or distribution without explicit permission from the project owner.
