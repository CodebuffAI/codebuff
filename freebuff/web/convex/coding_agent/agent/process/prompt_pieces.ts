"use node";

import { SharedContext } from "../../context/assembly";
import { generalStack } from "./knowledge_prompts";

// get the prompt pieces EXCEPT SYSTEM PROMPTS
export function getPromptPieces(
  context: SharedContext,
  _fileTokensInContext: number = 14000,
  vlyIntegrationsEnabled: boolean = false,
) {
  void _fileTokensInContext;
  void vlyIntegrationsEnabled;

  // assemble knowledge sets
  const knowledgeSets = `Here are the tech stack instructions:
<knowledge_instructions>
${generalStack}
</knowledge_instructions>
`;

  const userInformation = `
  Here is the user information of all the members in this project:
  <user_information>
  ${context.members
    .map(
      (member) => `
  <USER>
  Name: ${member.name}
  Email: ${member.email}
  </USER>
  `,
    )
    .join("\n")}
  </user_information>

  Here is the project information:
  <project_information>
  Projet name: ${context.project.name}
  Convex url: ${context.project.convex_url}
  </project_information>
  `;

  // assemble entry points. NOT USED.
  const entryPointsListed = `There are the current pages the user can view and interact with in the codebase, serving as entry points for the user:

<entry_points>
${context.entryPoints
  .map(
    (entryPoint) => `
<ENTRY_POINT page_path="${entryPoint.page?.page_file || entryPoint._id}">
PATH: ${entryPoint.page?.page_file || entryPoint._id}
TITLE: ${entryPoint.page?.page_title || "Untitled"}
DISPLAY URL ROUTE (edit if dynamic route): 
${entryPoint.page?.page_display_url || "/"}
</ENTRY_POINT>
`,
  )
  .join("\n")}
</entry_points>
`;

  // assemble asset information
  const assetsContext =
    context.assets.length > 0
      ? `
<project_assets>
Here are the assets available in the project (located in public/assets/):
${context.assets
  .map(
    (asset) => `
- ${asset.fileName} (${asset.fileType})
Path: ${asset.filePath}
Size: ${(asset.size / 1024).toFixed(1)}KB
`,
  )
  .join("\n")}

You can reference these assets in your code using their file paths. For example:
- Images: <img src="/assets/${context.assets.find((a) => a.fileType.startsWith("image/"))?.fileName || "logo.png"}" alt="description" />
- CSS: background-image: url('/assets/background.jpg')
- React: import logo from '/assets/logo.png'

When the user asks to implement or use assets like "logo", "background image", etc., check if matching assets exist above and use them.
</project_assets>
`
      : "";

  const filesInCodebase = `
Here is the codebase structure showing all files and their exports. Use this to understand WHERE code exists before reading files.

<codebase_structure>
${context.codebaseStructure}
</codebase_structure>

Use semanticFileSearchTool to find likely files when you are unsure.
Use readFilesToContextTool to read exact file paths and get the most up-to-date contents before editing or relying on details.
Prefer breaking large edits into smaller components or helpers when that keeps the code clearer.
Older thread history may be compacted into a summary, but preserved user instructions, preferences, and constraints still apply.`;

  const codebaseFilesPrompt = "";

  // Build vly-integrations section only if feature is enabled (from cached flag)
  const vlyIntegrationsSection = context.vlyIntegrationsEnabled
    ? `
**IMPORTANT: AI functionality is already available via @vly-ai/integrations (pre-installed)**
- The project comes with @vly-ai/integrations pre-configured
- You have immediate access to AI (GPT-4o, GPT-4o-mini, Claude 3, etc.), email, and payment integrations
- For AI tasks, simply use @vly-ai/integrations directly - no need to add integrations

**Alternative AI Providers:**
Some users may prefer to use OpenAI, OpenRouter, or other AI providers directly with their own API keys. However, this approach requires users to supply and manage their own API keys, making it more complex and time-consuming. @vly-ai/integrations is simpler as it works out-of-the-box without requiring API key setup or management. Before implementing a direct API integration, ask the user if they'd prefer to use @vly-ai/integrations instead, which is the recommended approach.

**Using Pre-Integrated VLY Features (SERVER-SIDE ONLY):**

⚠️ **CRITICAL: @vly-ai/integrations must ONLY be used in Convex actions (server-side)**
- NEVER import or use @vly-ai/integrations in React components or client-side code
- NEVER expose @vly-ai/integrations functionality directly to the frontend
- ALWAYS wrap @vly-ai/integrations calls in Convex actions
- Templates include a pre-configured vly instance at src/lib/vly-integrations.ts

**Correct Usage - In Convex Actions Only:**
\`\`\`typescript
// convex/ai.ts - SERVER-SIDE ONLY
"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { vly } from '../src/lib/vly-integrations'; // Use the pre-configured instance

export const generateContent = action({
  args: { prompt: v.string() },
  handler: async (ctx, args) => {
    const result = await vly.ai.completion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: args.prompt }],
      maxTokens: 500 // Use maxTokens, not max_tokens
    });

    // The response type is ApiResponse<AICompletionResponse>
    // Access the data property to get the completion response
    if (result.success && result.data) {
      return result.data.choices[0]?.message?.content || "No response";
    }
    return result.error || "Request failed";
  },
});
\`\`\`

**Type Information - @vly-ai/integrations API:**
\`\`\`typescript
// Request type for AI completions
interface AICompletionRequest {
  model?: string;  // Any model name supported by the gateway
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;  // NOT max_tokens - use camelCase
  stream?: boolean;
}

// Response wrapper - all vly methods return ApiResponse<T>
interface ApiResponse<T> {
  success: boolean;
  data?: T;  // The actual response data when successful
  error?: string;  // Error message when failed
  usage?: {
    credits: number;
    operation: string;
  };
}

// AI completion response structure
interface AICompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finishReason: string;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
\`\`\`

**Frontend Usage - Call Convex Actions:**
\`\`\`typescript
// app/components/MyComponent.tsx - CLIENT-SIDE
"use client";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

function MyComponent() {
  const generateContent = useAction(api.ai.generateContent);

  const handleGenerate = async () => {
    const result = await generateContent({ prompt: "Hello" });
    // Use result
  };
}
\`\`\`

**INTEGRATION USAGE GUIDELINES:**

**For AI/Email/Payment functionality:**
- DO NOT use addIntegrationTool for these - @vly-ai/integrations is already integrated
- ⚠️ **CRITICAL: Only use @vly-ai/integrations in Convex actions (server-side), NEVER in React components**
- Import the pre-configured vly instance from \`src/lib/vly-integrations\` in your Convex actions
- The VLY_INTEGRATION_KEY is already configured in the environment
- Create Convex actions to wrap @vly-ai/integrations calls, then call these actions from the frontend
- Refer to /packages/vly-integrations/README.md for detailed API documentation

**For other integrations (maps, analytics, databases, etc.):**
- Use the add integration tool as described below
- MAKE SURE TO CALL THIS WHEN TRYING TO ADD ANYTHING EXTERNAL TO THE PROJECT
- Simply describe the integration you want, and another agent will search online and find it for you

---
`
    : "";

  const projectIntegrationsPrompt = `
## 🔧 INTEGRATION HANDLING SYSTEM

${vlyIntegrationsSection}

**Project Integrations:**
Here are the integrations that have been added to the project already:
<project_integrations>
${context.projectIntegrations
  .map(
    (integration) => `
<ADDED_INTEGRATION>
Title: ${integration.title}
Description: ${integration.description}
Keys: ${integration.env_variables?.map((env) => `${env.id}`).join(", ") || "None"}
</ADDED_INTEGRATION>
`,
  )
  .join("\n")}
</project_integrations>

The user can set the env vars by clicking on "Integrations" in the top bar and clicking on the integration name.
Follow the setup instructions and basic usage guidelines. If the user asks, make sure to inform them that API keys can be set in the Integrations tab or in the API keys -> backend tab.
If the integration is already added, you can obtain specific information (setup, keys, usage) using the web search tool.

**To add a new external integration:**
Use the add integration tool. It will add a section in the chat where the user can add their API keys for the integration, instructions for how to obtain them, and return setup instructions.
`;

  // Determine current page abstraction and associated files (moved from assembly)
  const resolveCurrentPageAbstraction = (): {
    abstraction: string;
    filePaths: string[];
  } | null => {
    try {
      // 1) Prefer explicit currentPagePath provided via options (not available here). Fall back to latest message.pageContext URL.
      const latestWithPageCtx = (context.messages || []).find((m: any) => {
        const pc: unknown = (m as any).pageContext;
        return typeof pc === "string" && pc.length > 0;
      });
      if (latestWithPageCtx) {
        const urlPath: string = (latestWithPageCtx as any).pageContext;
        const entry = (context.entryPoints || []).find((e: any) => {
          const resolved = e.page?.resolved_display_url;
          const display = e.page?.page_display_url;
          const route = resolved && resolved !== display ? resolved : display;
          return route === urlPath;
        });
        if (entry?.abstraction) {
          // Collect all associated file paths
          const filePaths: string[] = [];

          // Add the main page file
          if (entry.page?.page_file) {
            filePaths.push(entry.page.page_file);
          }

          // Add associated files
          if (entry.associated_files && Array.isArray(entry.associated_files)) {
            filePaths.push(...entry.associated_files);
          }

          return {
            abstraction: entry.abstraction as string,
            filePaths: [...new Set(filePaths)], // Remove duplicates
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const resolvedAbstraction = resolveCurrentPageAbstraction();

  const projectSpecification = context.project.spec
    ? `Here is the overall project specification:
  <project_specification>${context.project.spec}</project_specification>`
    : "";

  const currentPageAbstraction = resolvedAbstraction
    ? `Here is the documentation abstract for the current page the user is looking at:
<current_page_abstraction>
${resolvedAbstraction.abstraction}
</current_page_abstraction>

Here are the file paths associated with the current page:
${resolvedAbstraction.filePaths.map((filePath) => `- ${filePath}`).join("\n")}

Avoid editing files outside of this page unless necessary and scoped differently, and edit the minimum amount to prevent breaking other functionality.`
    : "";

  return {
    knowledgeSets,
    entryPointsListed,
    assetsContext,
    filesInCodebase,
    codebaseFilesPrompt,
    projectIntegrationsPrompt,
    userInformation,
    projectSpecification,
    currentPageAbstraction,
  };
}
