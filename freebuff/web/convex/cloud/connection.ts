"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { getAuthUser } from "../users";
import { getVerifiedAccessProject } from "../project";
import { CloudConnectionRuntimeService } from "./runtime/services/CloudConnectionRuntimeService";
import { DaytonaConnectionStrategy } from "./runtime/strategies/daytona/DaytonaConnectionStrategy";

export const verifyProjectAccessAndConnect = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not authenticated");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found or access denied");
    }

    const connectionService = new CloudConnectionRuntimeService(
      ctx,
      new DaytonaConnectionStrategy(),
    );
    await connectionService.verifyAccessAndConnect(project._id);

    return null;
  },
});
