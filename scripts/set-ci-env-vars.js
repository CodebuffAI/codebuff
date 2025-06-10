#!/usr/bin/env node

// Script to dynamically set environment variables in GitHub Actions
// by reading the required variables from env.ts and mapping them to secrets

const fs = require('fs');
const path = require('path');

function extractEnvVarsFromEnvTs() {
  const envTsPath = path.join(__dirname, '..', 'env.ts');
  const envTsContent = fs.readFileSync(envTsPath, 'utf8');
  
  // Extract server and client variables from the env.ts file
  const serverMatch = envTsContent.match(/server:\s*{([^}]+)}/s);
  const clientMatch = envTsContent.match(/client:\s*{([^}]+)}/s);
  
  const envVars = new Set();
  
  // Extract server variables
  if (serverMatch) {
    const serverVars = serverMatch[1].match(/(\w+):/g);
    if (serverVars) {
      serverVars.forEach(match => {
        envVars.add(match.replace(':', ''));
      });
    }
  }
  
  // Extract client variables
  if (clientMatch) {
    const clientVars = clientMatch[1].match(/(\w+):/g);
    if (clientVars) {
      clientVars.forEach(match => {
        envVars.add(match.replace(':', ''));
      });
    }
  }
  
  return Array.from(envVars).sort();
}

function generateGitHubEnvScript() {
  const envVars = extractEnvVarsFromEnvTs();
  
  // Check if we're in GitHub Actions
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  
  if (isGitHubActions) {
    console.log('# Pull all secrets and set as environment variables');
    envVars.forEach(varName => {
      console.log(`echo "${varName}=\${{ secrets.${varName} }}" >> $GITHUB_ENV`);
    });
  } else {
    // For local testing, just echo the variable names
    console.log('# Environment variables that would be set in GitHub Actions:');
    envVars.forEach(varName => {
      console.log(`# ${varName}`);
    });
    console.log('echo "This script is designed to run in GitHub Actions"');
  }
}

// Run the script
generateGitHubEnvScript();

```
