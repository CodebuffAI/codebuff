# Infisical Setup Guide

This guide is for **team/advanced secrets management** using [Infisical](https://infisical.com/).

> **Personal development?** Just copy `.env.example` to `.env.local` and fill in your values. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full setup guide.

## Why Infisical?

- **Team sync**: Share secrets securely across team members
- **Auto-refresh**: The `.bin/bun` wrapper automatically syncs secrets to `.env.local`
- **No manual copying**: Secrets stay up-to-date with a 15-minute cache

## Prerequisites

- **direnv**: Required for the bun wrapper to work
  - macOS: `brew install direnv`
  - Ubuntu/Debian: `sudo apt install direnv`
  - [Hook it into your shell](https://direnv.net/docs/hook.html)

## Setup Steps

### 1. Enable the bun wrapper
```bash
direnv allow
```
This adds `.bin/` to your PATH so the Infisical sync wrapper runs automatically.

### 2. Install & Login
```bash
npm install -g @infisical/cli
infisical init
infisical login
# Select "US" region when prompted
```

### 3. Browser Login
- Browser opens automatically to https://app.infisical.com
- Login with your email
- Select or create your organization and project
- Copy the token from browser and paste in terminal

### 4. Load Initial Secrets
```bash
# Load all variables from .env.example as a starting point
infisical secrets set --file .env.example

# Fix the database password to match Docker
infisical secrets set DATABASE_URL=postgresql://manicode_user_local:secretpassword_local@localhost:5432/manicode_db_local
```

### 5. Run Codebuff
```bash
bun run dev  # Secrets auto-sync to .env.local
```

## How It Works

1. The `.bin/bun` wrapper checks if `.env.local` needs refreshing
2. If stale (>15 min) or missing, it syncs from Infisical
3. Bun then loads `.env.local` automatically

## Common Issues

| Problem | Solution |
|---------|----------|
| Token won't paste | Right-click → paste |
| Session expired | Run `infisical login` again |
| Can't navigate menus | Use arrow keys ↓ ↑ |
| Infisical not working | Fall back to manual `.env.local` |

## Updating Secrets

```bash
# Set a single secret
infisical secrets set MY_API_KEY=abc123

# Delete the local cache to force refresh
rm .env.local
bun run dev  # Re-syncs from Infisical
```
