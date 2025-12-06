/**
 * Test fixtures - sample code snippets and test data for e2e tests.
 */

export const SAMPLE_CODE = {
  simpleFunction: `
function add(a: number, b: number): number {
  return a + b;
}
`.trim(),

  buggyCode: `
function divide(a, b) {
  return a / b; // Bug: no check for division by zero
}
`.trim(),

  classWithBugs: `
class Calculator {
  result = 0;
  
  add(n) {
    this.result += n;
  }
  
  divide(n) {
    this.result /= n; // Bug: division by zero not handled
  }
  
  getResult() {
    return this.result;
  }
}
`.trim(),

  complexFunction: `
async function fetchUserData(userId: string): Promise<User | null> {
  try {
    const response = await fetch(\`/api/users/\${userId}\`);
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      createdAt: new Date(data.created_at),
    };
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}
`.trim(),

  reactComponent: `
import React, { useState, useEffect } from 'react';

interface Props {
  userId: string;
}

export function UserProfile({ userId }: Props) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(\`/api/users/\${userId}\`)
      .then(res => res.json())
      .then(data => {
        setUser(data);
        setLoading(false);
      });
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}
`.trim(),
}

export const SAMPLE_DIFFS = {
  simpleChange: `
diff --git a/src/utils.ts b/src/utils.ts
index 1234567..abcdefg 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,6 @@
 export function greet(name: string): string {
-  return \`Hello, \${name}!\`;
+  const greeting = \`Hello, \${name}!\`;
+  console.log(greeting);
+  return greeting;
 }
`.trim(),

  multiFileChange: `
diff --git a/src/api.ts b/src/api.ts
index 1234567..abcdefg 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -10,6 +10,7 @@ export async function fetchData(url: string) {
   const response = await fetch(url);
+  if (!response.ok) throw new Error('Request failed');
   return response.json();
 }

diff --git a/src/types.ts b/src/types.ts
index 1234567..abcdefg 100644
--- a/src/types.ts
+++ b/src/types.ts
@@ -1,3 +1,8 @@
 export interface User {
   id: string;
   name: string;
+  email: string;
+  role: 'admin' | 'user';
 }
`.trim(),
}

export const SAMPLE_PROJECT_FILES: Record<string, string> = {
  'src/index.ts': `
import { Calculator } from './calculator';

const calc = new Calculator();
calc.add(5);
calc.multiply(3);
console.log(calc.getResult());
`.trim(),
  'src/calculator.ts': SAMPLE_CODE.classWithBugs,
  'package.json': JSON.stringify(
    {
      name: 'sample-project',
      version: '1.0.0',
      main: 'src/index.ts',
      scripts: {
        start: 'ts-node src/index.ts',
        test: 'jest',
      },
    },
    null,
    2,
  ),
  'README.md': '# Sample Project\n\nA sample project for testing.',
}

export const MOCK_WEATHER_DATA: Record<string, { temp: number; condition: string }> = {
  'New York': { temp: 72, condition: 'Sunny' },
  'London': { temp: 58, condition: 'Cloudy' },
  'Tokyo': { temp: 68, condition: 'Partly Cloudy' },
  'Sydney': { temp: 75, condition: 'Clear' },
  'Paris': { temp: 62, condition: 'Rainy' },
}

export const MOCK_DATABASE: Record<string, { id: number; name: string; email: string }[]> = {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' },
  ],
}

export const TEST_PROMPTS = {
  simple: 'Say hello',
  codeReview: 'Review this code and identify any bugs or improvements',
  generateReadme: 'Generate a README.md for this project',
  generateTests: 'Generate unit tests for the Calculator class',
  explainCode: 'Explain what this code does in simple terms',
  refactor: 'Refactor this code to be more readable and maintainable',
  commitMessage: 'Generate a commit message for these changes',
}

export const DEFAULT_AGENT = 'base'
export const DEFAULT_TIMEOUT = 120_000 // 2 minutes
