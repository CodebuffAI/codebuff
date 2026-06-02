"use node";

import { v } from "convex/values";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { DEFAULT_THEME_CONFIG, type ThemeConfig } from "../utils/themeUtils";

// Internal action that can use Node.js APIs
export const getProjectTheme = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    // Get project details
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    try {
      // Create codebase instance
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );

      // Try to read the current CSS file
      const cssContent = await codebase.readFile("src/index.css");

      // Parse the CSS to extract theme configuration
      const themeConfig = parseCSSToThemeConfig(cssContent);

      return themeConfig;
    } catch (error) {
      console.error("Error reading theme from CSS:", error);
      // Return default theme if CSS can't be read
      return DEFAULT_THEME_CONFIG;
    }
  },
});

function parseCSSToThemeConfig(cssContent: string): ThemeConfig {
  const themeConfig = { ...DEFAULT_THEME_CONFIG };

  try {
    // Extract typography from CSS
    const fontSansMatch = cssContent.match(/font-family:\s*([^,]+)/);
    if (fontSansMatch) {
      themeConfig.typography.fontSans = fontSansMatch[1]
        .trim()
        .replace(/"/g, "");
    }

    const fontSerifMatch = cssContent.match(
      /\.font-serif\s*{\s*font-family:\s*([^,]+)/,
    );
    if (fontSerifMatch) {
      themeConfig.typography.fontSerif = fontSerifMatch[1]
        .trim()
        .replace(/"/g, "");
    }

    const fontMonoMatch = cssContent.match(
      /\.font-mono\s*{\s*font-family:\s*([^,]+)/,
    );
    if (fontMonoMatch) {
      themeConfig.typography.fontMono = fontMonoMatch[1]
        .trim()
        .replace(/"/g, "");
    }

    const letterSpacingMatch = cssContent.match(
      /letter-spacing:\s*([\d.-]+)em/,
    );
    if (letterSpacingMatch) {
      themeConfig.typography.letterSpacing = parseFloat(letterSpacingMatch[1]);
    }

    // Extract colors from CSS variables
    const colorMappings = {
      primary: ["--primary", "--primary-foreground"],
      secondary: ["--secondary", "--secondary-foreground"],
      accent: ["--accent", "--accent-foreground"],
      base: ["--background", "--foreground"],
      card: ["--card", "--card-foreground"],
      popover: ["--popover", "--popover-foreground"],
      muted: ["--muted", "--muted-foreground"],
      destructive: ["--destructive", "--destructive-foreground"],
      border: ["--border", "--ring"],
      chart: ["--chart-1", "--chart-2"],
      sidebar: ["--sidebar", "--sidebar-foreground"],
    };

    Object.entries(colorMappings).forEach(
      ([category, [mainVar, foregroundVar]]) => {
        const mainMatch = cssContent.match(
          new RegExp(`${mainVar}:\\s*([^;]+)`),
        );
        const foregroundMatch = cssContent.match(
          new RegExp(`${foregroundVar}:\\s*([^;]+)`),
        );

        if (mainMatch) {
          themeConfig.colors[category].colors.main = mainMatch[1].trim();
        }
        if (foregroundMatch) {
          themeConfig.colors[category].colors.foreground =
            foregroundMatch[1].trim();
        }
      },
    );
  } catch (error) {
    console.error("Error parsing CSS:", error);
  }

  return themeConfig;
}
