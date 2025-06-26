### 1. Create a Selective Binstub Wrapper for Bun

First, we'll create a "binstub" - a wrapper script that selectively intercepts calls to `bun` and only injects secrets when needed.

**a. Create the directory:**
```bash
mkdir -p .bin
```

**b. Create the selective wrapper script at `.bin/bun`:**
```bash
#!/bin/bash

# Find the real bun executable, avoiding recursion
REAL_BUN=$(which -a bun | grep -v "$(pwd)/.bin/bun" | head -n1)

# Commands that need secrets
case "$1" in
  "test")
    # Tests often need database/API access
    exec infisical run -- "$REAL_BUN" "$@"
    ;;
  "dev"|"start")
    # Development servers need secrets
    exec infisical run -- "$REAL_BUN" "$@"
    ;;
  "run")
    # Check if the script needs secrets
    case "$2" in
      "dev"|"start"|"start-"*|"db:"*|"typecheck")
        exec infisical run -- "$REAL_BUN" "$@"
        ;;
      *)
        # Scripts like format, build (static), etc. don't need secrets
        exec "$REAL_BUN" "$@"
        ;;
    esac
    ;;
  *)
    # For install, add, remove, format, etc. - no secrets needed
    exec "$REAL_BUN" "$@"
    ;;
esac
```

**Benefits of this selective approach:**
- **Better security**: Only injects secrets when actually needed
- **Better performance**: No Infisical overhead for simple commands like `bun install`
- **Principle of least privilege**: Commands only get access to secrets they require
- **Easier debugging**: Clear separation between secret-dependent and independent commands

**c. Make the script executable:**
```bash
chmod +x .bin/bun
```

### 2. Set up `direnv` for Automatic PATH Management

Next, we'll set up `direnv` to automatically prepend our `.bin` directory to the `PATH`.

**a. Create the `.envrc` file:**
Create a file named `.envrc` in the project root with the following content:
```
export PATH=".bin:$PATH"
```

**b. Instruct the team:**
Team members will need to:
1. Install `direnv` if they haven't already.
2. Run `direnv allow` once in the project root to approve the new configuration.

### 3. Clean Up Old Configuration

To avoid confusion, we'll remove the old `t` script.

**a. Edit `package.json`:**
Remove the `"t": "infisical run -- bun test"` line from the `codebuff.json`.

### 4. Update `.gitignore`

The `.envrc` file contains local environment configuration and shouldn't be committed.

**a. Add `.envrc` to `.gitignore`:**
Add the following line to your `.gitignore` file:
```
.envrc
```

### 5. Document the New Workflow

Finally, let's add a note to the project's main `README.md` to help new developers get set up.

**a. Update `README.md`:**
Add a new section to the `README.md`:

```markdown
## Development Environment

This project uses [direnv](https://direnv.net/) to manage environment variables and ensure consistent testing.

**b. Create a `.envrc.example` and add instructions to copy it to `.envrc`:**

Then, add the following line to the `README.md`:
```
cp .envrc.example .envrc
```

### One-Time Setup

1.  Install `direnv` for your operating system.
2.  Hook it into your shell (e.g., add `eval "$(direnv hook zsh)"` to your `.zshrc`).
3.  Run `direnv allow` in the project root to activate the environment.

After this setup:
- `bun test` will automatically run with the necessary secrets
- `bun install` will run without secrets (faster, more secure)
- `bun run dev` will run with secrets
- `bun run format` will run without secrets

We should now be able to remove our temporary `inf` script and all the scripts that connected with it.
