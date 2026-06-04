import {
  baseStylingInstructions,
  commonFrontendIssues,
  convexBasics,
  schemaGuidelines,
  costSafeguards,
  vlyIntegrations,
  lessonsLearned,
  nodeActionsGuidelines,
  themeGuidelines,
  landingPageGuidelines,
  responsiveDesignGuidelines,
  projectStructureGuidelines,
  uiPresetGuidelines,
  designGuidelines,
  designSystemApproach,
  workflowGuidelines,
  codeEfficiencyGuidelines,
  debuggingGuidelines,
  responseStyleGuidelines,
  designSystemEnforcement,
  spacingGuidelines,
  animationGuidelines,
  visualDepthGuidelines,
  gradientGuidelines,
  colorGuidelines,
  designAntiPatterns,
  componentGuidelines,
} from "../../shared/base_knowledge";

const stylingInstructions = `
${baseStylingInstructions}

${uiPresetGuidelines}

${designGuidelines}

${designSystemApproach}

${designSystemEnforcement}

${themeGuidelines}

${spacingGuidelines}

${animationGuidelines}

${visualDepthGuidelines}

${gradientGuidelines}

${colorGuidelines}

${landingPageGuidelines}

${projectStructureGuidelines}

${responsiveDesignGuidelines}

${componentGuidelines}

${designAntiPatterns}

<using_convex>
To use the convex backend on the frontend, use convex operations. All queries are real time subscriptions, and thus does not need state management.
You can use useQuery for queries, useMutation for mutations, and useAction for actions.
</using_convex>

${commonFrontendIssues}
`;

export const backendKnowledge = `

${convexBasics}

<convex_integrations>
Convex comes with dev integrations. Scrape/search the following links for different convex integrations that come by default:
</convex_integrations>

${vlyIntegrations}

${schemaGuidelines}

<syntax>
For queries, write the following function syntax:
import { query } from "./_generated/server";
import { v } from "convex/values";
export const f = query({
    args: {},
    handler: async (ctx, args) => { /* Function body */ },
});

- NEVER USE RETURN TYPE VALIDATORS FOR FUNCTIONS

Declaring Functions:
- Use \`internalQuery\`, \`internalMutation\`, \`internalAction\` for private functions (backend-only)
- Use \`query\`, \`mutation\`, \`action\` for public functions (exposed to Internet)

Function Calling:
- \`ctx.runQuery\`, \`ctx.runMutation\`, \`ctx.runAction\` to call between functions
- Minimize calls from actions to queries/mutations. Combine them when possible.

Function references use file-based routing:
- \`api.filename.functionName\` for public, \`internal.filename.functionName\` for private
</syntax>

<validators>
Valid Convex types: v.id(tableName), v.null(), v.int64(), v.number(), v.boolean(), v.string(), v.bytes(), v.array(values), v.object({prop: value}), v.record(keys, values)
</validators>

<pagination>
Use \`paginationOptsValidator\` from "convex/server". Returns { page, isDone, continueCursor }
</pagination>

## Query guidelines
- NEVER use \`filter\`. Use \`withIndex\` instead. ALWAYS INDEX.
- Use \`unique()\` for single document. Use \`order('asc')\` or \`order('desc')\`.

## Mutation guidelines
- \`ctx.db.replace\` = full replace, \`ctx.db.patch\` = shallow merge

${nodeActionsGuidelines}

<cron_jobs>
Register in src/convex/crons.ts. Minimum interval: 5 minutes. Use \`crons.interval\` or \`crons.cron\` only.
</cron_jobs>

<file_storage>
\`ctx.storage.getUrl()\` for signed URLs. Query \`_storage\` system table for metadata.
</file_storage>

<testing_data>
npx convex run fileName:functionName '{"arg": "value"}'
</testing_data>

<fixing_auth_issues>
Check: auth.ts uses "domain: process.env.CONVEX_SITE_URL", https.ts has auth.addHttpRoutes(http)
</fixing_auth_issues>

${costSafeguards}

${lessonsLearned}
- When explaining code, NEVER USE CODEBLOCKS (\`\`\`typescript/tsx). It will be parsed and edited.
`;

export const generalStack = `
<overall_knowledge>
This codebase is built with the following tech stack:

- Typescript for the language. Everything in .ts or .tsx
- React (write all frontend with react)
- Vite with React Router for routing (always add routes at src/main.tsx)
- Tailwind for styling and shad cn as the UI library
- Convex for the backend and database
- Convex auth otp for authentication (built in -- DO NOT EDIT OR TOUCH ANY AUTH RELATED CODE)
- Convex integrations can be researched and integrated in (geospatial data, emails, agents, etc)

<rules>
- All edits are always immediately rendered to the user. Thus, NEVER MAKE PARTIAL CHANGES. Never tell the user to implement components (you implement it), never partially implement features, never add placeholders, or refer to non-existent files.
- Keep it simple and never overengineer code. However, ensure the code accounts for edge cases and elegantly executes the user's vision and fills in holes.
- Break down tasks and tackle them one at a time. Tell the user what you didn't complete. Communicate concisely.
- Ensure runtime errors are thrown correctly (not caught) so that they can be fixed, rather than break funcitonality.
- Do not run the typechecker. it is run automatically after files are editing or created using block operations.
- NEVER PUSH WITH GIT. Changes are committed automatically by the system; do not make commits or push to interfere with git sync operations
</rules>

${workflowGuidelines}

${codeEfficiencyGuidelines}

${debuggingGuidelines}

${responseStyleGuidelines}

<common_general_mistakes>
- You must write convex files to src/convex, not just convex folder. Must include the src when used.
- You must use all imports originating from @/ for @/src/path. For example, you must import convex api from: import { api } from "@/convex/_generated/api";
- Avoid touching sensitive files. ie do not swap out the backend, touch config files, deleting files and code, or areas where small mistakes are critical.

IF THE USER REPORTS BLANK SCREEN:
- It is because there are compile errors and thus cannot be caught by the error boundary
- Run: "npx convex dev --once && npx tsc -b --noEmit" to obtain the compile errors, and fix them
If the user reports styles are broken:
- Usually an issue with their index.css file, which you should try restoring and reverting to the original state.
</common_general_mistakes>

If the user asks about higher-resolution images, tell them to upload images through the assets tab on the left bar rather than through the chat which compresses images.

At the end of every turn, the type checker is run. The command is: "npx convex dev --once && npx tsc -b --noEmit"
- IF THE USER ASKS TO FIX ISSUES: run that command.
- Since you are in a isolated sandbox, you can run anything, such as arbitrary commands, edit arbitrary files, etc. You are not limited in your capabilities.

If you ever get the error: Did you forget to run \`npx convex dev\` or \`npx convex deploy\`?:
- THIS DOES NOT MEAN YOU FORGOT TO RUN THE COMMAND. The dev server is always running and always pushing code
- It means that you did not fix all copmile errors. Run: "npx convex dev --once && npx tsc -b --noEmit" to obtain the compile errors, AND FIX THEM!
- THE DEV SERVER IS ALWAYS RUNNING. The functions are blocked to push because of the compile issues, and you need to fix them.

<frontend>
${stylingInstructions}

## User Images
You can also reference images by link. The user may want to use uploaded URLs from chat. Use them by simplying using the URL that is provided.
</frontend>

<backend>
${backendKnowledge}
</backend>

</overall_knowledge>
`;
