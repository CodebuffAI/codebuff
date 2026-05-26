"use node";

import { MODELS } from "!/utils/registry";
import { generateText, stepCountIs, tool } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

// Function to add line numbers to file content
function addLineNumbers(content: string): string {
  const lines = content.split("\n");
  return lines.map((line, index) => `${index + 1}: ${line}`).join("\n");
}

export const abstractorAgent = internalAction({
  args: {
    project: v.id("project"),
    entry_point_id: v.id("entry_point"),
  },
  handler: async (ctx, args) => {
    // project data, entry point data

    // @ts-ignore
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.project,
    });

    const entryPoint = await ctx.runQuery(internal.entry_point.getEntryPoint, {
      entryPointId: args.entry_point_id,
    });

    if (!project || !entryPoint || !entryPoint.page) {
      throw new Error("Project or entry point not found");
    }

    // create codesandbox

    const codesandboxId = project.sandbox_id;
    const codebase = await initializeCodebase(
      codesandboxId,
      project.packageManager,
    );
    const currentPageContent = await codebase.readFile(
      entryPoint.page.page_file,
    );

    // gets the files in the codebase
    const filesInCodebase = await codebase.getAllFilePaths();

    // keep only typescript files
    const filteredFiles = filesInCodebase.filter(
      (file) =>
        (file.endsWith(".ts") || file.endsWith(".tsx")) &&
        !file.includes("components/ui"), // filter out shad cn components
    );

    const filesInContext: {
      file_path: string;
      file_content: string;
    }[] = [];

    for (const file of entryPoint.associated_files) {
      const fileContent = await codebase.readFile(file);
      filesInContext.push({ file_path: file, file_content: fileContent });
    }

    const filesInContextString = filesInContext
      .map(
        (file) => `
            File path: ${file.file_path}
            File content: 
            <FileContent path="${file.file_path}">
            ${file.file_content}
            </FileContent>
            `,
      )
      .join("\n");

    // Load recent messages context (up to the latest user message)
    // Note: getProjectMessages now returns messages in DESC order (newest first)
    const projectMessages = await ctx.runQuery(
      internal.thread.getProjectMessages,
      { projectId: project._id },
    );
    // Find the latest user message (messages are already newest first)
    const lastUserIdx = projectMessages.findIndex((m) => m.role === "user");
    const cutIndex =
      lastUserIdx === -1 ? projectMessages.length : lastUserIdx + 1;
    // Take up to 15 messages before (and including) the latest user message
    const recentMessages = projectMessages.slice(0, cutIndex).reverse(); // Reverse to get chronological order (oldest to newest)
    const recentMessagesMarkdown = recentMessages
      .map((m) => `- ${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    // Check if the abstraction is too long
    const abstractionLength = entryPoint.abstraction?.length || 0;
    const isAbstractionTooLong = abstractionLength > 4500;
    const lengthWarning = isAbstractionTooLong
      ? `\n\n⚠️ WARNING: The previous abstraction is ${abstractionLength} characters, which exceeds the 4500 character limit. You MUST significantly reduce it by cutting down on less relevant words and details. Focus only on the most critical logic and behavior.\n`
      : "";

    const abstractorPrompt = `You are generating a concise, markdown-formatted PRD-style document describing the logic and behavior of a single page in a Vite + React + Convex app.

This PRD should be very clear in highlighting the underlying logic and behavior of the page, including the relevant components, workflows, logic, etc, that pertain to the dependent files.

You will be focused on a single page and its dependencies:
1. Ensure the page is not missing any associated files by adding all dependencies of the page and its sub-components and convex functions
2. If the page's components and convex functions are all added to context, read through and trace the logic of the page and its dependencies
3. Create the PRD visualization based off of the logic of the page file and its dependencies

Use the context of what happened in the recent chat / agent actions since previous user request to determine page & file relevancy as well as changes made:
<chat_context>
${recentMessagesMarkdown}
</chat_context>

Current page's previous abstraction (if any) for reference for what was previously there (start a new one if empty; if not empty, update it with the new code / chat changes):
<previous_abstraction>
${entryPoint.abstraction}
</previous_abstraction>${lengthWarning}

Base Requirements:
- Reflect only what's actually implemented in the code (workflows, logic, components, sections, features, etc); do not invent behavior.
- Use clear markdown sections and bullet points (no HTML). Keep it short and skimmable with clear visual spacing between sections.
- Include labels/text as they appear in code when relevant for fixed text
- Focus on user-visible behavior and underlying logic; avoid implementation noise.
- Keep it as concise and short as possible. Keep it maximum 800 words. Do not go over; compact other sections to fit it within the limit

** PAGE INFORMATION **
Page under analysis:
<Page file_path="${entryPoint.page.page_file}">
Title: ${entryPoint.page.page_title}
URL Route: ${entryPoint.page.page_display_url}

Entry Code For Page:
<File path="${entryPoint.page.page_file}">
${currentPageContent}
</File>
</Page>

Dependencies you can reference (must be from this list only, no 3rd-party docs):
<project_file_tree>
${filteredFiles.join("\n")}
</project_file_tree>

Associated Dependency Files already loaded into context (include all unique relevant files that are dependencies of the page and its sub-components and its convex functions):
<FilesInContext>
${filesInContextString}
</FilesInContext>



** ADDING CONVEX FUNCTIONS TO CONTEXT **
Convex functions are not referenced directly by file paths, but rather, in a convex useMutation, useQuery, or useAction hook.
- If a Convex function is referenced by a useMutation, useQuery, or useAction hook, map it to the correct file path under src/convex/ as noted in the file tree.
- The relevant file is based on the hook's reference, ie api.file.functionName or api.folder.file.functionName
- Add that file that is being referenced to the context

** DO NOT INCLUDE THESE FILES IN CONTEXT **
Do not include the following files in context as they are not unique to the page, unless it is an auth page or uses functionality unique to the page:
- src/convex/schema.ts
- src/hooks/use-auth.ts
- src/convex/users.ts
- src/convex/auth.ts
- config files (ie src/convex/auth.config.ts)
- env files

Files that are in context should be unique to the page. Do not include any common files found on multiple pages.


Instructions:
- Structure like a mini PRD in markdown (but be as concise as possible):
  - Very short Overview summary
  - Then go feature by feature for the page and provide: a High level overview as well as step by step logic for each feature / component on the page, as well as any specific navigation, actions, logic, etc.

- Keep it short. Prefer concise bullets over paragraphs. Omit irrelevant sections. Limit is 800 words.
- Only include functions/files actually used by this page. Never include the schema.ts file or files that are not relevant / not dependencies of the page.
- Do not include any auth hooks or irrelevant auth files (unless it's an auth-specific page) as almost every page has auth
- Do not include UI primitive components (shadcn primitives) or unrelated files that do not contribute to the logic of the page.
- Remove any files from context that are not relevant / not dependencies / not unique of the page.
- Look at the files already in context. Add any missing logic from the codebase to the abstraction.
- Do not call it a PRD. You are documenting it.
- Output markdown only (no extra commentary outside the doc).
- Do not update the abstraction with irrelevant changes, such as styling, etc.
- Keep this specification extremely short with as minimal characters as possible in a well formatted and properly spaced visual format.

DO NOT FIX ERRORS OR BUGS. YOU HAVE ONLY ONE JOB: REWRITE AND UPDATE THE ABSTRACTION SPECIFICATION BY OUTPUTTING ONLY WHAT HAS CHANGED IN THE PAGE LOGIC.

If there are no relevant changes to the page logic or behavior based on the recent chat context, output "SAME". Most commonly there will be no changes, especially if the edits are small or unrelated to this page. Only update the abstraction if there are meaningful changes to the page's logic, features, or behavior.
`;

    console.log("Abstractor prompt", abstractorPrompt);

    const abstractFileResponse = await generateText({
      tools: {
        addFilesToContext: tool({
          description:
            "Read associated files and add them to the context. Read in files that are dependencies and relevant files.",
          inputSchema: z.object({
            file_paths: z.array(z.string()),
          }),
          execute: async ({ file_paths }) => {
            console.log(
              "Abstraction tool called: Adding files to context",
              file_paths,
            );
            const readInFiles: {
              file_path: string;
              file_content: string;
            }[] = [];
            for (const file_path of file_paths) {
              try {
                const fileContent = await codebase.readFile(file_path);
                readInFiles.push({
                  file_path: file_path,
                  file_content: fileContent,
                });
              } catch (error) {
                console.error(`Error reading file ${file_path}:`, error);
              }
            }

            // add to context
            await ctx.runMutation(internal.entry_point.addFilesToContext, {
              entryPointId: args.entry_point_id,
              filePaths: readInFiles.map((file) => file.file_path),
            });

            return readInFiles
              .map(
                (file) => `File path: ${file.file_path}
                            Content:
                            <FileContent path="${file.file_path}">
                            ${file.file_content}
                            </FileContent>
                            `,
              )
              .join("\n");
          },
        }),
        editPageTitleOrRouteURL: tool({
          description: "Edit the page's title (maximum 4 words)",
          inputSchema: z.object({
            new_title: z.optional(z.string()),
          }),
          execute: async ({ new_title }) => {
            console.log(
              "Abstraction tool called: Editing page title or route url",
              new_title,
            );
            await ctx.runMutation(
              internal.entry_point.editPageTitleOrRouteURLInternal,
              {
                entryPointId: args.entry_point_id,
                new_title: new_title,
              },
            );

            return `Page title updated to ${new_title}`;
          },
        }),
        removeFilesFromContext: tool({
          description:
            "Remove files from the context. Clean up unnecessary / irrelevant files that should not be associated with this page.",
          inputSchema: z.object({
            file_paths: z.array(z.string()),
          }),
          execute: async ({ file_paths }) => {
            console.log(
              "Abstraction tool called: Removing files from context",
              file_paths,
            );
            await ctx.runMutation(internal.entry_point.removeFilesFromContext, {
              entryPointId: args.entry_point_id,
              filePaths: file_paths,
            });

            return `Files removed from context: ${file_paths.join(", ")}`;
          },
        }),
        // regenerateDynamicData: tool({
        //   description:
        //     "Regenerate dynamic data for the page. Only do this if the route url contains slugs/ids and the dynamic data generator tool failed.",
        //   parameters: z.object({
        //     instructions: z.optional(z.string()),
        //   }),
        //   execute: async ({ instructions }) => {
        //     return await generateDynamicData(instructions);
        //   },
        // }),
      },
      model: MODELS.ABSTRACTION_MODEL,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 1024,
            includeThoughts: true,
          },
        },
      },
      stopWhen: stepCountIs(8),

      prompt: abstractorPrompt,
    });
    console.log("Abstraction generated", abstractFileResponse.text);

    // If the model outputs "SAME", don't make any changes to the abstraction
    if (abstractFileResponse.text.trim().toUpperCase() === "SAME") {
      console.log("No changes to abstraction, keeping existing version");
      // Still update status to active
      await ctx.runMutation(internal.entry_point.editEntryPoint, {
        entryPointId: args.entry_point_id,
        status: "active",
      });
      return;
    }

    // update new abstraction and stop processing
    await ctx.runMutation(internal.entry_point.editEntryPoint, {
      entryPointId: args.entry_point_id,
      abstraction: abstractFileResponse.text,
      status: "active",
    });
    console.log("Abstraction updated for entry point", args.entry_point_id);

    const projectEntryPoints = await ctx.runQuery(
      internal.entry_point.getProjectEntryPoints,
      {
        projectId: args.project,
      },
    );

    const projectPageFilePaths = projectEntryPoints
      .map((entryPoint) => entryPoint.page?.page_file)
      .filter((file) => file !== undefined);

    //     const userMessage = `You are an expert at extracting navigation references from a page's abstraction.
    // It contains the logic of the page code and its dependencies. Extract a concise list of navigation links.

    // Available page paths:
    // ${projectPageFilePaths.join("\n")}

    // Current abstraction with line numbers:
    // ${addLineNumbers(abstractFileResponse.text)}

    // ${
    //   entryPoint.page?.navigation_paths?.length
    //     ? `Previous navigation references (keep as much the same as possible; you will override this list completely):
    // ${entryPoint.page.navigation_paths
    //   .map(
    //     (p) =>
    //       `Navigation path: ${p.navigation_path}\nDescription: ${p.description}`,
    //   )
    //   .join("\n")}
    // `
    //     : ""
    // }

    // Output JSON with navigation_references: [{ navigation_path, description, line_number }].`;

    // add navigation references

    // TODO: bring these back when we need them when we want to generate visual page graphs

    // const navigationReferences = await generateObject({
    //   model: google("gemini-2.5-flash-preview-04-17"),
    //   schema: z.object({
    //     navigation_references: z.array(
    //       z.object({
    //         navigation_path: z.string(),
    //         description: z.string(),
    //         line_number: z.number(),
    //       }),
    //     ),
    //   }),
    //   prompt: userMessage,
    // });

    // await ctx.runMutation(
    //   internal.entry_point.updateEntryPointNavigationPaths,
    //   {
    //     entryPointId: args.entry_point_id,
    //     navigationPaths: navigationReferences.object.navigation_references,
    //   },
    // );

    // console.log(
    //   "Navigation references generated",
    //   JSON.stringify(navigationReferences.object, null, 2),
    // );
  },
});
