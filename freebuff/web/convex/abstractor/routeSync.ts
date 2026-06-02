import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const createEntryPoint = internalMutation({
  args: {
    project_id: v.id("project"),
    file_path: v.string(),
    new_route: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if entry point already exists for this file
    const existing = await ctx.db
      .query("entry_point")
      .withIndex("by_project", (q) => q.eq("project", args.project_id))
      .filter((q) => q.eq(q.field("page.page_file"), args.file_path))
      .first();

    if (existing) {
      // Entry point already exists, skip creation
      return;
    }

    const computeTitleFromRouteOrFile = (route: string, filePath: string) => {
      if (route === "/") return "Home";
      if (route === "*") return "404 Not Found";
      const segments = route.split("/").filter(Boolean);
      const lastSegRaw = segments[segments.length - 1] || "Page";
      if (lastSegRaw === "*") return "404 Not Found";
      const dynamic = lastSegRaw.startsWith(":");
      const candidate = dynamic
        ? // If last segment is dynamic (:id, :postId), prefer the previous segment (e.g., "posts").
          segments.length > 1
          ? segments[segments.length - 2]
          : null
        : lastSegRaw;

      const baseFromFile = filePath
        .replace(/^.*\/(.*)\.(tsx|jsx|ts|js)$/i, "$1")
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2");

      const src =
        candidate && !candidate.startsWith(":") ? candidate : baseFromFile;

      return src
        .replace(/[-_]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    };

    const computedTitle = computeTitleFromRouteOrFile(
      args.new_route,
      args.file_path,
    );
    const entryPointId = await ctx.db.insert("entry_point", {
      project: args.project_id,
      type: "page",
      associated_files: [args.file_path],
      abstraction: "",
      status: "active",
      page: {
        page_title: computedTitle,
        page_display_url: args.new_route,
        has_dynamic_params: /:[^/]+/.test(args.new_route),
        page_file: args.file_path,
        navigation_paths: [],
      },
    });
    void entryPointId;

    // Temporarily disabled while documentation agent is under maintence.
    // await ctx.scheduler.runAfter(0, internal.abstractor.agent.abstractorAgent, {
    //   project: args.project_id,
    //   entry_point_id: entryPointId,
    // });
  },
});
