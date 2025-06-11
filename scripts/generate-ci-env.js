#!/usr/bin/env node

// Script to dynamically generate environment variables for GitHub Actions
// by reading the required variables from env.ts and outputting them as a JSON array.

const fs = require('fs');
const path = require('path');

function extractEnvVarsFromEnvTs() {
  const envTsPath = path.join(__dirname, '..', 'env.ts');
  const envTsContent = fs.readFileSync(envTsPath, 'utf8');

  // Extract server and client variables from the env.ts file
  const serverMatch = envTsContent.match(/server:\s*{([^}]+)}/s);
  const clientMatch = envTsContent.match(/client:\s*{([^}]+)}/s);

  const envVars = new Set();

  const extractVars = (match) => {
    if (match) {
      // Look for variable names followed by a colon
      const vars = match[1].match(/(\w+):/g);
      if (vars) {
        vars.forEach(v => {
          envVars.add(v.replace(':', ''));
        });
      }
    }
  };

  extractVars(serverMatch);
  extractVars(clientMatch);

  return Array.from(envVars).sort();
}

function generateGitHubEnv() {
  const envVars = extractEnvVarsFromEnvTs();
  console.log(JSON.stringify(envVars));
}

generateGitHubEnv();
