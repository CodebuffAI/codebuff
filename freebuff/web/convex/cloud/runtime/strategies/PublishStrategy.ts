"use node";

import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";

export interface PublishStrategy {
  publish(ctx: ActionCtx, projectId: Id<"project">): Promise<void>;
}
