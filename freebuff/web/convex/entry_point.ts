import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { getAuthUser } from "./users";
import { getVerifiedAccessProject } from "./project";

export const editEntryPoint = internalMutation({
  args: {
    entryPointId: v.id("entry_point"),
    project: v.optional(v.id("project")),
    type: v.optional(v.union(v.literal("page"))),
    associated_files: v.optional(v.array(v.string())),
    abstraction: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("processing"))),
    page: v.optional(
      v.object({
        page_title: v.optional(v.string()),
        page_display_url: v.optional(v.string()),
        page_file: v.optional(v.string()),
        navigation_paths: v.optional(
          v.array(
            v.object({
              navigation_path: v.string(),
              description: v.string(),
            }),
          ),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const updateData: Record<string, any> = {};

    if (args.project !== undefined) updateData.project = args.project;
    if (args.type !== undefined) updateData.type = args.type;
    if (args.associated_files !== undefined)
      updateData.associated_files = args.associated_files;
    if (args.abstraction !== undefined)
      updateData.abstraction = args.abstraction;
    if (args.status !== undefined) updateData.status = args.status;
    if (args.page !== undefined) updateData.page = args.page;

    await ctx.db.patch(args.entryPointId, updateData);
  },
});
export const getProjectEntryPoints = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("entry_point")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();
  },
});
export const getEntryPoint = internalQuery({
  args: {
    entryPointId: v.id("entry_point"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.entryPointId);
  },
});

export const deleteEntryPoint = mutation({
  args: {
    entryPointId: v.id("entry_point"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const ep = await ctx.db.get(args.entryPointId);
    if (!ep) return;

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      ep.project,
      "read",
      user,
    );
    if (!project) {
      throw new Error("Unauthorized");
    }
    if (ep.page?.page_display_url === "/") {
      throw new Error("Cannot delete landing page");
    }
    await ctx.db.delete(args.entryPointId);
  },
});

export const addFilesToContext = internalMutation({
  args: {
    entryPointId: v.id("entry_point"),
    filePaths: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const entryPoint = await ctx.db.get(args.entryPointId);
    if (!entryPoint) {
      throw new Error("Entry point not found");
    }

    await ctx.db.patch(args.entryPointId, {
      associated_files: [...entryPoint.associated_files, ...args.filePaths],
    });
  },
});

export const removeFilesFromContext = internalMutation({
  args: {
    entryPointId: v.id("entry_point"),
    filePaths: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const entryPoint = await ctx.db.get(args.entryPointId);
    if (!entryPoint) {
      throw new Error("Entry point not found");
    }

    await ctx.db.patch(args.entryPointId, {
      associated_files: entryPoint.associated_files.filter(
        (file) => !args.filePaths.includes(file),
      ),
    });
  },
});

export const editPageTitleOrRouteURL = mutation({
  args: {
    entryPointId: v.id("entry_point"),
    new_title: v.optional(v.string()),
    dynamic_data: v.optional(v.string()),
    resolved_display_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const entryPoint = await ctx.db.get(args.entryPointId);
    if (!entryPoint) {
      throw new Error("Entry point not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      entryPoint.project,
      "read",
      user,
    );
    if (!project) {
      throw new Error("Unauthorized");
    }
    if (entryPoint.page?.page_display_url === "/") {
      throw new Error("Cannot edit landing page");
    }

    if (!entryPoint.page) {
      throw new Error("Page data not found");
    }

    const page = entryPoint.page;
    const nextDisplay = args.dynamic_data
      ? args.dynamic_data
      : page.page_display_url;
    const nextResolved =
      args.resolved_display_url && args.resolved_display_url !== nextDisplay
        ? args.resolved_display_url
        : undefined;

    await ctx.db.patch(args.entryPointId, {
      page: {
        page_title: args.new_title ? args.new_title : page.page_title,
        page_display_url: nextDisplay,
        page_file: page.page_file,
        navigation_paths: page.navigation_paths,
        has_dynamic_params: nextDisplay ? /:[^/]+/.test(nextDisplay) : false,
        resolved_display_url: nextResolved,
      },
    });
  },
});

// Internal variant for system/agent calls (no user auth required)
export const editPageTitleOrRouteURLInternal = internalMutation({
  args: {
    entryPointId: v.id("entry_point"),
    new_title: v.optional(v.string()),
    dynamic_data: v.optional(v.string()),
    resolved_display_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entryPoint = await ctx.db.get(args.entryPointId);
    if (!entryPoint) {
      throw new Error("Entry point not found");
    }

    if (!entryPoint.page) {
      throw new Error("Page data not found");
    }

    const page = entryPoint.page;
    const nextDisplay = args.dynamic_data
      ? args.dynamic_data
      : page.page_display_url;
    const nextResolved =
      args.resolved_display_url && args.resolved_display_url !== nextDisplay
        ? args.resolved_display_url
        : undefined;

    await ctx.db.patch(args.entryPointId, {
      page: {
        page_title: args.new_title ? args.new_title : page.page_title,
        page_display_url: nextDisplay,
        page_file: page.page_file,
        navigation_paths: page.navigation_paths,
        has_dynamic_params: nextDisplay ? /:[^/]+/.test(nextDisplay) : false,
        resolved_display_url: nextResolved,
      },
    });
  },
});

export const updateEntryPointNavigationPaths = internalMutation({
  args: {
    entryPointId: v.id("entry_point"),
    navigationPaths: v.array(
      v.object({
        navigation_path: v.string(),
        description: v.string(),
        line_number: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const entryPoint = await ctx.db.get(args.entryPointId);
    if (!entryPoint) {
      throw new Error("Entry point not found");
    }

    if (!entryPoint.page) {
      throw new Error("Page data not found");
    }

    await ctx.db.patch(args.entryPointId, {
      page: {
        page_title: entryPoint.page.page_title,
        page_display_url: entryPoint.page.page_display_url,
        page_file: entryPoint.page.page_file,
        navigation_paths: args.navigationPaths,
        has_dynamic_params: entryPoint.page.has_dynamic_params,
      },
    });
  },
});

export const setEntryPointCanvasState = mutation({
  args: {
    entryPointId: v.id("entry_point"),
    canvasState: v.object({
      x: v.number(),
      y: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.entryPointId, {
      canvas_state: args.canvasState,
    });
  },
});
