"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUser } from "../users";
import { getVerifiedAccessProject } from "../project";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { hasEnvironmentVariables } from "../../codebase-utils/codebase/Codebase";
import { getPackageManager } from "../../codebase-utils/packageManager";

/**
 * Generate .env.local file content for frontend environment variables
 */
export const generateFrontendEnvFile = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.object({
    content: v.string(),
    fileName: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    // Get package manager from project (default to bun for new projects)
    const packageManager = project.packageManager ?? "bun";
    const pm = getPackageManager(packageManager);

    let envVars;
    try {
      if (!hasEnvironmentVariables(codebase)) {
        throw new Error("Codebase does not support environment variables");
      }
      envVars = await codebase.getEnvVars();
    } catch (error) {
      console.error("Error getting env vars from sandbox:", error);
      // Fallback: try to get at least frontend vars
      try {
        const frontendEnvResult = await codebase.runCommand(
          pm.run("@dotenvx/dotenvx get -f .env.local"),
        );
        if (frontendEnvResult.exitCode === 0) {
          const frontendEnv = Object.fromEntries(
            Object.entries(
              JSON.parse(frontendEnvResult.output) as Record<string, string>,
            ),
          );
          envVars = { frontend: frontendEnv, backend: {} };
        } else {
          // If even frontend vars fail, return empty env file with instructions
          envVars = { frontend: {}, backend: {} };
        }
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
        envVars = { frontend: {}, backend: {} };
      }
    }

    // Generate .env.local content
    let content = "# Frontend Environment Variables\n";
    content += "# Generated from Vly for Git Sync\n\n";

    if (Object.keys(envVars.frontend).length === 0) {
      content +=
        "# No environment variables found. Please set them in Vly dashboard.\n";
      content += "# Required variables:\n";
      content += "# NEXT_PUBLIC_CONVEX_URL=<your-convex-url>\n";
      content += "# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your-clerk-key>\n";
      content += "# CLERK_SECRET_KEY=<your-clerk-secret>\n";
    } else {
      for (const [key, value] of Object.entries(envVars.frontend)) {
        // Escape any quotes in the value
        const escapedValue = String(value).replace(/"/g, '\\"');
        content += `${key}="${escapedValue}"\n`;
      }
    }

    return {
      content,
      fileName: ".env.local",
    };
  },
});

/**
 * Generate a shell script for setting backend Convex environment variables
 */
export const generateBackendEnvScript = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.object({
    content: v.string(),
    fileName: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    // Get package manager from project (default to bun for new projects)
    const packageManager = project.packageManager ?? "bun";
    const pm = getPackageManager(packageManager);

    let envVars;
    try {
      if (!hasEnvironmentVariables(codebase)) {
        throw new Error("Codebase does not support environment variables");
      }
      envVars = await codebase.getEnvVars();
    } catch (error) {
      console.error("Error getting env vars from sandbox:", error);
      // Return a script with instructions if we can't get the vars
      envVars = { frontend: {}, backend: {} };
    }

    // Generate setup script content
    let content = "#!/bin/bash\n\n";
    content += "# Backend Environment Variables Setup Script\n";
    content += "# Generated from Vly for Git Sync\n";
    content +=
      "# Run this script to set up your Convex backend environment variables\n\n";

    content += "echo 'Setting up Convex backend environment variables...'\n\n";

    // Add check for convex CLI
    content += "# Check if Convex CLI is installed\n";
    content += "if ! command -v npx &> /dev/null; then\n";
    content +=
      "    echo 'Error: npx is not installed. Please install Node.js and npm first.'\n";
    content += "    exit 1\n";
    content += "fi\n\n";

    if (Object.keys(envVars.backend).length === 0) {
      content += "echo '⚠️  No backend environment variables found.'\n";
      content +=
        "echo 'Please set them in the Vly dashboard first, then re-download this script.'\n";
      content += "echo ''\n";
      content += "echo 'Alternatively, you can set them manually:'\n";
      content += `echo '  ${pm.run('convex env set KEY_NAME -- "value"')}'\\n`;
    } else {
      // Add commands to set each environment variable
      for (const [key, value] of Object.entries(envVars.backend)) {
        // Properly escape the value for shell
        const escapedValue = value
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/`/g, "\\`")
          .replace(/\$/g, "\\$");

        content += `echo "Setting ${key}..."\n`;
        content += `${pm.run(`convex env set "${key}" -- "${escapedValue}"`)}\n\n`;
      }

      content += 'echo "✅ All backend environment variables have been set!"\n';
      content += 'echo "You can now run: pnpm dev:backend"\n';
    }

    return {
      content,
      fileName: "setup-backend-env.sh",
    };
  },
});

/**
 * Generate a complete setup script for initial project setup
 */
export const generateSetupScript = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.object({
    content: v.string(),
    fileName: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found");
    }

    // Get package manager from project (default to bun for new projects)
    const packageManager = project.packageManager ?? "bun";
    const pm = getPackageManager(packageManager);
    const pmInstallCmd = pm.install();

    // Generate comprehensive setup script
    let content = "#!/bin/bash\n\n";
    content += "# Vly Git Sync Project Setup Script\n";
    content += `# Project: ${project.name}\n`;
    content +=
      "# This script will set up your local development environment\n\n";

    content += "set -e  # Exit on error\n\n";

    content += "echo '🚀 Starting Vly project setup...'\n\n";

    // Check for Node.js
    content += "# Check Node.js installation\n";
    content += "if ! command -v node &> /dev/null; then\n";
    content += "    echo '❌ Error: Node.js is not installed.'\n";
    content += "    echo 'Please install Node.js from https://nodejs.org/'\n";
    content += "    exit 1\n";
    content += "fi\n";
    content += "echo '✅ Node.js is installed'\n\n";

    // Package manager setup
    if (pm.name === "pnpm") {
      content += "# Enable pnpm via corepack\n";
      content += "echo 'Enabling pnpm...'\n";
      content += "corepack enable\n";
      content += "corepack prepare pnpm@latest --activate\n";
      content += "echo '✅ pnpm is enabled'\n\n";
    } else {
      content += "# Check for bun installation\n";
      content += "if ! command -v bun &> /dev/null; then\n";
      content += "    echo '❌ Error: Bun is not installed.'\n";
      content += "    echo 'Please install Bun from https://bun.sh/'\n";
      content += "    exit 1\n";
      content += "fi\n";
      content += "echo '✅ Bun is installed'\n\n";
    }

    // Install dependencies
    content += "# Install dependencies\n";
    content += "echo 'Installing dependencies...'\n";
    content += `${pmInstallCmd}\n`;
    content += "echo '✅ Dependencies installed'\n\n";

    // Setup Convex
    content += "# Setup Convex\n";
    content += "echo 'Setting up Convex...'\n";
    content += "if [ ! -f .env.local ]; then\n";
    content += "    echo '⚠️  Warning: .env.local file not found.'\n";
    content +=
      "    echo 'Please download it from the Vly dashboard and place it in the project root.'\n";
    content += "fi\n\n";

    content += "# Initialize Convex (if not already initialized)\n";
    content += "if [ ! -d 'convex/_generated' ]; then\n";
    content += "    echo 'Initializing Convex...'\n";
    content += `    ${pm.run("convex dev --once")}\n`;
    content += "fi\n";
    content += "echo '✅ Convex is set up'\n\n";

    // Run backend env setup if script exists
    content += "# Set up backend environment variables\n";
    content += "if [ -f setup-backend-env.sh ]; then\n";
    content += "    echo 'Setting up backend environment variables...'\n";
    content += "    chmod +x setup-backend-env.sh\n";
    content += "    ./setup-backend-env.sh\n";
    content += "else\n";
    content += "    echo '⚠️  Warning: setup-backend-env.sh not found.'\n";
    content +=
      "    echo 'Please download it from the Vly dashboard to set up backend environment variables.'\n";
    content += "fi\n\n";

    content += "echo ''\n";
    content += "echo '🎉 Setup complete!'\n";
    content += "echo ''\n";
    content += "echo 'To start the development server, run:'\n";
    content += "echo '  pnpm dev'\n";
    content += "echo ''\n";
    content += "echo 'Or run frontend and backend separately:'\n";
    content += "echo '  pnpm dev:frontend  # In one terminal'\n";
    content += "echo '  pnpm dev:backend   # In another terminal'\n";

    return {
      content,
      fileName: "setup.sh",
    };
  },
});

/**
 * Generate copy-pasteable backend env commands
 */
export const generateBackendEnvCommands = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    // Get package manager from project (default to bun for new projects)
    const packageManager = project.packageManager ?? "bun";
    const pm = getPackageManager(packageManager);

    let envVars;
    try {
      if (!hasEnvironmentVariables(codebase)) {
        throw new Error("Codebase does not support environment variables");
      }
      envVars = await codebase.getEnvVars();
    } catch (error) {
      console.error("Error getting env vars from sandbox:", error);
      envVars = { frontend: {}, backend: {} };
    }

    // Always generate a valid bash script that can be executed
    let commands = "#!/bin/bash\n\n";
    commands += "# Convex Backend Environment Variables Setup\n";
    commands += "# Generated from Vly for Git Sync\n\n";

    if (Object.keys(envVars.backend).length === 0) {
      // Return a helpful script even when no vars are found
      commands +=
        "echo '⚠️  No backend environment variables found in your Vly project.'\n";
      commands += "echo ''\n";
      commands += "echo 'To set environment variables:'\n";
      commands += "echo '1. Go to your Vly dashboard'\n";
      commands += "echo '2. Navigate to the API Keys section'\n";
      commands += "echo '3. Add your environment variables'\n";
      commands += "echo '4. Re-download this script'\n";
      commands += "echo ''\n";
      commands += "echo 'Or set them manually using:'\n";
      commands += `echo '  ${pm.run('convex env set KEY_NAME -- "value"')}'\\n`;
      commands += "echo ''\n";
      commands += "echo 'Example:'\n";
      commands += `echo '  ${pm.run('convex env set OPENAI_API_KEY -- "sk-..."')}'\\n`;
    } else {
      commands += "echo 'Setting up Convex backend environment variables...'\n";
      commands += "echo ''\n\n";

      for (const [key, value] of Object.entries(envVars.backend)) {
        // Properly escape the value for shell
        const escapedValue = value
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/`/g, "\\`")
          .replace(/\$/g, "\\$");

        commands += `echo "Setting ${key}..."\n`;
        commands += `${pm.run(`convex env set "${key}" -- "${escapedValue}"`)}\n`;
      }

      commands += "\necho ''\n";
      commands +=
        "echo '✅ All backend environment variables have been set!'\n";
      commands += "echo 'You can now run: pnpm dev:backend'\n";
    }

    return commands;
  },
});

/**
 * Generate an enhanced one-click setup script for non-technical users
 */
export const generateOneclickSetupScript = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.object({
    content: v.string(),
    fileName: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found");
    }

    // Get package manager from project (default to bun for new projects)
    const packageManager = project.packageManager ?? "bun";
    const pm = getPackageManager(packageManager);
    const pmName = pm.name === "bun" ? "Bun" : "pnpm";
    const pmInstallCmd = pm.install();

    // Generate a super user-friendly setup script
    let content = "#!/bin/bash\n\n";
    content += "# 🚀 Vly Project One-Click Setup\n";
    content += `# Project: ${project.name}\n`;
    content +=
      "# This script will automatically set up everything you need!\n\n";

    content += "set -e  # Stop on any error\n\n";

    // Add colors for better UX
    content += "# Colors for pretty output\n";
    content += "GREEN='\\033[0;32m'\n";
    content += "YELLOW='\\033[1;33m'\n";
    content += "RED='\\033[0;31m'\n";
    content += "NC='\\033[0m' # No Color\n\n";

    content +=
      'echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"\n';
    content +=
      'echo -e "${GREEN}║   Welcome to Vly Project Setup! 🎉    ║${NC}"\n';
    content +=
      'echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"\n';
    content += 'echo ""\n\n';

    // Step 1: Check and install Node.js if needed
    content += 'echo -e "${YELLOW}Step 1: Checking Node.js...${NC}"\n';
    content += "if ! command -v node &> /dev/null; then\n";
    content += '    echo -e "${RED}Node.js not found. Installing...${NC}"\n';
    content += "    # Detect OS and install Node.js\n";
    content += '    if [[ "$OSTYPE" == "darwin"* ]]; then\n';
    content += "        # macOS\n";
    content += "        if command -v brew &> /dev/null; then\n";
    content += "            brew install node\n";
    content += "        else\n";
    content +=
      '            echo "Please install Homebrew first: https://brew.sh"\n';
    content += "            echo 'Then run: brew install node'\n";
    content += "            exit 1\n";
    content += "        fi\n";
    content += '    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then\n';
    content += "        # Linux\n";
    content +=
      "        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -\n";
    content += "        sudo apt-get install -y nodejs\n";
    content += "    else\n";
    content +=
      '        echo "Please install Node.js manually from: https://nodejs.org"\n';
    content += "        exit 1\n";
    content += "    fi\n";
    content += "else\n";
    content += '    echo -e "${GREEN}✓ Node.js is installed${NC}"\n';
    content += "fi\n\n";

    // Step 2: Package manager setup
    content += `echo -e "\${YELLOW}Step 2: Setting up ${pmName}...\${NC}"\n`;
    if (pm.name === "pnpm") {
      content += "if ! command -v pnpm &> /dev/null; then\n";
      content += "    corepack enable\n";
      content += "    corepack prepare pnpm@latest --activate\n";
      content += "fi\n";
    } else {
      content += "if ! command -v bun &> /dev/null; then\n";
      content += '    echo -e "${RED}Bun not found. Installing...${NC}"\n';
      content += "    curl -fsSL https://bun.sh/install | bash\n";
      content += '    export PATH="$HOME/.bun/bin:$PATH"\n';
      content += "fi\n";
    }
    content += `echo -e "\${GREEN}✓ ${pmName} is ready\${NC}"\n\n`;

    // Step 3: Install dependencies
    content +=
      'echo -e "${YELLOW}Step 3: Installing project dependencies...${NC}"\n';
    content += `${pmInstallCmd}\n`;
    content += 'echo -e "${GREEN}✓ Dependencies installed${NC}"\n\n';

    // Step 4: Set up environment files
    content +=
      'echo -e "${YELLOW}Step 4: Setting up environment variables...${NC}"\n';
    content += "if [ ! -f .env.local ]; then\n";
    content += '    echo -e "${RED}⚠️  .env.local file not found!${NC}"\n';
    content += '    echo "Please download it from Vly dashboard:"\n';
    content += '    echo "1. Go to your project on Vly"\n';
    content += '    echo "2. Click on Git Sync → Developer Setup"\n';
    content += '    echo "3. Download .env.local"\n';
    content +=
      '    echo "4. Place it in this folder and run this script again"\n';
    content += "    exit 1\n";
    content += "else\n";
    content +=
      '    echo -e "${GREEN}✓ Frontend environment variables found${NC}"\n';
    content += "fi\n\n";

    // Step 5: Initialize Convex
    content += 'echo -e "${YELLOW}Step 5: Setting up Convex backend...${NC}"\n';
    content += `${pm.run("convex dev --once --skip-cli-update")}\n`;
    content += 'echo -e "${GREEN}✓ Convex is initialized${NC}"\n\n';

    // Step 6: Set backend environment variables
    content +=
      'echo -e "${YELLOW}Step 6: Setting backend environment variables...${NC}"\n';
    content += "if [ -f setup-backend-env.sh ]; then\n";
    content += "    chmod +x setup-backend-env.sh\n";
    content += "    ./setup-backend-env.sh\n";
    content += "else\n";
    content +=
      '    echo -e "${YELLOW}Backend env script not found. You may need to set them manually.${NC}"\n';
    content += "fi\n\n";

    // Success message with next steps
    content += 'echo ""\n';
    content +=
      'echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"\n';
    content +=
      'echo -e "${GREEN}║     Setup Complete! 🎉🎉🎉          ║${NC}"\n';
    content +=
      'echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"\n';
    content += 'echo ""\n';
    content += 'echo "Your project is ready to run!"\n';
    content += 'echo ""\n';
    content += 'echo "Start the development server with:"\n';
    content += 'echo -e "  ${GREEN}pnpm dev${NC}"\n';
    content += 'echo ""\n';
    content += 'echo "This will start both:"\n';
    content += 'echo "  • Frontend at http://localhost:3000"\n';
    content += 'echo "  • Backend (Convex) in watch mode"\n';
    content += 'echo ""\n';
    content += 'echo "Happy coding! 🚀"\n';

    return {
      content,
      fileName: "oneclick-setup.sh",
    };
  },
});

/**
 * Generate README instructions for Git Sync setup
 */
export const generateReadmeInstructions = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found");
    }

    // Get package manager from project (default to bun for new projects)
    const packageManager = project.packageManager ?? "bun";
    const pm = getPackageManager(packageManager);
    const _pmName = pm.name;
    const pmInstallCmd = pm.install();
    const pmDevCmd = pm.dev();

    let readme = "# Git Sync Setup Instructions\n\n";
    readme += "## Quick Start\n\n";
    readme += "1. **Clone the repository:**\n";
    readme += "   ```bash\n";
    readme += "   git clone <your-repo-url>\n";
    readme += "   cd <your-repo-name>\n";
    readme += "   ```\n\n";

    readme += "2. **Download environment files from Vly:**\n";
    readme += "   - Go to your project on Vly\n";
    readme += "   - Navigate to the Git Sync settings\n";
    readme += "   - Download the following files:\n";
    readme += "     - `.env.local` (Frontend environment variables)\n";
    readme +=
      "     - `setup-backend-env.sh` (Backend environment setup script)\n";
    readme += "     - `setup.sh` (Complete setup script)\n";
    readme += "   - Place these files in your project root\n\n";

    readme += "3. **Run the setup script:**\n";
    readme += "   ```bash\n";
    readme += "   chmod +x setup.sh\n";
    readme += "   ./setup.sh\n";
    readme += "   ```\n\n";

    readme += "4. **Start developing:**\n";
    readme += "   ```bash\n";
    readme += `   ${pmDevCmd}\n`;
    readme += "   ```\n\n";

    readme += "## Manual Setup (Alternative)\n\n";
    readme += "If you prefer to set up manually:\n\n";

    readme += "### 1. Install dependencies\n";
    readme += "```bash\n";
    if (pm.name === "pnpm") {
      readme += "# Enable pnpm\n";
      readme += "corepack enable\n";
      readme += "corepack prepare pnpm@latest --activate\n\n";
    } else {
      readme += "# Install bun (if not already installed)\n";
      readme += "curl -fsSL https://bun.sh/install | bash\n\n";
    }
    readme += "# Install packages\n";
    readme += `${pmInstallCmd}\n`;
    readme += "```\n\n";

    readme += "### 2. Set up environment variables\n\n";
    readme += "#### Frontend (.env.local)\n";
    readme +=
      "Place the downloaded `.env.local` file in your project root.\n\n";

    readme += "#### Backend (Convex)\n";
    readme += "Run the backend environment setup script:\n";
    readme += "```bash\n";
    readme += "chmod +x setup-backend-env.sh\n";
    readme += "./setup-backend-env.sh\n";
    readme += "```\n\n";

    readme += "Or set variables manually one by one:\n";
    readme += "```bash\n";
    readme += `${pm.run('convex env set KEY_NAME -- "value"')}\n`;
    readme += "```\n\n";

    readme += "### 3. Initialize Convex\n";
    readme += "```bash\n";
    readme += `${pm.run("convex dev --once")}\n`;
    readme += "```\n\n";

    readme += "### 4. Start the development server\n";
    readme += "```bash\n";
    readme += "pnpm dev\n";
    readme += "```\n\n";

    readme += "## Troubleshooting\n\n";
    readme +=
      "- **pnpm not found:** Make sure you have Node.js 16+ installed and run `corepack enable`\n";
    readme +=
      "- **Convex errors:** Ensure all backend environment variables are set correctly\n";
    readme += "- **Missing .env.local:** Download it from the Vly dashboard\n";
    readme +=
      "- **Permission denied:** Make scripts executable with `chmod +x <script-name>.sh`\n\n";

    readme += "## Syncing Changes\n\n";
    readme += "Your changes will automatically sync with Vly when you:\n";
    readme += "- Push to the connected GitHub repository\n";
    readme +=
      "- The sync happens automatically on every push to the main branch\n\n";

    readme += "## Need Help?\n\n";
    readme += "- Check the project dashboard on Vly for sync status\n";
    readme += "- View detailed logs in the Git Sync section\n";
    readme += "- Contact support if you encounter any issues\n";

    return readme;
  },
});
