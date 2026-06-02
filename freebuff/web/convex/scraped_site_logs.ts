import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Create a new scraped site log entry
 */
export const create = internalMutation({
  args: {
    url: v.string(),
    raw_content: v.string(),
    cleaned_content: v.string(),
    date: v.number(),
    project: v.id("project"),
  },
  async handler(ctx, args) {
    const { url, raw_content, cleaned_content, date, project } = args;

    // Create a new entry in the scraped_site_logs table
    const id = await ctx.db.insert("scraped_site_logs", {
      url,
      raw_content,
      cleaned_content,
      date,
      project,
    });

    return id;
  },
});
