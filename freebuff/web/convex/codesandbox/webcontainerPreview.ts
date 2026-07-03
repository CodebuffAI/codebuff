import { v } from "convex/values";

import { getVerifiedAccessProject } from "!/project";
import { getAuthUser } from "!/users";
import { mutation } from "../_generated/server";

const WEBCONTAINER_SANDBOX_PREFIX = "webcontainer:";

export const setWebContainerPreviewUrl = mutation({
  args: {
    semanticIdentifier: v.string(),
    previewUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Authentication required.");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) {
      throw new Error("Project not found or access denied.");
    }

    if (!project.sandbox_id.startsWith(WEBCONTAINER_SANDBOX_PREFIX)) {
      throw new Error("Not a WebContainer-backed project.");
    }

    await ctx.db.patch(project._id, {
      preview_url: args.previewUrl,
    });
  },
});
