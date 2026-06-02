"use node";

import { internal } from "!/_generated/api";
import { Id } from "!/_generated/dataModel";
import { ActionCtx } from "!/_generated/server";
import { SharedContext } from "!/coding_agent/context/assembly";
import { MODELS } from "!/utils/registry";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import {
  searchContext7Libraries,
  fetchContext7Documentation,
} from "!/utils/context7";

/**
 * This is what is called
 * @param ctx
 * @param sharedContext
 * @param query
 * @returns
 */
export async function addIntegration(
  ctx: ActionCtx,
  sharedContext: SharedContext,
  query: string,
) {
  console.log(`[Add Integration] Starting flow - Query: "${query}"`);

  // Create integration log
  const logId = await ctx.runMutation(
    internal.integrations.createIntegrationLog,
    {
      projectId: sharedContext.project._id,
      query,
    },
  );

  // OPTIMIZATION: Use search query to pre-filter relevant integrations from the library
  // This significantly reduces data reads by only fetching integrations matching the user's request
  const allIntegrations = await ctx.runQuery(
    internal.integrations.getAllIntegrations,
    {
      projectId: sharedContext.project._id,
      searchQuery: query, // Pass user's query to filter relevant integrations
    },
  );

  console.log(
    `[Add Integration] Loaded ${allIntegrations.length} relevant integrations (search-filtered), starting selection phase`,
  );

  await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
    logId,
    step: `Loaded ${allIntegrations.length} relevant integrations from library (search-filtered)`,
  });

  // message being returned to the agent
  let resultMessage = "Failed to create integration.";

  // use different one to select. 2.5 flash
  const selection = await generateText({
    model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 2000,
          includeThoughts: false,
        },
      },
    },
    tools: {
      google_search: google.tools.googleSearch({}) as any,
    },
    prompt: `You are a search and select agent for integrations for a web application that a user is trying to add. You are given an integration description for what the user is looking to integrate into their project, and your job is to:
    1. Find an existing integration that matches the description based on reference_id and output it
    2. OR request a new integration to be researched if it doesn't exist in the library

    This codebase is built with the following tech stack:

    - Typescript for the language. Everything in .ts or .tsx
    - React (write all frontend with react)
    - Tailwind for styling and shad cn as the UI library
    - Convex for the backend and database and auth
    - Various integrations, including convex components, general integrations, etc.

    Here are the integrations that have been added to the project so far:
    ${sharedContext.projectIntegrations
      .map(
        (integration) => `
    - ${integration.title}
    `,
      )
      .join("\n")}


    Here are the remaining integrations that can be added to the project that you will select from (if it exists in the library):

    <existing_integration_options>
        ${allIntegrations
          .map(
            (integration: any) => `
            <integration_option id="${integration.reference_id}">
                integration id: ${integration.reference_id}
                title: ${integration.title}
                description: ${integration.description}
                tags: ${integration.tags.join(", ")}
            </integration_option>

        `,
          )
          .join("\n")}
    </existing_integration_options>

    Here is the integration details as to the integration that the user wishes to add to the codebase:
    <user_query>
        ${query}
    </user_query>

    ** OUTPUT FORMAT **
    You MUST output your response in ONE of the following two formats:

    1. If you find an existing integration that matches, output ONLY the reference_id (do not include any other prefixes or suffixes; only the original id):
       <reference_id>the-reference-id</reference_id>

    2. If the integration does NOT exist in the library, output a brief description for research:
       <new_integration>Brief description of what needs to be researched and created</new_integration>

    Do NOT output both tags. Choose ONE based on whether the integration exists in the library or not.
    Do NOT include any other text outside these XML tags.
    Call the complete_research tool once you have found the integration and are ready to return the results.
    Keep the results extremely concise and make the additional information as short and concise as possible (do not include much information; maximum 1 sentence)
    `,
  });

  console.log(`[Add Integration] Raw output: ${selection.text}`);

  await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
    logId,
    step: "Completed selection phase - analyzing AI response",
  });

  // Extract XML tags from response
  // Remove the 's' flag for compatibility with environments before 'es2018'
  const referenceIdMatch = selection.text.match(
    /<reference_id>(.*?)<\/reference_id>/,
  );
  const newIntegrationMatch = selection.text.match(
    /<new_integration>(.*?)<\/new_integration>/,
  );

  // Process based on which tag was found
  if (referenceIdMatch) {
    const referenceId = referenceIdMatch[1].trim();
    console.log(
      `[Add Integration] Selected existing integration: ${referenceId}`,
    );

    await ctx.runMutation(internal.integrations.updateIntegrationLogType, {
      logId,
      type: "existing",
    });

    try {
      const integration = await ctx.runMutation(
        internal.integrations.addIntegrationReferenceIdToProject,
        {
          projectId: sharedContext.project._id,
          integrationReferenceId: referenceId,
        },
      );

      console.log(
        `[Add Integration] Success: Added existing integration "${integration.title}"`,
      );

      await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
        logId,
        step: `Successfully added existing integration: ${integration.title}`,
      });

      // Update the assistant message with the integration reference
      if (sharedContext.assistantMessageId) {
        await ctx.runMutation(
          internal.messages.updateMessageIntegrationReference,
          {
            messageId: sharedContext.assistantMessageId,
            integrationId: integration._id,
          },
        );
      }

      await ctx.runMutation(internal.integrations.completeIntegrationLog, {
        logId,
        integrationId: integration._id,
        status: "already_existing",
        result: `Added existing integration: ${integration.title}`,
      });

      resultMessage = `The following existing integration has been added to the project from the library: ${integration.title}. Here are its details and setup instructions:

                <integration_details>
                    title: ${integration.title}
                    description: ${integration.description}
                    tags: ${integration.tags.join(", ")}
                    documentation_urls: ${integration.documentation_urls.join(", ")}
                </integration_details>

                <setup_instructions>
                    ${integration.user_instructions}

                    Env variables: ${integration.env_variables?.map((envVar: { id: string; description: string }) => `${envVar.id}: ${envVar.description}`).join(", ") || "None"}

                    Make sure that the user sets up the env vars correctly.
                </setup_instructions>

                <llm_instructions>
                    ${integration.llm_instructions}
                </llm_instructions>`;
    } catch (error) {
      console.error(
        `[Add Integration] Error: Failed to add existing integration - ${error}`,
      );

      await ctx.runMutation(internal.integrations.failIntegrationLog, {
        logId,
        error: `Failed to add existing integration: ${error}`,
      });

      resultMessage = `Error adding integration: ${error}`;
    }
  } else if (newIntegrationMatch) {
    const researchDescription = newIntegrationMatch[1].trim();
    console.log(
      `[Add Integration] Creating new integration: ${researchDescription}`,
    );

    await ctx.runMutation(internal.integrations.updateIntegrationLogType, {
      logId,
      type: "new",
    });

    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: `No existing integration found - starting deep research: ${researchDescription}`,
    });

    const result = await researchNewIntegration(
      ctx,
      sharedContext,
      `${query}\nAdditional context: ${researchDescription}`,
      logId,
    );

    console.log(`[Add Integration] New integration research completed`);
    resultMessage = result;
  } else {
    console.error(
      `[Add Integration] Error: No valid XML tags found in response`,
    );

    await ctx.runMutation(internal.integrations.failIntegrationLog, {
      logId,
      error: "No valid XML tags found in AI response",
    });

    resultMessage = `Error: Unable to process integration request. The AI did not provide a valid response format.`;
  }

  console.log(
    `[Add Integration] Completed - Result: ${resultMessage.substring(0, 100)}...`,
  );

  return resultMessage;
}

async function researchNewIntegration(
  ctx: ActionCtx,
  sharedContext: SharedContext,
  query: string,
  logId: Id<"integration_logs">,
) {
  console.log(
    `[Research Integration] Starting deep research - Query: "${query}"`,
  );

  await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
    logId,
    step: "Starting Context7 search for relevant documentation",
  });

  // Step 1: Search Context7 for relevant libraries
  let context7Documentation = "";
  let selectedLibraryName = "";

  // Track Context7 results for logging
  const context7LogData: {
    searched: boolean;
    search_results?: string;
    results_count?: number;
    selected_library_id?: string;
    raw_documentation?: string;
    documentation_length?: number;
    error?: string;
  } = {
    searched: true,
  };

  try {
    console.log(
      `[Research Integration] Searching Context7 with query: "${query}"`,
    );
    const context7Results = await searchContext7Libraries(query);

    if (context7Results.error) {
      console.log(
        `[Research Integration] Context7 search error: ${context7Results.error}`,
      );
      context7LogData.error = context7Results.error;
      await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
        logId,
        step: `Context7 search error: ${context7Results.error}`,
      });
    } else if (context7Results.results && context7Results.results.length > 0) {
      // Store the full search results as JSON
      context7LogData.search_results = JSON.stringify(
        context7Results.results,
        null,
        2,
      );
      context7LogData.results_count = context7Results.results.length;
      console.log(
        `[Research Integration] Found ${context7Results.results.length} Context7 results`,
      );
      await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
        logId,
        step: `Found ${context7Results.results.length} potential matches in Context7`,
      });

      // Step 2: Have AI select the best matching library
      const selectionPrompt = `You are selecting the best matching library from Context7 search results for the user's query.

User's integration request: "${query}"

Context7 Search Results:
${JSON.stringify(
  context7Results.results.slice(0, 5).map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
  })),
  null,
  2,
)}

Respond with ONLY the library ID (e.g., "/twilio/twilio-node") of the best match for the id specifically, or respond with "NO_MATCH" if none of these libraries match the user's request.

Guidelines:
- Select the library that most closely matches what the user is asking for
- Consider the library title and description
- If the user is asking for a specific service (like Twilio, Stripe, etc.), match that service
- It must match the id exactly. do not include any prefixes etc. 

If there is clearly zero match, mark no_match as true.

Most of the time, it matches the user's request. Go for the one that is most relevant. Fill library_id with the library ID if there is a match, otherwise leave it blank.
`;

      const selectionResponse = await generateObject({
        model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
        providerOptions: {
          anthropic: {
            thinking: {
              type: "enabled",
              budgetTokens: 2000,
            },
          },
        },
        prompt: selectionPrompt,
        schema: z.object({
          library_id: z
            .string()
            .describe("The library ID of the best match for the user's request")
            .optional(),
          no_match: z
            .boolean()
            .describe("Whether no match was found for the user's request")
            .optional(),
        }),
      });

      const selectedLibraryId = selectionResponse.object.library_id;
      console.log(
        `[Research Integration] AI selected library: ${selectedLibraryId}`,
      );

      if (selectedLibraryId && !selectionResponse.object.no_match) {
        context7LogData.selected_library_id = selectedLibraryId;
        await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
          logId,
          step: `Selected Context7 library: ${selectedLibraryId}`,
        });

        // Step 3: Fetch the Context7 documentation
        console.log(
          `[Research Integration] Fetching Context7 docs for: ${selectedLibraryId}`,
        );
        try {
          const docs = await fetchContext7Documentation(selectedLibraryId, {
            tokens: 15000,
          });

          if (docs) {
            context7Documentation = docs;
            selectedLibraryName = selectedLibraryId;
            // Store the full raw documentation
            context7LogData.raw_documentation = docs;
            context7LogData.documentation_length = docs.length;
            console.log(
              `[Research Integration] Successfully fetched Context7 docs (${docs.length} chars)`,
            );
            await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
              logId,
              step: `Fetched Context7 documentation (${docs.length} characters)`,
            });
          } else {
            console.log(
              `[Research Integration] No Context7 documentation available (null response)`,
            );
            await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
              logId,
              step: `Context7 documentation not available`,
            });
          }
        } catch (docError) {
          const docErrorMsg =
            docError instanceof Error ? docError.message : String(docError);
          context7LogData.error = `Documentation fetch error: ${docErrorMsg}`;
          console.error(
            `[Research Integration] Error fetching Context7 docs:`,
            docError,
          );
          await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
            logId,
            step: `Context7 documentation fetch error: ${docErrorMsg}`,
          });
        }
      } else {
        console.log(
          `[Research Integration] No matching library found in Context7`,
        );
        await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
          logId,
          step: `No matching library found in Context7 results`,
        });
      }
    } else {
      context7LogData.results_count = 0;
      context7LogData.search_results = JSON.stringify([], null, 2);
      console.log(`[Research Integration] No Context7 results found`);
      await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
        logId,
        step: `No results found in Context7`,
      });
    }
  } catch (error) {
    const errorDetails =
      error instanceof Error
        ? `${error.message}\nStack: ${error.stack}`
        : String(error);
    console.error(`[Research Integration] Context7 search failed:`, error);
    context7LogData.error = errorDetails;
    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: `Context7 search failed: ${errorDetails}`,
    });
  }

  // Log Context7 results to integration log
  await ctx.runMutation(
    internal.integrations.updateIntegrationLogContext7Results,
    {
      logId,
      context7_results: context7LogData,
    },
  );

  // Now proceed with the main research agent
  if (context7Documentation) {
    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: `Proceeding with AI research using Context7 docs (${context7Documentation.length} chars) as foundation`,
    });
  } else {
    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: "Proceeding with AI research using web search only (no Context7 docs found)",
    });
  }

  // take the query and have it fill out the information for the new integration
  let resultMessage = "Failed to research new integration.";

  let response;
  let resultText = "";

  const webSearchTool = anthropic.tools.webSearch_20250305({
    maxUses: 25,
  });
  try {
    // have the AI choose from the existing integrations which one to add based on reference id
    response = await generateText({
      // model: MODELS.PRIMARY_MODELS.GROK_4_FAST,
      // providerOptions: {
      //     xai: {
      //       searchParameters: {
      //         mode: 'auto', // 'auto', 'on', or 'off'
      //         returnCitations: true,
      //         maxSearchResults: 10,
      //       },
      //     },
      //   },
      model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
      providerOptions: {
        anthropic: {
          thinking: {
            type: "enabled",
            budgetTokens: 4000,
          },
        },
      },

      //model: openai("o4-mini"),
      // tools: {
      //   web_search_preview: openai.tools.webSearchPreview({
      //     // optional configuration:
      //     searchContextSize: 'high',
      //     userLocation: {
      //       type: 'approximate',
      //       city: 'San Francisco',
      //       region: 'California',
      //     },
      //   })
      // },
      // Force web search tool (optional):
      //model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
      tools: {
        web_search: webSearchTool as any,

        //google_search: google.tools.googleSearch({}) as any,

        //web_search: openai.tools.webSearch({searchContextSize: 'medium'}),
        // google_search: google.tools.googleSearch({}) as any,
        // url_context: google.tools.urlContext({}) as any,
        think_and_search_again: tool({
          description:
            "Think about the information and the next step to take. Call this to reason about the information gathered; do not call this to submit your integration (do not call any tools to do so). Calling this tool will enable you to search again for more details. Call the search tool.",
          inputSchema: z.object({
            thinking: z.string(),
          }),
          execute: async ({ thinking }) => {
            console.log(
              `[Research Integration] Thinking tool called: ${thinking}`,
            );
            // log as step
            await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
              logId,
              step: `Thinking tool called: ${thinking}`,
            });
            return "Thinking done. Continue with searching for more resources.";
          },
        }),
        // complete_research: tool({
        //   description: "Once research is done, call this tool to complete the research and return the results. You must call this tool after you have completed your research. You must fill in the field in the output format specified",
        //   inputSchema: z.object({
        //     output: z.string().describe("The output of the research in the format specified"),
        //   }),
        //   execute: async ({ output }) => {
        //     resultText = output;
        //     return "Research completed. Return the results.";
        //   },
        // }),
      },
      //toolChoice: "required",
      stopWhen: stepCountIs(40),

      prompt: `You are a deep research agent whose job is to research a new integration for a web application project. You will be given an integration description, and your goal is to research the project's setup instructions, environmental variables, etc.
      
      This codebase is built with the following tech stack:

      - Typescript for the language. Everything in .ts or .tsx
      - React (write all frontend with react)
      - Tailwind for styling and shad cn as the UI library
      - Convex for the backend and database and auth
      - Various integrations, including convex components, general integrations, etc
      - pnpm as the package manager

      When researching integrations, make sure that the integrations fit with the convex backend, the react frontend, and the typescript node environment (as well as other relevant parts).
      
      Remember that all node runtimes for convex actions require a "use node" directive at the top of the file, and that you cannot directly access the database from actions in the same file.

      However, do not include any code about convex-specific integration; the main AI will already know how to integrate with convex.

      ${
        context7Documentation
          ? `
      ** CONTEXT7 DOCUMENTATION AVAILABLE **
      We have already fetched documentation from Context7 for: ${selectedLibraryName}
      
      This documentation provides foundational information about the integration. Your job is to:
      1. Use this Context7 documentation as the primary source
      2. Fill in ANY missing information with web search
      3. Verify and enhance the information with additional details as needed
      
      Context7 Documentation:
      <context7_docs>
      ${context7Documentation.substring(0, 15000)}
      </context7_docs>
      `
          : ""
      }

      ** RESEARCHING **
      - You must thoroughly research the integration and its documentation
      ${context7Documentation ? "- Use the Context7 documentation provided above as your primary source" : ""}
      - Use web search to fill in any gaps or missing information
      - Research for: integration description, user setup instructions, llm setup instructions, and environment variables
      - Once you have found the piece of information, remember it and make sure it is accurate when you return it to the user.
      - Complete your research in maximum 10 steps
      - Make sure to use the node js version of the sdk that you research so that it runs best through sdk in typescript node environment on convex.

      ** REQUIRED INFORMATION **
      You are to return the following information when submitting the integration:
      - Title: The short title of the integration
      - Description: The concise description of the integration
      - Tags: The tags of the integration for searchability (max 3)
      - Env variables (IMPORTANT): The environment variables and api keys required for the integration with descriptions
      - User instructions (IMPORTANT): The concise user instructions of the integration for what the user needs to do to find the api keys and configure them. ONLY INCLUDE USER INSTRUCTIONS, NOT SETUP INSTRUCTIONS. It should not contain any installation details, etc.
      - LLM instructions: The llm instructions of the integration for setup and basic usage. this is for installation on how to install it and how to use it. be thorough and detailed and have very clear examples with code snippets but limit it to 1 page of instructions to keep it concise.
      - Documentation urls: Relevant documentation urls
      - Main domain: The main domain of the integration. used to extract the favicon. can be main site or docs.
      - Public status: Determine if this integration should be public or private based on the criteria below

      ** PUBLIC/PRIVATE DETERMINATION CRITERIA:**
      You should make all integrations public by default. Make it private only if it is inappropriate or sensitive.

      KEEP GOING UNTIL YOUR RESULTS ARE THOROUGH AND COMPLETE. REPEATEDLY CALL THE SEARCH TOOL TO FIND MORE INFORMATION.

      ** OUTPUT FORMAT **
      You MUST output your final integration details in the following XML format:

      <integration>
        <title>Integration Title</title>
        <description>Integration description</description>
        <tags>tag1,tag2,tag3</tags>
        <env_variables>
          <env_var>
            <id>API_KEY</id>
            <description>Description of this env var</description>
          </env_var>
        </env_variables>
        <user_instructions>User setup instructions (where to sign up and get the api keys, concise markdown format)</user_instructions>
        <llm_instructions>LLM setup instructions (installation, basic usage)</llm_instructions>
        <documentation_urls>https://url1.com,https://url2.com</documentation_urls>
        <main_domain>example.com</main_domain>
        <public_status>PUBLIC/PRIVATE</public_status>
      </integration>

      ** RULES TO FOLLOW **
      - ALWAYS MAKE SURE TO RETURN THE INFORMATION IN THE CORRECT XML FORMAT. Make sure all information is accurate and verified
      - Always be as concise as possible. Keep minimal words and do not use any filler words or irrelevant information. Be concise; use bullet points and clear concise sections in instructions
      - Output ONLY the XML at the end of your research. Do not include any other text outside the <integration> tags.
      - Continue searching through resources to find the correct documentation.
      - Keep LLM instructions as concise as possible; make sure all content is 100% accurate and verified; do not include unverified information and do not include any convex-specific modifications.

      Your text output is the one that will be parsed and used. Do not include the output format in any thinking or tool calls.
      
      Here is the user request for the integration you must deep research. Use this information and any other context7 or web resources to fulfill this request:
      <user_request>
          ${query}
      </user_request>
      `,
    });
    resultText = response.text;

    console.log(`[Research Integration] Raw output: ${response.text}`);

    // Save the raw AI output to the integration log
    await ctx.runMutation(
      internal.integrations.updateIntegrationLogDeepResearch,
      {
        logId,
        deep_research_results: JSON.stringify(response),
      },
    );

    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: "AI research completed - parsing integration details",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Research Integration] Error during AI research: ${errorMessage}`,
    );

    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: `AI research failed: ${errorMessage}`,
    });

    await ctx.runMutation(internal.integrations.failIntegrationLog, {
      logId,
      error: `AI research generation failed: ${errorMessage}`,
    });

    resultMessage = `Error during AI research: ${errorMessage}`;
    return resultMessage;
  }

  // Log the result text being processed
  console.log(
    `[Research Integration] Processing result text (length: ${resultText.length}): ${resultText.substring(0, 500)}...`,
  );

  await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
    logId,
    step: `Processing result text from complete_research tool: ${resultText}`,
  });

  // Parse the XML response
  const integrationMatch = resultText.match(
    /<integration>([\s\S]*?)<\/integration>/,
  );

  if (!integrationMatch) {
    console.error(
      `[Research Integration] Error: No valid integration XML found`,
    );

    await ctx.runMutation(internal.integrations.failIntegrationLog, {
      logId,
      error:
        "Unable to extract integration details from research - no valid XML found",
    });

    resultMessage = `Error: Unable to extract integration details from research.`;
    return resultMessage;
  }

  try {
    const integrationXml = integrationMatch[1];

    // Extract fields from XML
    const title =
      integrationXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || "";
    const description =
      integrationXml
        .match(/<description>([\s\S]*?)<\/description>/)?.[1]
        ?.trim() || "";
    const tagsStr =
      integrationXml.match(/<tags>([\s\S]*?)<\/tags>/)?.[1]?.trim() || "";
    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    const userInstructions =
      integrationXml
        .match(/<user_instructions>([\s\S]*?)<\/user_instructions>/)?.[1]
        ?.trim() || "";
    const llmInstructions =
      integrationXml
        .match(/<llm_instructions>([\s\S]*?)<\/llm_instructions>/)?.[1]
        ?.trim() || "";
    const docsStr =
      integrationXml
        .match(/<documentation_urls>([\s\S]*?)<\/documentation_urls>/)?.[1]
        ?.trim() || "";
    const documentation_urls = docsStr
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u);
    const main_domain =
      integrationXml
        .match(/<main_domain>([\s\S]*?)<\/main_domain>/)?.[1]
        ?.trim() || "";

    // Parse public status
    const publicStatusText =
      integrationXml
        .match(/<public_status>([\s\S]*?)<\/public_status>/)?.[1]
        ?.trim() || "";
    const isPublic = publicStatusText.toLowerCase().includes("public");

    // Parse env variables
    const envVarsSection =
      integrationXml.match(/<env_variables>([\s\S]*?)<\/env_variables>/)?.[1] ||
      "";
    const envVarMatches = [
      ...envVarsSection.matchAll(
        /<env_var>[\s\S]*?<id>([\s\S]*?)<\/id>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/env_var>/g,
      ),
    ];
    const env_variables = envVarMatches.map((match) => ({
      id: match[1].trim(),
      description: match[2].trim(),
    }));

    console.log(
      `[Research Integration] Parsed - Title: "${title}", Tags: [${tags.join(", ")}], Env vars: ${env_variables.length}`,
    );

    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: `Parsed integration details: ${title} with ${env_variables.length} env vars`,
    });

    // Generate favicon URL
    let faviconUrl = "";
    if (main_domain) {
      faviconUrl = `https://www.google.com/s2/favicons?domain=${main_domain}&sz=32`;
    } else if (documentation_urls.length > 0) {
      const mainUrl = documentation_urls[0];
      const fallbackUrl = documentation_urls.find(
        (url) => !url.toLowerCase().includes("github.com"),
      );
      if (fallbackUrl) {
        const urlObj = new URL(fallbackUrl);
        faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
      } else {
        const urlObj = new URL(mainUrl);
        faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
      }
    }

    const integrationDetails = {
      title,
      description,
      tags,
      env_variables,
      user_instructions: userInstructions,
      llm_instructions: llmInstructions,
      documentation_urls,
      cover_image: faviconUrl,
      context7_library_id: selectedLibraryName || undefined,
      public: isPublic,
    };

    // Save integration to DB and add to project
    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: `Saving new integration to library and adding to project${selectedLibraryName ? ` (Context7: ${selectedLibraryName})` : ""}`,
    });

    const savedIntegration = await ctx.runMutation(
      internal.integrations.addIntegrationToLibraryAndProject,
      {
        integration: integrationDetails,
        projectId: sharedContext.project._id,
      },
    );

    if (!savedIntegration) {
      console.error(
        `[Research Integration] Error: Failed to save integration - no result returned`,
      );

      await ctx.runMutation(internal.integrations.failIntegrationLog, {
        logId,
        error: "Failed to save integration - no result returned from database",
      });

      resultMessage = "Error saving new researched integration";
      return resultMessage;
    }

    console.log(
      `[Research Integration] Success: Saved and added integration "${savedIntegration.title}"`,
    );

    await ctx.runMutation(internal.integrations.addIntegrationLogStep, {
      logId,
      step: `Successfully created and saved integration: ${savedIntegration.title}`,
    });

    // Update the assistant message with the integration reference
    if (sharedContext.assistantMessageId) {
      await ctx.runMutation(
        internal.messages.updateMessageIntegrationReference,
        {
          messageId: sharedContext.assistantMessageId,
          integrationId: savedIntegration._id,
        },
      );
    }

    await ctx.runMutation(internal.integrations.completeIntegrationLog, {
      logId,
      integrationId: savedIntegration._id,
      status: "created",
      result: `Created new integration: ${savedIntegration.title}`,
    });

    resultMessage = `The following new integration has been researched and added to the project. Here are its details and setup instructions:

                <integration_details>
                    title: ${savedIntegration.title}
                    description: ${savedIntegration.description}
                    tags: ${savedIntegration.tags.join(", ")}
                    documentation_urls: ${savedIntegration.documentation_urls.join(", ")}
                </integration_details>

                <setup_instructions>
                    ${savedIntegration.user_instructions}

                    Env variables: ${savedIntegration.env_variables?.map((envVar: { id: string; description: string }) => `${envVar.id}: ${envVar.description}`).join(", ") || "None"}

                    Make sure that the user sets up the env vars correctly.
                </setup_instructions>

                <llm_instructions>
                    ${savedIntegration.llm_instructions}
                </llm_instructions>`;
  } catch (error) {
    console.error(
      `[Research Integration] Error: Failed to parse or save integration - ${error}`,
    );

    await ctx.runMutation(internal.integrations.failIntegrationLog, {
      logId,
      error: `Failed to parse or save integration: ${error}`,
    });

    resultMessage = `Error processing integration: ${error}`;
  }

  console.log(
    `[Research Integration] Completed - Result: ${resultMessage.substring(0, 100)}...`,
  );

  return resultMessage;
}
