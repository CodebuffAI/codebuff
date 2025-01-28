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

1. Clone the repository and navigate to the project directory.

2. Create a new `.env` file in the root directory. Copy the `.env.example` file and fill in the values for your environment.

3. Install dependencies and build packages in order:
   ```bash
   # Build common package
   cd common && bun install && bun run build

   # Build code-map package
   cd ../packages/code-map && bun install && bun run build

   # Build npm-app
   cd ../npm-app && bun install && bun run build
   ```

4. Run `bun install` in the root directory to install remaining dependencies. (See [here](https://bun.sh/docs/installation) for instructions on how to install Bun.)

5. To start both the server and client, use the provided script:

   ```
   chmod +x start-dev.sh
   ./start-dev.sh
   ```

   This script will start the server first, wait for it to be ready, and then start the client. Each will run in a separate terminal window.

   Note: This script currently works on macOS. For other operating systems, you may need to start the server and client manually in separate terminal windows.

   If you prefer to use VSCode terminals, you can run:

   ```
   ./start-dev.sh --vscode
   ```

   This will open VSCode (if it's not already open), create two integrated terminals, and run the server and client commands automatically.

Alternatively, you can start the server and client manually in separate terminal windows:

- In one terminal, run `bun run dev:start-server` to start the server.

In another terminal, run `bun run dev:start-client` to start the client.

## Licensing


1. NPM Package: The npm package contained in this project is licensed under the MIT License. See the LICENSE file in the npm package directory for details.

2. Other Project Components: All other parts of this project, including but not limited to server-side code and non-public client-side code, are proprietary and confidential. No license is granted for their use, modification, or distribution without explicit permission from the project owner.