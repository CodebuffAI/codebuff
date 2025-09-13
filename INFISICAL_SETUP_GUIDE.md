# Simple Infisical Setup for Codebuff

Quick 5-step setup to get Codebuff running with Infisical secrets.

## Setup Steps

### 1. Install & Setup
```bash
npm install -g @infisical/cli
infisical init
infisical login
# Select "US" region when prompted
infisical secrets  # Verify setup works
```

### 2. Browser Login
- Browser opens automatically to https://app.infisical.com
- Login with **any email** (Gmail, etc.)
- Fill in any **name** and **organization name** when asked
- Copy the token from browser and paste in terminal

### 3. Select Project  
- Use arrow keys to choose your organization
- Select or create a Codebuff project

### 4. Load Environment Variables
```bash
# Load all variables at once
infisical secrets set --file .env.example

# IMPORTANT: Fix the database password separately
infisical secrets set DATABASE_URL=postgresql://postgres:secretpassword_local@localhost:5432/codebuff
```

### 5. Done! Run Codebuff
```bash
bun run start-server  # Backend (port 4242)
bun run start-web     # Web (port 3000)  
bun run start-bin     # CLI
```

## Common Issues & Quick Fixes

**Token won't paste?** → Right-click → paste  
**Database error?** → Run the DATABASE_URL command above  
**Can't navigate menus?** → Use arrow keys ↓ ↑  

## That's It!

The `.env.example` file contains all the dummy values needed for development. Only the database password needs to be fixed to match Docker's password.

You will need to populate all the secrets in the Infisical UI at https://app.infisical.com. You can provide dummy values for the secrets if you get an error about missing secrets, but you will need to update them with real values in order to use the associated feature.

