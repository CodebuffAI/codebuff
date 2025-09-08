# Local Development Setup

This guide helps you set up Codebuff for local development if you want to contribute to the project or run it locally.

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