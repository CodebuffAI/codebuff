import {
  mutation,
  query,
  internalAction,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getAuthUser } from "./users";
import { getVerifiedAccessProject } from "./project";

// Validator for preset category
const categoryValidator = v.union(v.literal("theme"), v.literal("component"));
const UI_PRESET_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedSearchPreset = {
  _id: string;
  title: string;
  description: string;
  category: "theme" | "component";
  tags: string[];
  keywords?: string[];
  titleLower: string;
  descriptionLower: string;
  tagsLower: string[];
  keywordsLower: string[];
};

let cachedSearchPresets:
  | {
      expiresAt: number;
      presets: CachedSearchPreset[];
    }
  | undefined;

function invalidateUiPresetSearchCache() {
  cachedSearchPresets = undefined;
}

// Get a single UI preset by ID
export const getUiPresetById = query({
  args: {
    presetId: v.id("ui_preset"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.presetId);
  },
});

// Get all UI presets (library) with server-side pagination
// Filters by category (theme/component) and visibility
// Optimized: Only fetches user if needed (for god mode check)
export const getUiPresets = query({
  args: {
    category: v.optional(categoryValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Fast path: Check identity first without full user fetch
    const identity = await ctx.auth.getUserIdentity();

    // For god mode, we need to fetch the user
    // But for regular users, we can skip this expensive operation
    let isGod = false;
    if (identity) {
      // Only fetch user if we need to check god status
      // Use direct DB query instead of runQuery for better performance
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
      isGod = user?.role === "god";
    }

    // Build the query based on category and user role
    if (args.category) {
      // Filter by category
      if (isGod) {
        // God users see all presets in category
        return await ctx.db
          .query("ui_preset")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .order("desc")
          .paginate(args.paginationOpts);
      } else {
        // Regular users only see public presets in category
        return await ctx.db
          .query("ui_preset")
          .withIndex("by_category_and_public", (q) =>
            q.eq("category", args.category!).eq("public", true),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }
    } else {
      // No category filter - get all presets
      if (isGod) {
        return await ctx.db
          .query("ui_preset")
          .withIndex("by_last_updated")
          .order("desc")
          .paginate(args.paginationOpts);
      } else {
        return await ctx.db
          .query("ui_preset")
          .withIndex("by_public", (q) => q.eq("public", true))
          .order("desc")
          .paginate(args.paginationOpts);
      }
    }
  },
});

// Get UI presets added to a specific project
export const getProjectUiPresets = query({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify project access and get project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) throw new Error("Project not found");

    // Get project-preset associations
    const projectPresets = await ctx.db
      .query("project_ui_preset")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    // Get full preset details
    const presets = await Promise.all(
      projectPresets.map(async (pp) => {
        const preset = await ctx.db.get(pp.uiPresetId);
        return preset;
      }),
    );

    return presets.filter((p): p is NonNullable<typeof p> => p !== null);
  },
});

// Add a UI preset to a project
export const addUiPresetToProject = mutation({
  args: {
    semanticIdentifier: v.string(),
    uiPresetId: v.id("ui_preset"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify project access and get project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) throw new Error("Project not found");

    // Check if preset exists
    const preset = await ctx.db.get(args.uiPresetId);
    if (!preset) throw new Error("UI Preset not found");

    // Check if preset is already added to project
    const existing = await ctx.db
      .query("project_ui_preset")
      .withIndex("by_project_and_preset", (q) =>
        q.eq("projectId", project._id).eq("uiPresetId", args.uiPresetId),
      )
      .unique();

    if (existing) {
      throw new Error("UI Preset already added to project");
    }

    // Add preset to project
    await ctx.db.insert("project_ui_preset", {
      projectId: project._id,
      uiPresetId: args.uiPresetId,
    });

    return true;
  },
});

// Remove a UI preset from a project
export const removeUiPresetFromProject = mutation({
  args: {
    semanticIdentifier: v.string(),
    uiPresetId: v.id("ui_preset"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify project access and get project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) throw new Error("Project not found");

    // Find and delete the project-preset association
    const projectPreset = await ctx.db
      .query("project_ui_preset")
      .withIndex("by_project_and_preset", (q) =>
        q.eq("projectId", project._id).eq("uiPresetId", args.uiPresetId),
      )
      .unique();

    if (!projectPreset) {
      throw new Error("UI Preset not found in project");
    }

    await ctx.db.delete(projectPreset._id);
    return true;
  },
});

// God mode: Create a new UI preset
export const createUiPreset = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    category: categoryValidator,
    source_url: v.string(),
    tags: v.array(v.string()),
    keywords: v.optional(v.array(v.string())), // Use-case oriented search terms
    public: v.boolean(),
    code: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "god") throw new Error("Not authorized");

    const presetId = await ctx.db.insert("ui_preset", {
      ...args,
      last_updated: Date.now(),
    });
    invalidateUiPresetSearchCache();

    return presetId;
  },
});

// God mode: Update an existing UI preset
export const updateUiPreset = mutation({
  args: {
    presetId: v.id("ui_preset"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(categoryValidator),
    source_url: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())), // Use-case oriented search terms
    public: v.optional(v.boolean()),
    code: v.optional(v.string()),
    prompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "god") throw new Error("Not authorized");

    const { presetId, ...updates } = args;

    // Filter out undefined values
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    // Always update last_updated timestamp
    updateData.last_updated = Date.now();

    await ctx.db.patch(presetId, updateData);
    invalidateUiPresetSearchCache();
    return await ctx.db.get(presetId);
  },
});

// God mode: Delete a UI preset
export const deleteUiPreset = mutation({
  args: {
    presetId: v.id("ui_preset"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "god") throw new Error("Not authorized");

    // Delete all project associations first
    const projectPresets = await ctx.db
      .query("project_ui_preset")
      .withIndex("by_ui_preset", (q) => q.eq("uiPresetId", args.presetId))
      .collect();

    for (const pp of projectPresets) {
      await ctx.db.delete(pp._id);
    }

    // Then delete the preset
    await ctx.db.delete(args.presetId);
    invalidateUiPresetSearchCache();
    return true;
  },
});

const loadSearchPresets = async (ctx: any): Promise<CachedSearchPreset[]> => {
  if (cachedSearchPresets && cachedSearchPresets.expiresAt > Date.now()) {
    return cachedSearchPresets.presets;
  }

  const presets = await ctx.runQuery(internal.uiPresets.getUiPresetSearchData);
  const normalized = presets.map((preset: any) => ({
    _id: preset._id,
    title: preset.title,
    description: preset.description,
    category: preset.category,
    tags: preset.tags ?? [],
    keywords: preset.keywords ?? [],
    titleLower: preset.title.toLowerCase(),
    descriptionLower: preset.description.toLowerCase(),
    tagsLower: (preset.tags ?? []).map((tag: string) => tag.toLowerCase()),
    keywordsLower: (preset.keywords ?? []).map((kw: string) =>
      kw.toLowerCase(),
    ),
  }));

  cachedSearchPresets = {
    expiresAt: Date.now() + UI_PRESET_SEARCH_CACHE_TTL_MS,
    presets: normalized,
  };

  return normalized;
};

/** Search metadata only — code/prompt are loaded on demand via getUiPresetContent. */
export const getUiPresetSearchData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("ui_preset").collect();
    return rows.map((preset) => ({
      _id: preset._id,
      title: preset.title,
      description: preset.description,
      category: preset.category,
      tags: preset.tags ?? [],
      keywords: preset.keywords ?? [],
    }));
  },
});

// Internal action for AI agent tool - search UI presets by keyword with regex + threshold scoring
export const searchUiPresetsInternal = internalAction({
  args: {
    searchQuery: v.string(),
    category: v.optional(v.union(v.literal("theme"), v.literal("component"))),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.maxResults ?? 3;
    const searchTerms = args.searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const presets = (await loadSearchPresets(ctx)).filter(
      (preset) => !args.category || preset.category === args.category,
    );

    // Score using REGEX + THRESHOLD for accurate word boundary matching
    const scoredPresets = presets.map((preset) => {
      let score = 0;

      for (const term of searchTerms) {
        // Escape special regex characters in search term
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Use word boundary regex for accurate matching
        // Matches "card" but not "discard", "button" but not "buttons" issue
        const exactRegex = new RegExp(`\\b${escapedTerm}\\b`, "i");
        const partialRegex = new RegExp(escapedTerm, "i");

        // Keywords: exact match = 15pts, partial = 10pts
        if (preset.keywordsLower.some((kw) => exactRegex.test(kw))) score += 15;
        else if (preset.keywordsLower.some((kw) => partialRegex.test(kw)))
          score += 10;

        // Title: exact match = 15pts, partial = 10pts
        if (exactRegex.test(preset.titleLower)) score += 15;
        else if (partialRegex.test(preset.titleLower)) score += 10;

        // Tags: exact match = 15pts, partial = 10pts (equal to keywords)
        if (preset.tagsLower.some((tag) => exactRegex.test(tag))) score += 15;
        else if (preset.tagsLower.some((tag) => partialRegex.test(tag)))
          score += 10;

        // Description: exact match = 8pts, partial = 5pts
        if (exactRegex.test(preset.descriptionLower)) score += 8;
        else if (partialRegex.test(preset.descriptionLower)) score += 5;
      }
      return { preset, score };
    });

    return scoredPresets
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ preset, score }) => ({
        _id: preset._id,
        title: preset.title,
        description: preset.description,
        category: preset.category,
        tags: preset.tags,
        keywords: preset.keywords,
        score,
      }));
  },
});

// Internal query to get full preset content (code + prompt) by ID
// Used as step 2 after searchUiPresetsInternal returns lightweight results
export const getUiPresetContent = internalQuery({
  args: {
    presetId: v.id("ui_preset"),
  },
  handler: async (ctx, args) => {
    const preset = await ctx.db.get(args.presetId);
    if (!preset) return null;
    return {
      _id: preset._id,
      title: preset.title,
      code: preset.code,
      prompt: preset.prompt,
    };
  },
});

// ============================================
// Internal functions for keyword generation
// ============================================

// Internal query to get a preset by ID
export const getPresetById = internalQuery({
  args: {
    presetId: v.id("ui_preset"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.presetId);
  },
});

// Internal mutation to update preset keywords
export const updatePresetKeywords = internalMutation({
  args: {
    presetId: v.id("ui_preset"),
    keywords: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.presetId, {
      keywords: args.keywords,
      last_updated: Date.now(),
    });
    invalidateUiPresetSearchCache();
  },
});

// Internal query to get all presets without keywords
export const getPresetsWithoutKeywords = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allPresets = await ctx.db.query("ui_preset").collect();
    return allPresets.filter((p) => !p.keywords || p.keywords.length === 0);
  },
});
