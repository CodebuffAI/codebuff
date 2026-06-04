"use node";

import { v } from "convex/values";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { generateThemeCSS } from "../utils/themeUtils";

const colorValidator = v.object({
  name: v.string(),
  colors: v.object({
    main: v.string(),
    foreground: v.string(),
  }),
});

const typographyValidator = v.object({
  fontSans: v.string(),
  fontSerif: v.string(),
  fontMono: v.string(),
  letterSpacing: v.number(),
});

export const updateTheme = action({
  args: {
    projectId: v.id("project"),
    themeConfig: v.object({
      colors: v.object({
        primary: colorValidator,
        secondary: colorValidator,
        accent: colorValidator,
        base: colorValidator,
        card: colorValidator,
        popover: colorValidator,
        muted: colorValidator,
        destructive: colorValidator,
        border: colorValidator,
        chart: colorValidator,
        sidebar: colorValidator,
      }),
      typography: typographyValidator,
    }),
  },
  handler: async (ctx, args) => {
    console.log("Starting theme update for project:", args.projectId);

    // Get project details
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    console.log("Found project with sandbox_id:", project.sandbox_id);

    // Create codebase instance
    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );
    console.log("Codebase instance created successfully");

    // Generate the new CSS content
    const cssContent = generateThemeCSS(args.themeConfig);
    console.log("Generated CSS content length:", cssContent.length);
    console.log("CSS content preview:", cssContent.substring(0, 200) + "...");

    // Write the updated CSS to index.css
    console.log("Writing CSS to src/index.css");
    await codebase.writeFile("src/index.css", cssContent);
    console.log("CSS file written successfully");

    return {
      success: true,
      message: "Theme updated successfully",
      cssLength: cssContent.length,
    };
  },
});
