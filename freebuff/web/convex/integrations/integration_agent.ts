// /**
//  * DEPRECATED: Use addIntegration instead
//  */

// "use node";

// import { action, ActionCtx } from "../_generated/server";
// import { v } from "convex/values";
// import { getAuthUser } from "../users";
// import { getVerifiedAccessProject } from "../project";
// import { z } from "zod";
// import { generateObject, stepCountIs, tool } from "ai";
// import { MODELS } from "!/utils/registry";
// import { Id } from "!/_generated/dataModel";

// import { generateText } from "ai";
// import { google } from "@ai-sdk/google";
// import { internal } from "!/_generated/api";

// async function resolveRedirectUrl(url: string): Promise<string> {
//   try {
//     const response = await fetch(url, { method: "HEAD" });
//     return response.url;
//   } catch (error) {
//     console.warn(`URL redirect resolution failed for ${url}:`, error);
//     return url;
//   }
// }

// async function isValidUrl(url: string): Promise<boolean> {
//   try {
//     new URL(url);
//     return true;
//   } catch {
//     return false;
//   }
// }

// // Context7 API functions
// async function searchContext7Libraries(query: string) {
//   try {
//     const url = new URL("https://context7.com/api/v1/search");
//     url.searchParams.set("query", query);

//     const response = await fetch(url);
//     if (!response.ok) {
//       const errorCode = response.status;
//       if (errorCode === 429) {
//         console.error(`Context7 rate limited. Please try again later.`);
//         return {
//           results: [],
//           error: `Context7 rate limited. Please try again later.`,
//         };
//       }
//       console.error(
//         `Failed to search Context7 libraries. Error code: ${errorCode}`,
//       );
//       return {
//         results: [],
//         error: `Failed to search Context7 libraries. Error code: ${errorCode}`,
//       };
//     }

//     return await response.json();
//   } catch (error) {
//     console.error("Error searching Context7 libraries:", error);
//     return {
//       results: [],
//       error: `Error searching Context7 libraries: ${error}`,
//     };
//   }
// }

// async function fetchContext7Documentation(
//   libraryId: string,
//   options: {
//     tokens?: number;
//     topic?: string;
//   } = {},
// ) {
//   try {
//     if (libraryId.startsWith("/")) {
//       libraryId = libraryId.slice(1);
//     }

//     const url = new URL(`https://context7.com/api/v1/${libraryId}`);
//     if (options.tokens)
//       url.searchParams.set("tokens", options.tokens.toString());
//     if (options.topic) url.searchParams.set("topic", options.topic);
//     url.searchParams.set("type", "txt");

//     const response = await fetch(url, {
//       headers: {
//         "X-Context7-Source": "mcp-server",
//       },
//     });

//     if (!response.ok) {
//       const errorCode = response.status;
//       if (errorCode === 429) {
//         const errorMessage = `Context7 rate limited. Please try again later.`;
//         console.error(errorMessage);
//         return errorMessage;
//       }
//       const errorMessage = `Failed to fetch Context7 documentation. Error code: ${errorCode}`;
//       console.error(errorMessage);
//       return errorMessage;
//     }

//     const text = await response.text();
//     if (
//       !text ||
//       text === "No content available" ||
//       text === "No context data available"
//     ) {
//       return null;
//     }

//     return text;
//   } catch (error) {
//     const errorMessage = `Error fetching Context7 documentation: ${error}`;
//     console.error(errorMessage);
//     return errorMessage;
//   }
// }

// const envVariable = z.object({
//   id: z.string(),
//   description: z.string(),
// });

// const generatedIntegration = z.object({
//   title: z.string().describe("The name of the integration"),
//   description: z
//     .string()
//     .describe("A brief description of what the integration does"),
//   tags: z.array(z.string()).describe("Relevant tags for categorization"),
//   env_variables: z
//     .array(
//       z.object({
//         id: z.string().describe("Environment variable name"),
//         description: z
//           .string()
//           .describe("Description of what this env var is for"),
//       }),
//     )
//     .describe("Required environment variables"),
//   user_instructions: z
//     .string()
//     .describe("Step-by-step instructions for user setup"),
//   llm_instructions: z
//     .string()
//     .describe("Technical implementation instructions for the LLM"),
//   documentation_urls: z
//     .array(z.string())
//     .describe("Official documentation URLs"),
//   main_domain: z
//     .string()
//     .optional()
//     .describe(
//       "The main domain URL (e.g., 'twilio.com', 'stripe.com') for favicon generation - NOT GitHub or docs subdomains",
//     ),
// });
// type GeneratedIntegration = z.infer<typeof generatedIntegration>;

// /**
//  * DEPRECATED: Use addIntegration instead
//  */
// export const generateIntegration = action({
//   args: {
//     userInput: v.string(),
//     semanticIdentifier: v.string(),
//   },
//   handler: async (ctx, args) => {
//     console.log(
//       "[Integration Agent] Starting integration generation for:",
//       args.userInput,
//     );

//     const user = await getAuthUser(ctx);
//     if (!user) throw new Error("Not authenticated");
//     console.log("[Integration Agent] User authenticated:", user._id);

//     // Verify project access and get project
//     const project = await getVerifiedAccessProject(
//       ctx,
//       user._id,
//       args.semanticIdentifier,
//     );
//     if (!project) throw new Error("Project not found");
//     console.log("[Integration Agent] Project verified:", project._id);
//     return await generateAndStructure(ctx, args.userInput, project._id);
//   },
// });

// // Function to extract main domain from URLs and generate favicon
// function extractMainDomainAndFavicon(urls: string[]): string {
//   if (!urls || urls.length === 0) return "";

//   // Use the first URL as the main URL
//   const mainUrl = urls[0];

//   if (!mainUrl) {
//     // Fallback to first non-GitHub URL
//     const fallbackUrl = urls.find(
//       (url) => !url.toLowerCase().includes("github.com"),
//     );
//     if (fallbackUrl) {
//       const urlObj = new URL(fallbackUrl);
//       return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
//     }
//     return "";
//   }

//   const urlObj = new URL(mainUrl);
//   return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
// }

// export async function generateAndStructure(
//   ctx: ActionCtx,
//   prompt: string,
//   projectId: Id<"project">,
// ) {
//   console.log(
//     `[Integration Agent] generateAndStructure called with prompt: "${prompt}"`,
//   );

//   // Initialize per-request web search counter
//   let webSearchCount = 0;

//   const systemPrompt = `You are a deep research agent specialized in finding and extracting developer documentation for integrations. You have access to the Context7 API which provides comprehensive documentation for popular libraries and services, plus web search capabilities for supplemental research.

//   YOU MUST USE THE PROVIDED TOOLS TO RESEARCH. Do not skip research or provide generic answers.

//   Your job is to:
//   1. Use searchContext7Libraries to find relevant libraries
//   2. Use fetchContext7Documentation to get detailed documentation
//   3. Use webSearchGrounding as needed to supplement information
//   4. You can make multiple web searches if needed for comprehensive coverage - there are no artificial limits

//   SEARCH STRATEGY:
//   1. **Context7 First Approach:**
//      - When user requests a specific provider, search Context7 directly for that provider name
//      - When user requests generic functionality, think of the most popular providers for that functionality:
//        * SMS/Text messaging → Try searching for: twilio, vonage, messagebird
//        * Payments → Try searching for: stripe, square, paypal
//        * Email → Try searching for: sendgrid, mailgun, postmark
//        * Authentication → Try searching for: auth0, clerk, supabase
//        * Database → Try searching for: mongodb, postgresql, mysql
//        * Search → Try searching for: algolia, elasticsearch, typesense
//      - Search Context7 using these specific provider names for better results
//      - Select libraries with high trust scores and good documentation coverage

//   2. **Context7 Sufficiency Check (MUST evaluate before using web search):**
//      Context7 documentation is SUFFICIENT if it includes ALL of:
//      - ✓ Installation command (npm install package-name (or pnpm, etc))
//      - ✓ Basic setup/initialization code
//      - ✓ At least one working code example
//      - ✓ API key/authentication setup instructions
//      - ✓ Basic usage documentation

//      If Context7 has ALL 5 items → DO NOT use web search
//      If Context7 missing ANY items → Make ONE comprehensive web search for ALL missing information

//   3. **Web Search Strategy:**
//      - Use web search to fill in gaps from Context7 documentation
//      - Make focused searches for specific missing information:
//        □ npm install command and setup
//        □ TypeScript configuration
//        □ Code examples and usage
//        □ API key instructions
//        □ User account setup
//        □ Implementation guides
//      - You can make multiple targeted searches for better results
//      - Focus each search on specific aspects for comprehensive coverage

//   You will search for a relevant integration and provide comprehensive documentation including:
//   - Installation instructions (using pnpm)
//   - Setup and configuration steps
//   - Code examples and usage patterns
//   - API key requirements and setup
//   - Complete implementation guidance

//   Your documentation and instructions should be relevant to this tech stack:
//   - Language: TypeScript (ts and tsx)
//   - Frontend: React
//   - Backend: Convex (convex.dev) - Use Convex actions and mutations instead of raw HTTP calls.
//   - Package Manager: pnpm

//   CRITICAL CONVEX-SPECIFIC REQUIREMENTS:
//   - For backend operations, ALWAYS use Convex actions (not raw fetch/axios calls)
//   - Should be end to end typescript code
//   - However, NEVER WRITE NEW CONVEX CODE. only cite code specified originally in the documentation.

//   CRITICAL REQUIREMENTS:
//   - Only include accurate information from official documentation sources
//   - NEVER MAKE UP ANY NEW CODE OR EXAMPLES
//   - Include complete, working code examples directly from documentation
//   - Do not write custom code or examples not found in documentation
//   - Focus on practical implementation details
//   - Ensure all API keys and environment variables are accurately described
//   - When using Context7, prioritize libraries with trust scores >= 7 and good token coverage
//   - MOST IMPORTANT: The integration you return MUST match what the user requested
//   - ALL INSTALLATION INSTRUCTIONS YOU WRITE MUST BE USING PNPM. Do not show npm examples; when writing instructions, they must all be using pnpm
//   Be as short and concise as possible in all user instructions and descriptions.

//   The user will provide an input for the integration they want. For generic requests, research and select the best provider automatically.

//   Structure your response with these sections:
//   - Title: Clear, concise integration name
//   - Description: One sentence describing what it does
//   - Tags: Relevant categories for searchability
//   - API Keys: Exact environment variable names and obtaining instructions
//   - User Instructions: Clear, step-by-step guide for API key setup and account creation. MAKE IT SHORT AND CONCISE. AS SHORT AS POSSIBLE.
//   - LLM Instructions: Comprehensive technical implementation guide with code examples
//   - Documentation URLs: All sources referenced
//   - Main Domain: The main website domain (e.g., "twilio.com", "stripe.com") for favicon generation

//   SPECIFIC FORMATTING REQUIREMENTS FOR USER INSTRUCTIONS:
//   - Write clear, numbered steps (1. 2. 3. etc.)
//   - Include specific URLs where users need to go
//   - Be very specific about where to find API keys (exact page names, button labels, etc.)
//   - Include any verification steps required
//   - Format as clean text without escape characters
//   - Make it as short and concise as possible

//   CRITICAL IMPLEMENTATION NOTES:
//   - Use proper newlines in all documentation (not \\n)
//   - Include TypeScript types in all code examples
//   - Show complete, working implementations
//   - Include error handling examples
//   - Provide both basic and advanced usage patterns
//   - IMPORTANT: Extract the main domain from documentation URLs (e.g., from "https://docs.twilio.com" extract "twilio.com")
//   - The main_domain should be the primary website domain, NOT GitHub or documentation subdomains
// `;

//   const query = `
//   Here is the integration the user would like to add:
//   <integration>
//   ${prompt}
//   </integration>

//   RESEARCH APPROACH:
//   1. **Search Context7 First:**
//      - Search for specific provider names (e.g., "twilio" not "sms provider")
//      - Fetch documentation and analyze what's present vs missing

//   2. **Analyze Context7 Coverage:**
//      Evaluate what Context7 provides:
//      - [ ] pnpm/yarn/npm install command?
//      - [ ] Setup/initialization code?
//      - [ ] Code examples?
//      - [ ] API key instructions?
//      - [ ] User account setup?

//   3. **Supplement with Web Search (as needed):**
//      For any missing information from Context7:
//      - Make focused searches for specific gaps
//      - Example searches: "Twilio Node.js installation", "Twilio API key setup", "Twilio TypeScript examples"
//      - Use multiple searches to ensure comprehensive coverage

//   4. **Extract and Structure:**
//      - Combine information from Context7 and web search results
//      - Ensure all required fields are properly filled
//   `;

//   console.log(
//     "[Integration Agent] Starting research with Context7 and web search for:",
//     prompt,
//   );

//   const response = await generateText({
//     model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
//     system: systemPrompt,
//     prompt: query,
//     stopWhen: stepCountIs(7),
//     //maxSteps: 4, // Limited to: 1) Context7 search, 2) Context7 fetch, 3) ONE web search, 4) Final processing
//     toolChoice: "required",
//     tools: {
//       searchContext7Libraries: tool({
//         description:
//           "Search Context7 API for libraries and services. For best results, search using specific provider/library names rather than generic terms.",
//         inputSchema: z.object({
//           query: z
//             .string()
//             .describe(
//               "Search query to find relevant libraries/services. Use specific provider names when possible for better results.",
//             ),
//         }),
//         execute: async ({ query }) => {
//           console.log(
//             "[Integration Agent] Searching Context7 libraries with query:",
//             query,
//           );

//           const result = await searchContext7Libraries(query);
//           console.log(
//             "[Integration Agent] Context7 search results for",
//             query,
//             ":",
//             result.results?.length || 0,
//             "results found",
//           );

//           // Log full result structure
//           console.log(
//             "[Integration Agent] Context7 full response structure:",
//             JSON.stringify(result, null, 2).substring(0, 1000),
//           );

//           if (result.results?.length > 0) {
//             console.log(
//               "[Integration Agent] Top results:",
//               result.results.slice(0, 3).map((r: any) => ({
//                 id: r.id,
//                 title: r.title,
//                 description: r.description?.substring(0, 100),
//               })),
//             );
//           } else {
//             console.error(
//               "[Integration Agent] ERROR: No Context7 results found for query:",
//               query,
//             );
//           }

//           return JSON.stringify(result, null, 2);
//         },
//       }),
//       fetchContext7Documentation: tool({
//         description:
//           "Fetch detailed documentation for a specific library from Context7. Use the library ID from search results.",
//         inputSchema: z.object({
//           libraryId: z
//             .string()
//             .describe(
//               "Library ID from Context7 search results (e.g., '/mongodb/docs', '/vercel/next.js')",
//             ),
//           tokens: z
//             .number()
//             .optional()
//             .describe("Number of tokens to fetch (default: 15000)"),
//           topic: z
//             .string()
//             .optional()
//             .describe(
//               "Specific topic to focus on (e.g., 'installation', 'authentication')",
//             ),
//         }),
//         execute: async ({ libraryId, tokens = 15000, topic }) => {
//           console.log(
//             "[Integration Agent] Fetching Context7 documentation for:",
//             libraryId,
//           );

//           const result = await fetchContext7Documentation(libraryId, {
//             tokens,
//             topic,
//           });

//           console.log(
//             "[Integration Agent] Context7 documentation length:",
//             result?.length || 0,
//           );

//           if (result) {
//             // Analyze sufficiency of Context7 documentation
//             const hasInstallCommand =
//               /npm install|yarn add|yarn install|pnpm add|pnpm install|bun add|bun install/i.test(
//                 result,
//               );
//             const hasCodeExample = /```(?:typescript|javascript|js|ts)/i.test(
//               result,
//             );
//             const hasAPIKey = /api.?key|auth.?token|secret/i.test(result);
//             const hasSetup = /setup|initialize|config/i.test(result);
//             const hasUserInstructions =
//               /sign.?up|register|account|dashboard/i.test(result);

//             const isSufficient =
//               hasInstallCommand &&
//               hasCodeExample &&
//               hasAPIKey &&
//               hasSetup &&
//               hasUserInstructions;

//             console.log("[Integration Agent] Context7 sufficiency analysis:", {
//               hasInstallCommand,
//               hasCodeExample,
//               hasAPIKey,
//               hasSetup,
//               hasUserInstructions,
//               isSufficient,
//             });

//             // Add sufficiency info to the result
//             if (!isSufficient) {
//               const missing = [];
//               if (!hasInstallCommand) missing.push("install command");
//               if (!hasCodeExample) missing.push("code examples");
//               if (!hasAPIKey) missing.push("API key instructions");
//               if (!hasSetup) missing.push("setup/initialization");
//               if (!hasUserInstructions)
//                 missing.push("user account instructions");

//               return (
//                 result +
//                 `\n\n[CONTEXT7_ANALYSIS] Missing information: ${missing.join(", ")}`
//               );
//             }
//           }

//           return result || "No documentation available";
//         },
//       }),
//       webSearchGrounding: tool({
//         description:
//           "Search the web for comprehensive integration information using Exa semantic search. Can be called multiple times as needed for thorough research.",
//         inputSchema: z.object({
//           query: z
//             .string()
//             .describe(
//               "Specific search query for integration information. Focus on one aspect at a time for better results.",
//             ),
//           mode: z
//             .enum(["supplement", "fallback"])
//             .describe(
//               "Use 'supplement' when Context7 partially covers the integration. Use 'fallback' when Context7 has no results.",
//             ),
//           focus: z
//             .string()
//             .optional()
//             .describe(
//               "Primary focus area for the search (e.g., 'installation', 'authentication', 'examples')",
//             ),
//         }),
//         execute: async ({ query, mode, focus }) => {
//           webSearchCount++;

//           console.log(
//             `[Integration Agent] Using web search grounding (${mode} mode) for:`,
//             query,
//           );
//           console.log(
//             `[Integration Agent] Web search count: ${webSearchCount}`,
//           );

//           const systemPrompt = `You are a technical documentation researcher. ${
//             mode === "fallback"
//               ? "Context7 is unavailable, so provide complete integration information."
//               : "Context7 has partial information, so focus on the specific aspect requested."
//           } Focus on: ${focus || "integration details"}`;

//           const searchPrompt = `Search for integration information: ${query}

//             Provide specific, actionable information for:

//             ${
//               focus === "installation"
//                 ? "- Exact npm/yarn/pnpm install commands\n- Dependencies and setup requirements"
//                 : focus === "authentication"
//                   ? "- API key setup and configuration\n- Authentication patterns and examples"
//                   : focus === "examples"
//                     ? "- Working code examples with TypeScript\n- Best practices and error handling"
//                     : "- Installation instructions\n- Authentication and setup\n- Code examples and usage patterns"
//             }

//             Keep responses focused and technical. Include official documentation sources when available.`;

//           // Use Google Gemini with Google Search grounding capabilities
//           const searchResponse = await generateText({
//             model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
//             system: systemPrompt,
//             prompt: searchPrompt,
//             tools: {
//               google_search: google.tools.googleSearch({}) as any,
//             },
//           });

//           console.log(
//             `[Integration Agent] Web search response length:`,
//             searchResponse.text?.length || 0,
//           );
//           console.log(
//             `[Integration Agent] Web search preview:`,
//             searchResponse.text?.substring(0, 300) || "No content",
//           );

//           return `Web Search Results (${mode} mode) for "${query}":\n\n${searchResponse.text}`;
//         },
//       }),
//     },
//   });

//   console.log("Research completed, processing results...");

//   // Log the actual research response to debug
//   console.log(
//     "[Integration Agent] Full response object keys:",
//     Object.keys(response),
//   );
//   console.log(
//     "[Integration Agent] Response text length:",
//     response.text?.length || 0,
//   );
//   console.log(
//     "[Integration Agent] Response text preview:",
//     response.text?.substring(0, 500) || "No response text",
//   );

//   // Log tool calls if available
//   if (response.toolCalls) {
//     console.log(
//       "[Integration Agent] Tool calls made:",
//       response.toolCalls.length,
//     );
//   }
//   if (response.steps) {
//     console.log("[Integration Agent] Steps taken:", response.steps.length);
//   }

//   // Try to extract the actual research content
//   let researchContent = response.text;

//   // If response.text is empty, try to find content in other parts of the response
//   if (!researchContent || researchContent.length < 100) {
//     console.error(
//       "[Integration Agent] ERROR: response.text is empty or minimal",
//     );

//     // Try to extract from steps or tool results
//     if (response.steps && response.steps.length > 0) {
//       console.log(
//         "[Integration Agent] Attempting to extract content from steps",
//       );
//       // This might need adjustment based on actual response structure
//       researchContent = JSON.stringify(response.steps);
//     }
//   }

//   // Check if we actually got research results
//   if (!researchContent || researchContent.length < 100) {
//     console.error(
//       "[Integration Agent] ERROR: Research returned empty or minimal content",
//     );
//     throw new Error("Integration research failed - no documentation found");
//   }

//   const model = "gemini-2.0-flash";
//   const initialCitations: string[] = [];

//   const resolvedCitations = await Promise.all(
//     initialCitations.map(resolveRedirectUrl),
//   );
//   console.log("Resolved citations:", resolvedCitations);

//   const citationValidationResults = await Promise.all(
//     resolvedCitations.map(isValidUrl),
//   );
//   const citations = resolvedCitations.filter(
//     (_, index) => citationValidationResults[index],
//   );

//   console.log("Citations:", citations);

//   const user = await getAuthUser(ctx);

//   if (user?._id) {
//     const searchLog =
//       (await ctx.runMutation(internal.search.insertSearchLog, {
//         projectId: projectId,
//         userId: user?._id,
//         query: query,
//         response: JSON.stringify(researchContent),
//         model: model,
//         citations: citations,
//       })) || undefined;
//   }

//   const objectResponse = await generateObject({
//     model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
//     schema: generatedIntegration,
//     prompt: `You are an expert at structuring developer integration documentation from research results.

// Extract and structure ONLY the integration that was actually researched in the content below.

// The research was conducted for: "${prompt}"

// Extract and structure the research findings into this exact format:

// {
//     "title": "string",
//     "description": "string",
//     "tags": ["string"],
//     "env_variables": [
//         {
//             "id": "string",
//             "description": "string"
//         }
//     ],
//     "user_instructions": "string",
//     "llm_instructions": "string",
//     "documentation_urls": ["string"],
//     "main_domain": "string"
// }

// Field Requirements:
// - Title: Use the actual integration/library name from the research
// - Description: One sentence describing what the integration does
// - Tags: Relevant categories based on the research
// - Environment Variables: Extract the actual env vars mentioned in the research
// - User Instructions: Clear steps from the research for setup and API key configuration
// - LLM Instructions: Technical implementation details from the research
// - Documentation URLs: Official documentation links from the research
// - Main Domain: Extract the main website domain from documentation URLs (e.g., "twilio.com" from "https://docs.twilio.com")

// Research Content:
// <research>
// ${researchContent}
// </research>

// IMPORTANT:
// - Extract information ONLY from the research content provided
// - If the research content appears empty or lacks sufficient information, throw an error
// - The title should be the actual library/service name followed by "Integration" (e.g., "Twilio Integration", "Stripe Integration")
// - Ensure all code examples and instructions come directly from the research
// - For main_domain, extract the primary website domain, not GitHub or documentation subdomains (e.g., "twilio.com" not "docs.twilio.com" or "github.com/twilio/twilio-node")

// `,
//   });

//   const generatedObject = objectResponse.object;

//   if (generatedObject.documentation_urls) {
//     const validationResults = await Promise.all(
//       generatedObject.documentation_urls.map(isValidUrl),
//     );
//     generatedObject.documentation_urls =
//       generatedObject.documentation_urls.filter(
//         (_, index) => validationResults[index],
//       );
//   }

//   // Generate favicon URL from AI-provided main_domain or documentation URLs
//   let faviconUrl = "";
//   if (generatedObject.main_domain) {
//     faviconUrl = `https://www.google.com/s2/favicons?domain=${generatedObject.main_domain}&sz=32`;
//   } else {
//     faviconUrl = extractMainDomainAndFavicon(
//       generatedObject.documentation_urls,
//     );
//   }
//   console.log("[Integration Agent] Generated favicon URL:", faviconUrl);

//   console.log(
//     "[Integration Agent] Generated integration:",
//     generatedObject.title,
//   );

//   // Return the integration with the favicon URL (excluding main_domain from database save)
//   const { main_domain, ...integrationWithoutMainDomain } = generatedObject;
//   return {
//     ...integrationWithoutMainDomain,
//     cover_image: faviconUrl,
//   };
// }
